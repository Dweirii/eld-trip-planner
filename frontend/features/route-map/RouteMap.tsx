"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { PreviewPoint } from "@/features/trip-form/model";
import type { Stop, StopKind, Trip } from "@/lib/api/types";
import { STOP_STYLE } from "@/lib/stops";
import { boundsOf, type LngLat } from "./bounds";
import { createMarkerElement, popupContent, stopPopupLines, stopTitle } from "./markers";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

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
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const lastFitRef = useRef("");
  const onSelectRef = useRef(onSelectStop);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // MapLibre 6 module worker is not bundled by Turbopack; serve the copy from public/.
    maplibregl.setWorkerUrl(WORKER_URL);
    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [-96.5, 38.5],
      zoom: 3.3,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Routing © openrouteservice.org · Search © Photon · Towns © GeoNames",
      }),
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
    const markers = markersRef.current;
    return () => {
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const routeCoordinates = (trip?.route.geometry.coordinates ?? []) as LngLat[];
    const previewCoordinates: LngLat[] = preview.map((point) => [point.lng, point.lat]);
    (map.getSource("route") as maplibregl.GeoJSONSource).setData(trip ? line(routeCoordinates) : EMPTY);
    (map.getSource("preview") as maplibregl.GeoJSONSource).setData(
      !trip && previewCoordinates.length >= 2 ? line(previewCoordinates) : EMPTY,
    );

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    const placed = trip ? trip.stops.map(placeStop) : preview.map(placePreview);
    for (const { id, element, lngLat, popup } of placed) {
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
      const marker = new maplibregl.Marker({ element })
        .setLngLat(lngLat)
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setDOMContent(popup))
        .addTo(map);
      markersRef.current.set(id, marker);
    }

    const fitPoints = trip ? routeCoordinates : previewCoordinates;
    const fitKey = JSON.stringify(fitPoints);
    const bounds = boundsOf(fitPoints);
    if (bounds && fitKey !== lastFitRef.current) {
      lastFitRef.current = fitKey;
      map.fitBounds(bounds, { padding: panelPadding(map.getContainer()), maxZoom: 9, duration: 600 });
    }
  }, [trip, preview, ready]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const selected = id === selectedStopId;
      marker.getElement().classList.toggle("is-selected", selected);
      const popup = marker.getPopup();
      if (popup && popup.isOpen() !== selected) marker.togglePopup();
    });
  }, [selectedStopId, trip, preview, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" role="region" aria-label="Route map" />
      <MapLegend />
    </div>
  );
}

const LEGEND: StopKind[] = ["start", "pickup", "dropoff", "fuel", "break", "rest", "restart"];

function MapLegend() {
  return (
    <ul
      aria-label="Map legend"
      className="pointer-events-none absolute bottom-9 right-3 hidden gap-1 rounded-xl bg-white/95 p-2.5 text-[10.5px] text-text shadow-md lg:grid"
    >
      {LEGEND.map((kind) => (
        <li key={kind} className="flex items-center gap-2">
          <span
            className="stop-marker"
            data-shape={STOP_STYLE[kind].shape}
            style={{ "--marker-color": STOP_STYLE[kind].color } as CSSProperties}
          >
            <span className="h-2.5! w-2.5! border-2!" />
          </span>
          {STOP_STYLE[kind].label}
        </li>
      ))}
    </ul>
  );
}
