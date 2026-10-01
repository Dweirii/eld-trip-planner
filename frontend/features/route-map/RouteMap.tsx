"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPoint } from "@/features/trip-form/model";
import type { DutyStatus, Stop, Trip } from "@/lib/api/types";
import { boundsOf, type LngLat } from "./bounds";
import { MapLegend } from "./MapLegend";
import { createMarkerElement, createTruckElement, popupContent, stopPopupLines, stopTitle } from "./markers";

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

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/** Leave room for the floating panel (desktop) or the bottom sheet (mobile) when fitting a route. */
function panelPadding(container: HTMLElement): Padding {
  if (isDesktop()) return { top: 64, right: 64, bottom: 64, left: 390 };
  // Top: clear of the map credits, which start expanded on small screens. Bottom: clear of the sheet and
  // of the "Play trip" and "Legend" buttons that sit just above it.
  return { top: 80, right: 32, bottom: Math.round(container.clientHeight * 0.62) + 40, left: 32 };
}

/** Extra room the expanded playback bar takes at the bottom of the map (desktop: over the map; small screens: above the sheet). */
const PLAYBACK_BAR_CLEARANCE = { desktop: 100, mobile: 56 } as const;
/** Auto-pan at most this often, and not this soon after the user moved the map themselves. */
const PAN_EVERY_MS = 2_000;
const USER_MOVE_GRACE_MS = 4_000;

/** Where the truck must stay: clear of the panel or sheet, the credits and the playback bar. */
function replayViewport(container: HTMLElement): Padding {
  const padding = panelPadding(container);
  return { ...padding, bottom: padding.bottom + PLAYBACK_BAR_CLEARANCE[isDesktop() ? "desktop" : "mobile"] };
}

/** The truck turns round only after heading back this far (degrees of longitude), so wiggly roads don't flicker it. */
const TURN_DEGREES = 0.05;

/** The trip-replay truck: one marker, moved in place (sub-pixel, so it glides) and restyled by data attributes. */
class Truck {
  private readonly element = createTruckElement();
  private readonly marker: maplibregl.Marker;
  /** The furthest longitude reached in the direction it faces. */
  private anchor: number;

  constructor(map: maplibregl.Map, lngLat: LngLat, status: DutyStatus) {
    this.element.dataset.facing = "right";
    this.element.dataset.status = status;
    this.marker = new maplibregl.Marker({ element: this.element, subpixelPositioning: true })
      .setLngLat(lngLat)
      .addTo(map);
    this.anchor = lngLat[0];
  }

  move(lngLat: LngLat, status: DutyStatus) {
    const [lng] = lngLat;
    this.marker.setLngLat(lngLat);
    // Face the way it is heading: west is left.
    const right = this.element.dataset.facing !== "left";
    if (right ? lng > this.anchor : lng < this.anchor) this.anchor = lng;
    else if (Math.abs(lng - this.anchor) > TURN_DEGREES) {
      this.element.dataset.facing = right ? "left" : "right";
      this.anchor = lng;
    }
    if (this.element.dataset.status !== status) this.element.dataset.status = status;
  }

  remove() {
    this.marker.remove();
  }
}

/** When the map last moved on its own (a fit or a pan) and when the user last moved it. */
interface CameraClock {
  fittedAt: number;
  lastPan: number;
  userMovedAt: number;
}

/** The part of the map the truck should stay in, in container pixels (null before layout). */
function freeArea(map: maplibregl.Map) {
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return null;
  const padding = replayViewport(container);
  const left = padding.left;
  const top = padding.top;
  const right = Math.max(left, width - padding.right);
  const bottom = Math.max(top, height - padding.bottom);
  const contains = (lngLat: LngLat) => {
    const point = map.project(lngLat);
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  };
  return { width, height, padding, left, top, right, bottom, contains };
}

/**
 * As the replay starts, fit the whole route above the playback bar, so the truck can drive it without
 * the map moving. Only if part of it is hidden, and only if the user hasn't moved the map since it was fitted.
 */
