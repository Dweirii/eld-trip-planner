"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPoint } from "@/features/trip-form/model";
import type { Stop, Trip } from "@/lib/api/types";
import { boundsOf, type LngLat } from "./bounds";
import { MapLegend } from "./MapLegend";
import { createMarkerElement, popupContent, stopPopupLines, stopTitle } from "./markers";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const LOWER_48: maplibregl.LngLatBoundsLike = [
  [-124.8, 24.4],
  [-66.9, 49.4],
];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const CREDITS = "Routing © openrouteservice.org · Search © Photon · Towns © GeoNames (CC BY 4.0)";

function line(coordinates: readonly LngLat[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...coordinates] } }],
  };
}

interface Placed {
  id: string;
  element: HTMLDivElement;
  lngLat: LngLat;
  popup: HTMLDivElement;
}

function placeStop(stop: Stop): Placed {
  const title = stopTitle(stop);
  return {
    id: stop.id,
    element: createMarkerElement(stop.kind, title),
    lngLat: [stop.lng, stop.lat],
    popup: popupContent(title, stopPopupLines(stop)),
  };
}

function placePreview(point: PreviewPoint): Placed {
  return {
    id: point.key,
    element: createMarkerElement(point.kind, point.label),
    lngLat: [point.lng, point.lat],
    popup: popupContent(point.label, []),
  };
}

/** Leave room for the floating panel (desktop) or the bottom sheet (mobile) when fitting a route. */
function panelPadding(container: HTMLElement): maplibregl.PaddingOptions {
  if (window.matchMedia("(min-width: 1024px)").matches) return { top: 64, right: 64, bottom: 64, left: 390 };
  return { top: 40, right: 32, bottom: Math.round(container.clientHeight * 0.62), left: 32 };
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  popup: maplibregl.Popup;
  lngLat: LngLat;
}

/** Which stops want their popup open: the selected one, and the one under the pointer or keyboard focus. */
interface Attention {
  selected: string | null;
  hovered: string | null;
  focused: string | null;
}

function syncPopup(map: maplibregl.Map, id: string, entry: MarkerEntry, attention: Attention) {
  const open = id === attention.selected || id === attention.hovered || id === attention.focused;
  if (open === entry.popup.isOpen()) return;
  if (open) entry.popup.setLngLat(entry.lngLat).addTo(map);
  else entry.popup.remove();
}

export interface RouteMapProps {
  trip: Trip | null;
  preview: PreviewPoint[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
}

/** MapLibre map: the planned route and its stops, or a dashed preview while the form is filled in. */
export default function RouteMap({ trip, preview, selectedStopId, onSelectStop }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const attentionRef = useRef<Attention>({ selected: selectedStopId, hovered: null, focused: null });
  const lastFitRef = useRef("");
  const onSelectRef = useRef(onSelectStop);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Rebuild the markers when the preview's content changes, never just because a new array arrived.
  const previewKey = JSON.stringify(preview);
  const previewPoints = useMemo(() => JSON.parse(previewKey) as PreviewPoint[], [previewKey]);

  useEffect(() => {
    onSelectRef.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // MapLibre 6 module worker is not bundled by Turbopack; serve the copy from public/.
    maplibregl.setWorkerUrl(WORKER_URL);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        bounds: LOWER_48,
        fitBoundsOptions: { padding: panelPadding(container) },
        attributionControl: false,
      });
    } catch {
      // No WebGL (some VMs, remote desktops, locked-down browsers): keep the rest of the app working.
      // Only constructing the map tells us, so this effect is the one place to learn it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnsupported(true);
      return;
    }
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: CREDITS }),
      desktop ? "bottom-right" : "top-left",
    );
    if (desktop) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#008080", "line-width": 5 },
      });
      map.addSource("preview", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "preview-line",
        type: "line",
        source: "preview",
        paint: { "line-color": "#008080", "line-width": 3, "line-opacity": 0.7, "line-dasharray": [2, 2] },
      });
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Selection only moves the highlight and the popups; markers and route data stay as they are.
  // (Declared before the rebuild below, so a rebuild in the same commit sees the new selection.)
  useEffect(() => {
    const attention = attentionRef.current;
    attention.selected = selectedStopId;
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((entry, id) => {
      entry.marker.getElement().classList.toggle("is-selected", id === selectedStopId);
      syncPopup(map, id, entry, attention);
    });
  }, [selectedStopId]);

  // Route data and markers: rebuilt only when the trip or the preview's content changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const routeCoordinates = (trip?.route.geometry.coordinates ?? []) as LngLat[];
    const previewCoordinates: LngLat[] = previewPoints.map((point) => [point.lng, point.lat]);
    (map.getSource("route") as maplibregl.GeoJSONSource).setData(trip ? line(routeCoordinates) : EMPTY);
    (map.getSource("preview") as maplibregl.GeoJSONSource).setData(
      !trip && previewCoordinates.length >= 2 ? line(previewCoordinates) : EMPTY,
    );

    const entries = markersRef.current;
    const attention = attentionRef.current;
    const placed = trip ? trip.stops.map(placeStop) : previewPoints.map(placePreview);
    for (const { id, element, lngLat, popup: content } of placed) {
      const popup = new maplibregl.Popup({
        offset: 16,
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
      }).setDOMContent(content);
      const marker = new maplibregl.Marker({ element }).setLngLat(lngLat).addTo(map);
      const entry: MarkerEntry = { marker, popup, lngLat };
      const sync = () => syncPopup(map, id, entry, attention);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(id);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRef.current(id);
        }
      });
      element.addEventListener("mouseenter", () => {
        attention.hovered = id;
        sync();
      });
      element.addEventListener("mouseleave", () => {
        if (attention.hovered === id) attention.hovered = null;
        sync();
      });
      element.addEventListener("focus", () => {
        attention.focused = id;
        sync();
      });
      element.addEventListener("blur", () => {
        if (attention.focused === id) attention.focused = null;
        sync();
      });
      element.classList.toggle("is-selected", id === attention.selected);
      entries.set(id, entry);
      sync();
    }

    const fitPoints = trip ? routeCoordinates : previewCoordinates;
    const fitKey = JSON.stringify(fitPoints);
    const bounds = boundsOf(fitPoints);
    if (bounds && fitKey !== lastFitRef.current) {
      lastFitRef.current = fitKey;
      map.fitBounds(bounds, { padding: panelPadding(map.getContainer()), maxZoom: 9, duration: 600 });
    }

    return () => {
      entries.forEach(({ marker, popup }) => {
        popup.remove();
        marker.remove();
      });
      entries.clear();
      attention.hovered = null;
      attention.focused = null;
    };
  }, [trip, previewPoints, ready]);

  return (
    <div className="absolute inset-0">
      {/* h-full/w-full, not absolute: maplibre-gl.css's unlayered `position: relative` beats Tailwind's layered `absolute`. */}
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="Route map" />
      {unsupported ? (
        <p
          role="note"
          className="absolute inset-x-4 top-4 mx-auto max-w-sm rounded-xl bg-white p-3 text-[12px] leading-snug text-text shadow-md lg:left-[380px] lg:right-auto lg:mx-0"
        >
          The map can&apos;t be shown in this browser (WebGL is unavailable). Your route, stops and daily logs are
          below.
        </p>
      ) : (
        <MapLegend />
      )}
    </div>
  );
}
