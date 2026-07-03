"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

import type { LatLng } from "@/lib/geo/coordinates";

export type MapMarker = {
  id: string;
  coordinates: LatLng;
  /** Hex color for this marker's pin, derived from the row's Profession. */
  color: string;
  /**
   * The marker row's Profession value (the same key the Legend is keyed by).
   * Empty string when the row has no Profession. Used for legend-based
   * filtering — the marker is visible iff this value is in the selected
   * professions set, OR the selected professions set is empty.
   */
  profession: string;
  /**
   * The rest of the row, in display order. Server-side strings, safe to
   * render in React.
   */
  data: Record<string, string>;
};

export type LegendEntry = {
  profession: string;
  color: string;
  /** How many markers in the data set have this profession. */
  count: number;
};

type MapClientProps = {
  markers: readonly MapMarker[];
  legend: readonly LegendEntry[];
};

/**
 * Opaque Leaflet Map type. We never reference `L.Map` at module level because
 * Leaflet touches `window` at import time and would crash the server bundle.
 * Instead we resolve `L` lazily inside `useEffect`.
 */
type LeafletMap = { remove: () => void; invalidateSize: () => void };

/**
 * Leaflet map client component.
 *
 * - One marker per row, colored by Profession.
 * - Clicking a marker opens a **bottom sheet** (mobile) / **side panel**
 *   (desktop) showing the rest of the row. No Leaflet popup is used.
 * - A legend above the map shows the color → profession mapping. Clicking
 *   one or more legend items filters the map to show only markers whose
 *   Profession is in the selected set. When the set is empty, all markers
 *   are shown.
 *
 * SSR notes:
 *   - Leaflet touches `window` at module evaluation, so we MUST NOT import it
 *     at the top of this file. The CSS import is fine because CSS is just a
 *     static asset; the JS library is loaded via a dynamic `await import()`
 *     inside `useEffect`, which only runs in the browser.
 *   - Leaflet's default-marker icon URLs break in Next.js bundlers because
 *     `imagePath` defaults to a path that doesn't exist. We override the
 *     icon options explicitly to inline SVG data URLs that work everywhere.
 */