function frameRoute(map: maplibregl.Map, bounds: [LngLat, LngLat] | null, clock: CameraClock): boolean {
  const area = freeArea(map);
  if (!bounds || !area || clock.userMovedAt > clock.fittedAt) return false;
  const [[west, south], [east, north]] = bounds;
  const corners: LngLat[] = [
    [west, south],
    [west, north],
    [east, south],
    [east, north],
  ];
  if (corners.every(area.contains)) return false;
  clock.fittedAt = clock.lastPan = performance.now();
  map.fitBounds(bounds, { padding: area.padding, maxZoom: 9, duration: 900 });
  return true;
}

/** Ease the map so the truck sits in the middle of the free area, if it has left it (throttled; yields to the user). */
function keepInView(map: maplibregl.Map, lngLat: LngLat, clock: CameraClock) {
  const now = performance.now();
  if (now - clock.lastPan < PAN_EVERY_MS || now - clock.userMovedAt < USER_MOVE_GRACE_MS) return;
  const area = freeArea(map);
  if (!area || map.isMoving() || area.contains(lngLat)) return;
  clock.lastPan = now;
  const { width, height, left, right, top, bottom } = area;
  map.easeTo({
    center: lngLat,
    offset: [Math.round((left + right - width) / 2), Math.round((top + bottom - height) / 2)],
    duration: 1200,
  });
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
  /** Trip replay: where the truck is and what the driver is doing (null: no truck). */
  replay?: { lngLat: [number, number]; status: DutyStatus } | null;
}

/** MapLibre map: the planned route and its stops, or a dashed preview while the form is filled in. */
export default function RouteMap({ trip, preview, selectedStopId, onSelectStop, replay = null }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const attentionRef = useRef<Attention>({ selected: selectedStopId, hovered: null, focused: null });
  const lastFitRef = useRef("");
  const onSelectRef = useRef(onSelectStop);
  const truckRef = useRef<Truck | null>(null);
  const routeBoundsRef = useRef<[LngLat, LngLat] | null>(null);
  const cameraRef = useRef<CameraClock>({
    fittedAt: Number.NEGATIVE_INFINITY,
    lastPan: Number.NEGATIVE_INFINITY,
    userMovedAt: Number.NEGATIVE_INFINITY,
  });
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
    const desktop = isDesktop();
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: CREDITS }),
      desktop ? "bottom-right" : "top-left",
    );
    if (desktop) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // A drag, wheel or pinch carries the browser event; our own easeTo and fitBounds don't.
    const camera = cameraRef.current;
    map.on("movestart", (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) camera.userMovedAt = performance.now();
    });
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
      map.remove(); // takes every marker, the truck included, with it
      mapRef.current = null;
      truckRef.current = null;
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
    routeBoundsRef.current = trip ? bounds : null;
    if (bounds && fitKey !== lastFitRef.current) {
      lastFitRef.current = fitKey;
      cameraRef.current.fittedAt = performance.now();
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

  // Trip replay: one truck marker, moved in place every frame; the stop markers are never touched.
  const truckLng = replay?.lngLat[0];
  const truckLat = replay?.lngLat[1];
  const truckStatus = replay?.status;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (truckLng === undefined || truckLat === undefined || truckStatus === undefined) {
      truckRef.current?.remove();
      truckRef.current = null;
      return;
    }
    const lngLat: LngLat = [truckLng, truckLat];
    if (truckRef.current) truckRef.current.move(lngLat, truckStatus);
    else {
      truckRef.current = new Truck(map, lngLat, truckStatus);
      if (frameRoute(map, routeBoundsRef.current, cameraRef.current)) return;
    }
    keepInView(map, lngLat, cameraRef.current);
  }, [truckLng, truckLat, truckStatus]);

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
        <MapLegend raised={replay !== null} />
      )}
    </div>
  );
}
