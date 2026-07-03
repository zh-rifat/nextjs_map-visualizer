/**
 * Coordinate parser for the sheet reader.
 *
 * The Google Sheet has a "Map Coordinates" column where each row stores GPS
 * coordinates as a single string in the format `lat,lng` (e.g. `23.8103,90.4125`).
 * This module:
 *   1. Parses the string into { lat, lng } numbers.
 *   2. Validates them (lat ∈ [-90, 90], lng ∈ [-180, 180], both finite).
 *   3. Filters out rows whose coordinates can't be parsed or are out of range.
 *   4. Returns a new array of { coordinates, data } where:
 *        - `coordinates` is { lat: number, lng: number }.
 *        - `data` is the original row with the coordinate field stripped.
 *
 * The original column name is configurable so this works for any sheet that
 * uses a different header (e.g. "Coordinates", "Lat,Lng").
 */

export type LatLng = { lat: number; lng: number };

export type MappedRow<Data extends Record<string, string>> = {
  coordinates: LatLng;
  /**
   * The original row with the coordinate column stripped.
   *
   * When `columnName` is the default ("Map Coordinates"), this is
   * `Omit<Data, "Map Coordinates">`. When a different column name is used,
   * the row is left as-is (TypeScript can't statically prove which key was
   * stripped), but the runtime value is still correct.
   */
  data: Data;
};

export type ParseCoordinatesOptions = {
  /** Column name in the sheet that holds the "lat,lng" string. Default: "Map Coordinates". */
  columnName?: string;
};

/**
 * Parse a "lat,lng" string into { lat, lng } numbers, or return null if invalid.
 *
 * Accepts:
 *   - "23.8103,90.4125"
 *   - "23.8103, 90.4125"       (whitespace tolerated)
 *   - "23.8103 , 90.4125"
 *   - "23.8103,90.4125\n"     (trailing whitespace)
 *   - "+23.8103,-90.4125"     (signs)
 *
 * Rejects:
 *   - "" or whitespace-only
 *   - "abc,def"
 *   - "23.8103"               (only one number)
 *   - "23.8103,90.4125,extra" (too many parts)
 *   - Anything where lat ∉ [-90, 90] or lng ∉ [-180, 180].
 *   - NaN / Infinity.
 */
export function parseLatLng(input: string | undefined | null): LatLng | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const parts = trimmed.split(",");
  if (parts.length !== 2) return null;

  const latStr = parts[0].trim();
  const lngStr = parts[1].trim();

  // Number("") is 0 — reject explicitly to avoid silently accepting bad input.
  if (latStr.length === 0 || lngStr.length === 0) return null;

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/**
 * Filter and reshape a list of rows from the sheet reader into mapped rows.
 * Rows with missing or invalid coordinates are dropped.
 */
export function mapRowsWithCoordinates<Data extends Record<string, string>>(
  rows: readonly Data[],
  opts: ParseCoordinatesOptions = {},
): MappedRow<Data>[] {
  const column = opts.columnName ?? "Map Coordinates";
  const out: MappedRow<Data>[] = [];
  for (const row of rows) {
    const coordinates = parseLatLng(row[column]);
    if (!coordinates) continue;
    // Strip the coordinate column from the data we return. The resulting
    // shape is narrower than `Data`, but at runtime it's correct: every
    // property except `column` is preserved.
    const { [column]: _stripped, ...rest } = row;
    void _stripped;
    out.push({ coordinates, data: rest as unknown as Data });
  }
  return out;
}

/**
 * Compute a [southWest, northEast] bounding box that contains all the given
 * coordinates. Returns null when given an empty array.
 *
 * Useful for centering + setting Leaflet's initial view to fit all markers.
 */
export function computeBounds(
  points: readonly LatLng[],
): { southWest: LatLng; northEast: LatLng } | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return {
    southWest: { lat: minLat, lng: minLng },
    northEast: { lat: maxLat, lng: maxLng },
  };
}