export default function MapClient({ markers, legend }: MapClientProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // Each entry: { marker: LeafletMarker, profession: string, coords: LatLng }.
  // We keep this around so the filter effect can toggle visibility without
  // rebuilding the whole map.
  type StoredMarker = {
    marker: { addTo: (m: unknown) => void; removeFrom: (m: unknown) => void };
    profession: string;
    coords: LatLng;
  };
  const storedMarkersRef = useRef<StoredMarker[]>([]);
  // Re-use the existing `mapRef` for Leaflet map handle.

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedProfessions, setSelectedProfessions] = useState<Set<string>>(
    () => new Set(),
  );

  // Find the currently selected marker (if any) — used by the bottom sheet.
  const selected = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) ?? null,
    [markers, selectedMarkerId],
  );

  // Keyboard shortcut: Escape closes the bottom sheet.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedMarkerId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    // Dynamic import — runs only in the browser, never on the server.
    // We type the resolved module as `any` here because importing the
    // `leaflet` types at module top would force the type checker to follow
    // Leaflet's type graph, which references `window`. The runtime surface
    // we use (`L.map`, `L.divIcon`, `L.marker`, `L.tileLayer`, `L.latLngBounds`)
    // is stable across Leaflet 1.x.
    void (async () => {
      const L = await import("leaflet");

      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        worldCopyJump: true,
        // We render our own attribution badge outside the map (see the
        // <MapAttribution /> element below) so it stays in our DOM and
        // respects our stacking context. Disabling Leaflet's built-in
        // attribution control prevents it from poking through the bottom
        // sheet (Leaflet's control has z-index 800 and sits inside the
        // map container, which made it visible above the sheet content
        // on mobile).
        attributionControl: false,
      });
      mapRef.current = map as unknown as LeafletMap;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Build markers — one custom-icon marker per row. Store the profession
      // alongside the marker so the filter effect can toggle visibility
      // without rebuilding the map.
      const stored: StoredMarker[] = [];
      for (const m of markers) {
        const icon = buildColoredIcon(L, m.color);
        const marker = L.marker([m.coordinates.lat, m.coordinates.lng], { icon });
        marker.addTo(map);
        marker.on("click", () => setSelectedMarkerId(m.id));
        stored.push({
          marker: marker as unknown as StoredMarker["marker"],
          profession: m.profession,
          coords: m.coordinates,
        });
      }
      storedMarkersRef.current = stored;

      // Fit bounds to all markers (or center on the single one).
      if (markers.length > 0) {
        const bounds = L.latLngBounds(
          markers.map((m) => [m.coordinates.lat, m.coordinates.lng]),
        );
        if (markers.length === 1) {
          map.setView([markers[0].coordinates.lat, markers[0].coordinates.lng], 13);
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } else {
        map.setView([0, 0], 2);
      }

      // Re-run the size check once the layout settles — Next.js may mount the
      // component before the container has its final size, which would produce
      // a half-rendered map. invalidateSize() forces a re-measure.
      const t = setTimeout(() => map.invalidateSize(), 100);

      (map as unknown as { __cleanup__?: () => void }).__cleanup__ = () => {
        clearTimeout(t);
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current as unknown as { __cleanup__?: () => void } | null;
      if (map?.__cleanup__) map.__cleanup__();
      mapRef.current = null;
      storedMarkersRef.current = [];
    };
    // markers is intentionally the dep — when the underlying data changes
    // (sheet refreshed), the map is rebuilt with new markers.
  }, [markers]);

  // Filter effect: when the selected-professions set changes, toggle each
  // stored marker's visibility on the map. Empty set = show all. Non-empty
  // set = show only matching professions.
  useEffect(() => {
    const map = mapRef.current as unknown as { fitBounds: (b: unknown, opts?: unknown) => void; setView: (c: [number, number], z: number) => void; invalidateSize: () => void } | null;
    if (!map) return;

    const stored = storedMarkersRef.current;
    if (stored.length === 0) return;

    const showAll = selectedProfessions.size === 0;
    const visibleCoords: LatLng[] = [];

    for (const s of stored) {
      const shouldShow = showAll || selectedProfessions.has(s.profession);
      if (shouldShow) {
        // addTo() is a no-op when the marker is already on the map.
        s.marker.addTo(map);
        visibleCoords.push(s.coords);
      } else {
        s.marker.removeFrom(map);
      }
    }

    // Re-fit to the visible set so the user sees the filtered markers.
    if (visibleCoords.length === 0) {
      // Nothing matches — leave the view alone so the user isn't teleported.
      return;
    }
    if (visibleCoords.length === 1) {
      map.setView([visibleCoords[0].lat, visibleCoords[0].lng], 13);
    } else {
      // Lazy-load leaflet just for the bounds call. This is cheap; the
      // module is already cached from the marker-build effect.
      void import("leaflet").then((L) => {
        const bounds = L.latLngBounds(
          visibleCoords.map((c) => [c.lat, c.lng]),
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      });
    }
  }, [selectedProfessions]);

  return (
    <div className="relative">
      {legend.length > 0 ? (
        <Legend
          entries={legend}
          selectedProfessions={selectedProfessions}
          onToggle={(profession) => {
            setSelectedProfessions((prev) => {
              const next = new Set(prev);
              if (next.has(profession)) {
                next.delete(profession);
              } else {
                next.add(profession);
              }
              return next;
            });
          }}
          onClear={() => setSelectedProfessions(new Set())}
        />
      ) : null}

      <div className="relative w-full max-w-full">
        <div
          ref={containerRef}
          className="h-[80vh] min-h-[520px] w-full max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
          aria-label="Map of valid sheet coordinates"
        />

        {/* Attribution badge — sits absolutely over the map's bottom-right
            corner with z-index below the bottom sheet so it never pokes
            through. Required by OSM tile-usage policy. */}
        <MapAttribution />

        <BottomSheet marker={selected} onClose={() => setSelectedMarkerId(null)} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bottom sheet — slides in from the bottom on mobile, from the right on
// desktop. Renders the selected marker's row data as a definition list.
// -----------------------------------------------------------------------------

function BottomSheet({
  marker,
  onClose,
}: {
  marker: MapMarker | null;
  onClose: () => void;
}) {
  if (!marker) return null;

  const entries = Object.entries(marker.data).filter(([, v]) => v && v.length > 0);

  return (
    <>
      {/* Scrim — only visible on mobile. z-index sits ABOVE the Leaflet map
          (which uses internal panes up to ~700) so it actually darkens the
          map; on desktop the panel overlays the map edge-to-edge instead and
          no scrim is needed. */}
      <div
        className="fixed inset-0 z-[800] bg-black/30 backdrop-blur-sm md:hidden"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Selected location details"
        className={[
          // Common — sits above the Leaflet map (z up to ~700).
          "fixed z-[900] bg-white shadow-2xl transition-transform duration-300 dark:bg-zinc-900",
          // Mobile: bottom-anchored full-width sheet, rounded top, max 70vh,
          // iOS safe-area bottom padding so it isn't hidden behind the home
          // indicator. Visible only when a marker is selected (handled above).
          "inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          // Desktop: right-anchored panel, full height, 384px wide, rounded left.
          "md:inset-x-auto md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-screen md:max-h-screen md:w-96 md:rounded-l-2xl md:rounded-tr-none md:p-5 md:pb-5",
        ].join(" ")}
      >
        {/* Drag-handle pill — purely decorative, mobile only. */}
        <div className="mb-3 flex justify-center md:hidden" aria-hidden>
          <span className="h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: marker.color }}
            />
            <h2 className="text-lg font-semibold tracking-tight">
              {entries[0]?.[1] || "Location details"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close details"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </header>

        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            (no other fields)
          </p>
        ) : (
          <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-3 py-2">
                <dt className="col-span-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {k}
                </dt>
                <dd className="col-span-2 break-words text-zinc-900 dark:text-zinc-100">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {marker.coordinates.lat.toFixed(5)}, {marker.coordinates.lng.toFixed(5)}
        </p>
      </aside>
    </>
  );
}

// -----------------------------------------------------------------------------
// Legend — multi-select filter for the map. Click a profession to add/remove
// it from the active set; an empty set means "show everything". A "Clear"
// button appears whenever at least one profession is selected.
// -----------------------------------------------------------------------------

function Legend({
  entries,
  selectedProfessions,
  onToggle,
  onClear,
}: {
  entries: readonly LegendEntry[];
  selectedProfessions: Set<string>;
  onToggle: (profession: string) => void;
  onClear: () => void;
}) {
  const hasSelection = selectedProfessions.size > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Profession
        {hasSelection ? (
          <span className="ml-2 normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
            ({selectedProfessions.size} selected · map filtered)
          </span>
        ) : null}
      </span>
      {entries.map((entry) => {
        const active = selectedProfessions.has(entry.profession);
        return (
          <button
            key={entry.profession}
            type="button"
            onClick={() => onToggle(entry.profession)}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition",
              active
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600",
            ].join(" ")}
            aria-pressed={active}
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.profession}</span>
            <span
              className={[
                "rounded-full px-1.5 text-[10px] font-semibold",
                active
                  ? "bg-white/20 text-current"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
              ].join(" ")}
            >
              {entry.count}
            </span>
          </button>
        );
      })}
      {hasSelection ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-white"
        >
          Clear filter
        </button>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Marker icon — build a small colored pin SVG as a Leaflet divIcon. Using
// divIcon (instead of L.icon with image URLs) means no external assets are
// needed; the marker is a tiny inline HTML element styled with CSS, which
// also lets us color it via the row's Profession.
// -----------------------------------------------------------------------------

/**
 * Attribution badge — required by OpenStreetMap's tile-usage policy
 * (https://operations.osmfoundation.org/policies/tiles/). We render it
 * ourselves (instead of using Leaflet's built-in `.leaflet-control-attribution`)
 * so its stacking context is fully under our control: the badge sits below
 * the bottom sheet (`z-700` vs the sheet's `z-[900]`) and never pokes through.
 *
 * Placed absolutely inside the map wrapper so it tracks the map's
 * bottom-right corner on both mobile and desktop.
 */
function MapAttribution() {
  return (
    <a
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-2 right-2 z-[700] rounded-md bg-white/90 px-2 py-1 text-[10px] text-zinc-700 shadow-sm backdrop-blur-sm hover:bg-white hover:text-zinc-900 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
    >
      Leaflet | © OpenStreetMap contributors
    </a>
  );
}

function buildColoredIcon(L: typeof import("leaflet"), color: string) {
  const html = `
    <div class="map-pin">
      <svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 22.5 12.5 41 12.5 41S25 22.5 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${escapeAttr(color)}"/>
        <circle cx="12.5" cy="12.5" r="5" fill="#ffffff"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: "map-pin-wrapper",
    html,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -34],
  });
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}