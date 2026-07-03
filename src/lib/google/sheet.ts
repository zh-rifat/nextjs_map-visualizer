/**
 * Google Sheet reader (server-side).
 *
 * Reads a Google Sheet using a service-account JWT signed with Node's built-in
 * `crypto` (no extra npm dependencies), and returns its rows as typed objects
 * keyed by the sheet's header row.
 *
 * Required env vars (see .env.example):
 *   GOOGLE_CLIENT_ID   — the service account's `client_email`
 *                        (looks like "my-sa@my-project.iam.gserviceaccount.com").
 *                        IMPORTANT: this is the SERVICE ACCOUNT EMAIL, not the
 *                        numeric OAuth client ID. It is used as the JWT `iss`.
 *   GOOGLE_PRIVATE_KEY — the service account's `private_key` (RSA, PEM format).
 *                        Newlines in the key are OK; paste them in as `\n`
 *                        literals and this module will normalize them.
 *   GOOGLE_SHEET_ID    — the spreadsheet ID (the long ID in the sheet URL
 *                        between /d/ and /edit).
 *
 * Optional env vars:
 *   GOOGLE_SHEET_RANGE — default range to fetch, e.g. "Sheet1!A1:Z".
 *                        Defaults to "A1:Z" which reads the first tab.
 *
 * Usage:
 *   import { loadSheet } from "@/lib/google/sheet";
 *   type Row = { name: string; email: string };
 *   const rows = await loadSheet<Row>();
 *   // rows: Row[]
 *
 *   // Or use the non-throwing variant:
 *   import { getSheetRows } from "@/lib/google/sheet";
 *   const result = await getSheetRows<Row>();
 *   if (!result.ok) return <div>Error: {result.message}</div>;
 */

import crypto from "node:crypto";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type SheetRow = Record<string, string>;

export type GetSheetOptions = {
  /**
   * A1 notation for the range to fetch, e.g. "Sheet1!A1:Z" or "Users!A1:D".
   * Defaults to the value of `GOOGLE_SHEET_RANGE` env var, or "A1:Z".
   */
  range?: string;
  /**
   * Override the in-memory cache TTL (milliseconds). `0` disables caching.
   * Defaults to 5 minutes.
   */
  cacheTtlMs?: number;
  /**
   * Next.js fetch revalidation (seconds). Pass `0` for "always fresh".
   * Only used inside Next.js (App Router).
   */
  revalidate?: number;
  /**
   * Next.js fetch cache tags for `revalidateTag()`.
   */
  tags?: string[];
};

export type SheetReaderError = {
  ok: false;
  status: number;
  message: string;
  cause?: unknown;
};

export type SheetReaderSuccess<T extends SheetRow> = {
  ok: true;
  data: T[];
  /** Raw 2-D array (header + rows) — useful for debugging. */
  raw: string[][];
  /** Headers in the order they appear in the sheet. */
  headers: string[];
  /** Range that was fetched. */
  range: string;
  /** Sheet ID that was fetched. */
  sheetId: string;
  /** When this result was cached (epoch ms). `undefined` if caching was disabled. */
  cachedAt?: number;
};

export type SheetReaderResult<T extends SheetRow> =
  | SheetReaderSuccess<T>
  | SheetReaderError;

// -----------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { expiresAt: number; result: SheetReaderSuccess<SheetRow> };
const cache = new Map<string, CacheEntry>();

function cacheGet<T extends SheetRow>(key: string): SheetReaderSuccess<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result as SheetReaderSuccess<T>;
}

function cacheSet(key: string, result: SheetReaderSuccess<SheetRow>): void {
  cache.set(key, { expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS, result });
}

// -----------------------------------------------------------------------------
// Env helpers
// -----------------------------------------------------------------------------

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(
      `Missing env var ${name}. See .env.example for setup instructions.`,
    );
  }
  return v;
}

/**
 * Normalize a PEM private key from .env. Many tutorials ask users to paste
 * the key with literal `\n` characters instead of real newlines (because
 * .env files are single-line per key). Replace those with real newlines.
 */
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

