/**
 * Profession → color mapping utility.
 *
 * The Google Sheet has a `Profession` column. We collect the distinct values,
 * map each to a deterministic color from a built-in palette, and return the
 * map so the UI can color markers and render a legend.
 *
 * Determinism: the same set of professions (in insertion order) always maps
 * to the same colors. This means re-renders on the same data don't reshuffle
 * marker colors.
 */

export type ColorMap = Record<string, string>;

export type ExtractProfessionsOptions = {
  /** Column name in the sheet that holds the profession value. Default: "Profession". */
  columnName?: string;
  /** Treat the value as case-insensitive when deduping. Default: true. */
  caseInsensitive?: boolean;
};

/**
 * Collect distinct profession values from rows in insertion order (the order
 * the rows appear in the sheet).
 *
 * Empty / whitespace values are skipped. If `caseInsensitive` is true, values
 * are deduped by lowercased form but the FIRST occurrence's casing is kept.
 */
export function extractProfessions<Data extends Record<string, string>>(
  rows: readonly Data[],
  opts: ExtractProfessionsOptions = {},
): string[] {
  const column = opts.columnName ?? "Profession";
  const caseInsensitive = opts.caseInsensitive ?? true;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const raw = row[column];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const key = caseInsensitive ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Map each profession to a color from the built-in palette. If there are more
 * professions than palette entries, the palette cycles.
 *
 * Returns a Record<profession, hex>. The first profession in the input gets
 * the first palette entry, the second gets the second, etc.
 */
export function buildColorMap(
  professions: readonly string[],
  palette: readonly string[] = DEFAULT_PALETTE,
): ColorMap {
  const out: ColorMap = {};
  for (let i = 0; i < professions.length; i++) {
    out[professions[i]] = palette[i % palette.length];
  }
  return out;
}

/**
 * Look up a color for a profession. Returns the fallback for unknown or
 * empty profession values (e.g. rows where `Profession` is blank).
 */
export function colorFor(
  colorMap: ColorMap,
  profession: string | undefined | null,
  fallback: string = FALLBACK_COLOR,
): string {
  if (!profession) return fallback;
  const trimmed = profession.trim();
  if (trimmed.length === 0) return fallback;
  return colorMap[trimmed] ?? colorMap[trimmed.toLowerCase()] ?? fallback;
}

/**
 * Default palette of 12 distinct, accessible colors. Chosen for reasonable
 * contrast against both light and dark map tiles.
 */
export const DEFAULT_PALETTE: readonly string[] = [
  "#1d4ed8", // blue-700
  "#b91c1c", // red-700
  "#15803d", // green-700
  "#7c3aed", // violet-600
  "#c2410c", // orange-700
  "#0e7490", // cyan-700
  "#a16207", // yellow-700
  "#be185d", // pink-700
  "#0f766e", // teal-700
  "#4338ca", // indigo-700
  "#365314", // lime-800
  "#92400e", // amber-800
];

/** Color used when a row has no Profession (or an unknown one). */
export const FALLBACK_COLOR = "#525252"; // neutral-600