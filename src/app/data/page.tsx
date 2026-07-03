import { getSheetRows, type SheetRow } from "@/lib/google/sheet";

export const dynamic = "force-dynamic"; // always re-fetch on each request

/**
 * Generic Google Sheet viewer.
 *
 * Reads the sheet configured by GOOGLE_SHEET_ID (and optional
 * GOOGLE_SHEET_RANGE) and renders the rows as an HTML table.
 *
 * The first row of the sheet is treated as the header row. Column order
 * in the rendered table matches the header order in the sheet.
 */
export default async function DataPage() {
  const result = await getSheetRows<SheetRow>();

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Google Sheet data
        </h1>
        <div
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-medium">Could not read the Google Sheet.</p>
          <p className="mt-2 text-sm">{result.message}</p>
          <p className="mt-4 text-xs text-red-800/70 dark:text-red-200/70">
            Check that <code>.env</code> contains valid{" "}
            <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_PRIVATE_KEY</code> and{" "}
            <code>GOOGLE_SHEET_ID</code>, and that the sheet is shared with the
            service account email. See <code>.env.example</code>.
          </p>
        </div>
      </main>
    );
  }

  // Narrowed to SheetReaderSuccess after the `!result.ok` guard above.
  const success = result;
  const data = success.data;
  const headers = success.headers;
  const sheetId = success.sheetId;
  const range = success.range;
  const cachedAt = success.cachedAt;

  if (headers.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Google Sheet data
        </h1>
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          The sheet appears to be empty.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Google Sheet data
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sheet ID:{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-900">
            {sheetId}
          </code>
          {" · "}Range:{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-900">
            {range}
          </code>
          {" · "}
          {data.length} {data.length === 1 ? "row" : "rows"}
          {cachedAt ? (
            <>
              {" · "}cached{" "}
              <time
                dateTime={new Date(cachedAt).toISOString()}
                className="font-mono text-xs"
              >
                {new Date(cachedAt).toLocaleTimeString()}
              </time>
            </>
          ) : null}
        </p>
      </header>

      {data.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          No data rows found. The sheet has a header row but no data underneath.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                {headers.map((h, idx) => (
                  <th
                    key={`${h}-${idx}`}
                    scope="col"
                    className="min-w-[8rem] max-w-[20rem] break-words px-4 py-3 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {data.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  {headers.map((h, colIdx) => (
                    <td
                      key={`${rowIdx}-${h}-${colIdx}`}
                      className="min-w-[8rem] max-w-[20rem] break-words px-4 py-3 align-top text-zinc-800 dark:text-zinc-200"
                    >
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}