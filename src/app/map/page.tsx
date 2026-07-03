import { getSheetRows, type SheetRow } from "@/lib/google/sheet";
import {
  computeBounds,
  mapRowsWithCoordinates,
  type MappedRow,
} from "@/lib/geo/coordinates";
import {
  buildColorMap,
  colorFor,
  extractProfessions,
  FALLBACK_COLOR,
  type ColorMap,
} from "@/lib/geo/professions";
import MapClient, { type LegendEntry } from "./MapClient";

export const dynamic = "force-dynamic"; // always re-fetch on each request

/**
 * /map — visualize the rows of the Google Sheet that have valid GPS
 * coordinates in their "Map Coordinates" column.
 *
 * Pipeline:
 *   1. Read the sheet via the Google Sheets API (service-account JWT).
 *   2. Filter to rows whose "Map Coordinates" parses as `lat,lng`.
 *   3. Extract distinct Profession values → build a color map.
 *   4. Hand markers (with per-row colors) + a legend to MapClient.
 *   5. MapClient renders Leaflet markers; clicking opens a bottom sheet
 *      showing the row's data.
 */
export default async function MapPage() {
  const result = await getSheetRows<SheetRow>();

  if (!result.ok) {
    return <ErrorPanel message={result.message} />;
  }

  const totalRows = result.data.length;
  const mapped: MappedRow<SheetRow>[] = mapRowsWithCoordinates(result.data);

  if (mapped.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          No rows with valid coordinates found.
          {totalRows > 0
            ? ` Scanned ${totalRows} ${totalRows === 1 ? "row" : "rows"}; check that the "Map Coordinates" column contains strings like "23.8103,90.4125".`
            : " The sheet is empty."}
        </p>
      </main>
    );
  }

  // Extract distinct professions and build a deterministic color map.
  const professions = extractProfessions(mapped.map((r) => r.data));
  const colorMap: ColorMap = buildColorMap(professions);

  // Build markers with per-row color and the rest of the row's data.
  // colorFor() handles case-insensitive lookup so a row whose `Profession`
  // uses different casing than the canonical first occurrence still maps
  // to the same color as the legend.
  const markers = mapped.map((row, idx) => ({
    id: String(idx),
    coordinates: row.coordinates,
    color: colorFor(colorMap, row.data["Profession"], FALLBACK_COLOR),
    profession: (row.data["Profession"] ?? "").trim(),
    data: row.data,
  }));

  // Build legend entries in the same order as `professions`, with counts.
  // countFor() does case-insensitive lookup so it always matches colorFor().
  const counts = new Map<string, number>();
  for (const row of mapped) {
    const p = (row.data["Profession"] ?? "").trim();
    if (!p) continue;
    const key = p.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const legend: LegendEntry[] = professions.map((p) => ({
    profession: p,
    color: colorMap[p],
    count: counts.get(p.toLowerCase()) ?? 0,
  }));

  const bounds = computeBounds(mapped.map((r) => r.coordinates));

  // Headers for the data columns — used by the raw-data table below the map.
  const dataColHeaders = Object.keys(mapped[0].data);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {mapped.length}{" "}
          {mapped.length === 1 ? "marker" : "markers"}
          {bounds
            ? ` · view: ${bounds.southWest.lat.toFixed(4)}, ${bounds.southWest.lng.toFixed(
                4,
              )} → ${bounds.northEast.lat.toFixed(4)}, ${bounds.northEast.lng.toFixed(4)}`
            : null}
        </p>
      </header>

      <MapClient markers={markers} legend={legend} />

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">
          Show raw data ({mapped.length} {mapped.length === 1 ? "row" : "rows"})
        </summary>
        {/* Horizontally scrollable table.
            - Wrapper uses `contain: inline-size` to isolate its width from
              its content's intrinsic size. Without this, the table's
              intrinsic min-content (sum of `min-w-[X]` per cell) could push
              the wrapper wider, which would in turn push `<main>` wider and
              change the map's width above.
            - `overflow-x: auto` + `max-w-full` + `min-w-0` then provide a
              local scrollbar inside the wrapper, leaving the surrounding
              layout untouched.
            - Each cell keeps `min-w-[X]` so the table can grow to the width
              its content needs, scrolling horizontally inside the wrapper. */}
        <div
          className="mt-4 max-w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
          style={{ contain: "inline-size" }}
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th
                  scope="col"
                  className="min-w-[6rem] whitespace-nowrap px-3 py-2 font-medium"
                >
                  lat
                </th>
                <th
                  scope="col"
                  className="min-w-[6rem] whitespace-nowrap px-3 py-2 font-medium"
                >
                  lng
                </th>
                {dataColHeaders.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="min-w-[12rem] whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {mapped.map((row, idx) => (
                <tr
                  key={idx}
                  className="bg-white dark:bg-zinc-950"
                >
                  <td className="min-w-[6rem] whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.coordinates.lat}
                  </td>
                  <td className="min-w-[6rem] whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.coordinates.lng}
                  </td>
                  {Object.values(row.data).map((v, i) => (
                    <td
                      key={i}
                      className="min-w-[12rem] whitespace-nowrap px-3 py-2 align-top text-zinc-800 dark:text-zinc-200"
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
      >
        <p className="font-medium">Could not read the Google Sheet.</p>
        <p className="mt-2 text-sm">{message}</p>
        <p className="mt-4 text-xs text-red-800/70 dark:text-red-200/70">
          Check that <code>.env</code> contains valid{" "}
          <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_PRIVATE_KEY</code>, and{" "}
          <code>GOOGLE_SHEET_ID</code>, and that the sheet is shared with the
          service account email. See <code>.env.example</code>.
        </p>
      </div>
    </main>
  );
}