// -----------------------------------------------------------------------------
// JWT + token minting
// -----------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

/** Base64url-encode a string or Buffer (no padding). */
function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(message: string, privateKey: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer
    .sign(privateKey, "base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Mint a Google API access token for the configured service account.
 * Caches the token in-process until ~5 min before expiry.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const clientEmail = readEnv("GOOGLE_CLIENT_ID");
  const privateKey = normalizePrivateKey(readEnv("GOOGLE_PRIVATE_KEY"));

  const iat = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: SCOPES.join(" "),
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signature = signJwt(signingInput, privateKey);
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to mint Google access token (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    // Cache until 5 minutes before actual expiry to avoid edge cases.
    expiresAt: now + (data.expires_in - 300) * 1000,
  };
  return data.access_token;
}

// -----------------------------------------------------------------------------
// Sheets API call
// -----------------------------------------------------------------------------

async function fetchSheetValues(
  sheetId: string,
  range: string,
  opts: GetSheetOptions,
): Promise<string[][]> {
  const token = await getAccessToken();
  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    headers: { Authorization: `Bearer ${token}` },
  };
  if (opts.revalidate !== undefined || opts.tags) {
    init.next = {
      ...(opts.revalidate !== undefined ? { revalidate: opts.revalidate } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    };
  }
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(
    range,
  )}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Sheets API request failed (${res.status} ${res.statusText}): ${text}. ` +
        `Verify that GOOGLE_SHEET_ID is correct and that the sheet is shared with the service account email.`,
    );
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

function rowsToObjects<T extends SheetRow>(raw: string[][]): {
  data: T[];
  headers: string[];
} {
  if (raw.length === 0) return { data: [], headers: [] };
  const headers = raw[0].map((h) => h.trim());
  const data: T[] = raw.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (row[i] ?? "").trim();
    }
    return obj as T;
  });
  return { data, headers };
}

// -----------------------------------------------------------------------------
// Main reader
// -----------------------------------------------------------------------------

function resolveRange(opts: GetSheetOptions): string {
  if (opts.range && opts.range.length > 0) return opts.range;
  const envRange = process.env.GOOGLE_SHEET_RANGE;
  if (envRange && envRange.length > 0) return envRange;
  return "A1:Z";
}

/**
 * Fetch and parse a Google Sheet.
 *
 * @example
 *   type Row = { name: string; email: string };
 *   const { data } = await getSheetRows<Row>();
 */
export async function getSheetRows<T extends SheetRow = SheetRow>(
  opts: GetSheetOptions = {},
): Promise<SheetReaderResult<T>> {
  let sheetId: string;
  let range: string;
  let raw: string[][];
  try {
    sheetId = readEnv("GOOGLE_SHEET_ID");
    range = resolveRange(opts);
    raw = await fetchSheetValues(sheetId, range, opts);
  } catch (err) {
    return { ok: false, status: 0, message: (err as Error).message, cause: err };
  }

  const { data, headers } = rowsToObjects<T>(raw);
  const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cacheKey = `${sheetId}|${range}`;
  const success: SheetReaderSuccess<T> = {
    ok: true,
    data,
    raw,
    headers,
    range,
    sheetId,
    cachedAt: ttl > 0 ? Date.now() : undefined,
  };
  if (ttl > 0) {
    cacheSet(cacheKey, success as SheetReaderSuccess<SheetRow>);
  }
  return success;
}

/**
 * Convenience: throw on error, otherwise return the data array.
 *
 * @example
 *   const rows = await loadSheet<MyRow>();
 */
export async function loadSheet<T extends SheetRow = SheetRow>(
  opts: GetSheetOptions = {},
): Promise<T[]> {
  const result = await getSheetRows<T>(opts);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

/**
 * Clear the in-memory cache. Mostly useful for tests and dev tooling.
 */
export function clearSheetCache(): void {
  cache.clear();
  cachedToken = null;
}