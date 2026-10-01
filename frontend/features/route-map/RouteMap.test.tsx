import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewPoint } from "@/features/trip-form/model";
import { sampleTrip } from "@/lib/api/__fixtures__";
import RouteMap, { type RouteMapProps } from "./RouteMap";

/** A tiny stand-in for MapLibre (jsdom has no WebGL): it records what the component asks for. */
const fake = vi.hoisted(() => {
  type Handler = (event?: unknown) => void;

  class FakeSource {
    setData = vi.fn();
  }

  class FakeMap {
    static instances: FakeMap[] = [];
    static failNext = false;
    handlers = new Map<string, Handler[]>();
    sources = new Map<string, FakeSource>();
    fitBounds = vi.fn();
    // Like MapLibre: a resize fires movestart and moveend, with no originalEvent (the user didn't move it).
    resize = vi.fn(() => {
      this.emit("movestart", {});
      this.emit("moveend", {});
    });
    easeTo = vi.fn();
    project = vi.fn<(lngLat: [number, number]) => { x: number; y: number }>(() => ({ x: 0, y: 0 }));
    isMoving = vi.fn(() => false);
    addLayer = vi.fn();
    addControl = vi.fn();
    remove = vi.fn();
    container: HTMLElement;
    constructor(options: { container: HTMLElement }) {
      if (FakeMap.failNext) {
        FakeMap.failNext = false;
        throw new Error("Failed to initialize WebGL");
      }
      this.container = options.container;
      FakeMap.instances.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, payload?: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload));
    }
    addSource(id: string) {
      this.sources.set(id, new FakeSource());
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    getContainer() {
      return this.container;
    }
  }

  class FakeMarker {
    static instances: FakeMarker[] = [];
    element: HTMLElement;
    lngLat: unknown = null;
    moves = 0;
    constructor(readonly options: { element: HTMLElement; subpixelPositioning?: boolean }) {
      this.element = options.element;
      FakeMarker.instances.push(this);
    }
    setLngLat(lngLat: unknown) {
      this.lngLat = lngLat;
      this.moves += 1;
      return this;
    }
    addTo(map: FakeMap) {
      map.container.append(this.element);
      return this;
    }
    getElement() {
      return this.element;
    }
    remove() {
      this.element.remove();
      return this;
    }
  }

  class FakePopup {
    static instances: FakePopup[] = [];
    open = false;
    content: Node | null = null;
    constructor(readonly options: Record<string, unknown>) {
      FakePopup.instances.push(this);
    }
    setDOMContent(node: Node) {
      this.content = node;
      return this;
    }
    setLngLat() {
      return this;
    }
    addTo() {
      this.open = true;
      return this;
    }
    remove() {
      this.open = false;
      return this;
    }
    isOpen() {
      return this.open;
    }
  }

  class FakeControl {
    constructor(readonly options?: Record<string, unknown>) {}
  }

  return { FakeMap, FakeMarker, FakePopup, FakeControl };
});

vi.mock("maplibre-gl", () => ({
  Map: fake.FakeMap,
  Marker: fake.FakeMarker,
  Popup: fake.FakePopup,
  AttributionControl: fake.FakeControl,
  NavigationControl: fake.FakeControl,
  setWorkerUrl: vi.fn(),
}));

const PREVIEW: PreviewPoint[] = [
  { key: "current", kind: "start", label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { key: "dropoff", kind: "dropoff", label: "Dallas, TX", lat: 32.7767, lng: -96.797 },
];

function setup(props: Partial<RouteMapProps> = {}) {
  const all: RouteMapProps = { trip: sampleTrip, preview: [], selectedStopId: null, onSelectStop: vi.fn(), ...props };
  const view = render(<RouteMap {...all} />);
  const map = fake.FakeMap.instances.at(-1)!;
  act(() => map.emit("load"));
  return { ...view, map, props: all, rerender: (next: Partial<RouteMapProps>) => view.rerender(<RouteMap {...all} {...next} />) };
}

function trucks() {
  return fake.FakeMarker.instances.filter((marker) => marker.element.classList.contains("truck-marker"));
}

function markerFor(id: string) {
  const stop = sampleTrip.stops.find((candidate) => candidate.id === id)!;
  return screen.getByRole("button", { name: (name) => name.endsWith(` · ${stop.place}`) });
}

beforeEach(() => {
  fake.FakeMap.instances = [];
  fake.FakeMarker.instances = [];
  fake.FakePopup.instances = [];
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
});

afterEach(() => vi.unstubAllGlobals());

describe("RouteMap", () => {
  it("draws the route and one marker per stop, once", () => {
    const { map } = setup();
    expect(fake.FakeMarker.instances).toHaveLength(sampleTrip.stops.length);
    expect(map.getSource("route")!.setData).toHaveBeenCalledOnce();
    expect(map.fitBounds).toHaveBeenCalledOnce();
  });

  it("changes only the highlight and the popup when the selection changes", () => {
    const { map, rerender } = setup();
    const rest = markerFor("s5");
    const routeData = map.getSource("route")!.setData;

    rerender({ selectedStopId: "s5", preview: [] });

    expect(fake.FakeMarker.instances).toHaveLength(sampleTrip.stops.length);
    expect(routeData).toHaveBeenCalledOnce();
    expect(markerFor("s5")).toBe(rest);
    expect(rest).toHaveClass("is-selected");
    const restIndex = sampleTrip.stops.findIndex((stop) => stop.id === "s5");
    expect(fake.FakePopup.instances[restIndex].isOpen()).toBe(true);

    rerender({ selectedStopId: null, preview: [] });
    expect(rest).not.toHaveClass("is-selected");
    expect(fake.FakePopup.instances[restIndex].isOpen()).toBe(false);
  });

  it("does not rebuild the preview when only the array identity changes", () => {
    const { map, rerender } = setup({ trip: null, preview: PREVIEW });
    expect(fake.FakeMarker.instances).toHaveLength(2);
    rerender({ trip: null, preview: PREVIEW.map((point) => ({ ...point })) });
    expect(fake.FakeMarker.instances).toHaveLength(2);
    expect(map.getSource("preview")!.setData).toHaveBeenCalledOnce();

    rerender({ trip: null, preview: PREVIEW.slice(0, 1) });
    expect(fake.FakeMarker.instances).toHaveLength(3);
  });

  it("selects a stop from its marker by click or keyboard", () => {
    const onSelectStop = vi.fn();
    setup({ onSelectStop });
    fireEvent.click(markerFor("s3"));
    expect(onSelectStop).toHaveBeenLastCalledWith("s3");
    fireEvent.keyDown(markerFor("s7"), { key: "Enter" });
    expect(onSelectStop).toHaveBeenLastCalledWith("s7");
  });

  it("shows a stop's popup on hover and keyboard focus, and keeps the selected one open", () => {
    const { rerender } = setup();
    const pickup = markerFor("s3");
    const popup = fake.FakePopup.instances[sampleTrip.stops.findIndex((stop) => stop.id === "s3")];

    fireEvent.mouseEnter(pickup);
    expect(popup.isOpen()).toBe(true);
    fireEvent.mouseLeave(pickup);
    expect(popup.isOpen()).toBe(false);

    fireEvent.focus(pickup);
    expect(popup.isOpen()).toBe(true);
    fireEvent.blur(pickup);
    expect(popup.isOpen()).toBe(false);

    rerender({ selectedStopId: "s3" });
    fireEvent.mouseEnter(pickup);
    fireEvent.mouseLeave(pickup);
    expect(popup.isOpen()).toBe(true);
  });

  describe("trip replay", () => {
    it("adds one truck and moves it in place, leaving the stop markers and the route alone", () => {
      const { map, rerender } = setup();
      const stopMarkers = fake.FakeMarker.instances.length;
      const rest = markerFor("s5");

      rerender({ replay: { lngLat: [-88, 41], status: "driving" } });
      expect(trucks()).toHaveLength(1);
      const [truck] = trucks();
      expect(truck.options.subpixelPositioning).toBe(true);
      expect(truck.lngLat).toEqual([-88, 41]);
      expect(truck.element).toHaveAttribute("data-status", "driving");

      rerender({ replay: { lngLat: [-89, 40], status: "driving" } });
      rerender({ replay: { lngLat: [-89.5, 39.5], status: "sleeper_berth" } });
      expect(trucks()).toEqual([truck]);
      expect(truck.lngLat).toEqual([-89.5, 39.5]);
      expect(truck.moves).toBe(3);
      expect(truck.element).toHaveAttribute("data-status", "sleeper_berth");
      expect(fake.FakeMarker.instances).toHaveLength(stopMarkers + 1);
      expect(markerFor("s5")).toBe(rest);
      expect(map.getSource("route")!.setData).toHaveBeenCalledOnce();
    });

    it("faces the truck the way it is heading, without flickering on a wiggly road", () => {
      const { rerender } = setup();
      rerender({ replay: { lngLat: [-88, 41], status: "driving" } });
      const [truck] = trucks();
      expect(truck.element).toHaveAttribute("data-facing", "right");
      rerender({ replay: { lngLat: [-89, 40], status: "driving" } });
      expect(truck.element).toHaveAttribute("data-facing", "left");
      rerender({ replay: { lngLat: [-88.99, 39.9], status: "driving" } }); // a little east: still left
      expect(truck.element).toHaveAttribute("data-facing", "left");
      rerender({ replay: { lngLat: [-88.5, 39.5], status: "driving" } });
      expect(truck.element).toHaveAttribute("data-facing", "right");
      rerender({ replay: { lngLat: [-88.5, 39], status: "driving" } }); // due south: unchanged
      expect(truck.element).toHaveAttribute("data-facing", "right");
    });

    it("draws the truck from DOM nodes, out of the keyboard and pointer path", () => {
      const { rerender } = setup();
      rerender({ replay: { lngLat: [-88, 41], status: "driving" } });
      const [truck] = trucks();
      expect(truck.element).toHaveAttribute("aria-hidden", "true");
      expect(truck.element).not.toHaveAttribute("tabindex");
      expect(truck.element.querySelector("svg path")).not.toBeNull();
      expect(truck.element.querySelector(".truck-marker__badge")).not.toBeNull();
    });

    it("removes the truck when the replay ends", () => {
      const { container, rerender } = setup();
      rerender({ replay: { lngLat: [-88, 41], status: "driving" } });
      expect(container.querySelector(".truck-marker")).not.toBeNull();
      rerender({ replay: null });
      expect(container.querySelector(".truck-marker")).toBeNull();
      expect(fake.FakeMarker.instances).toHaveLength(sampleTrip.stops.length + 1);
    });

    it("frames the whole route above the playback bar when the replay starts, unless the user moved the map", () => {
      const { map, rerender } = setup();
      Object.defineProperty(map.container, "clientWidth", { value: 1200, configurable: true });
      Object.defineProperty(map.container, "clientHeight", { value: 800, configurable: true });
      // Dallas, the south-west corner, sits under the bar.
      map.project.mockImplementation(([lng]) => (lng < -90 ? { x: 500, y: 700 } : { x: 900, y: 100 }));
      rerender({ replay: { lngLat: [-87.6, 41.9], status: "driving" } });
      expect(map.fitBounds).toHaveBeenCalledTimes(2);
      expect(map.fitBounds.mock.calls[1][1]).toMatchObject({ padding: { top: 64, right: 64, bottom: 164, left: 390 } });
      expect(map.easeTo).not.toHaveBeenCalled();

      rerender({ replay: null });
      map.emit("movestart", { originalEvent: new MouseEvent("mousedown") });
      rerender({ replay: { lngLat: [-87.6, 41.9], status: "driving" } });
      expect(map.fitBounds).toHaveBeenCalledTimes(2);
    });

    it("pans gently to keep the truck in view, but not too often or right after the user moves the map", () => {
      const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
      const { map, rerender } = setup();
      Object.defineProperty(map.container, "clientWidth", { value: 1200, configurable: true });
      Object.defineProperty(map.container, "clientHeight", { value: 800, configurable: true });
      // In view: right of the panel, above the playback bar.
      map.project.mockReturnValue({ x: 700, y: 400 });
      rerender({ replay: { lngLat: [-88, 41], status: "driving" } });
      expect(map.easeTo).not.toHaveBeenCalled();

      // Behind the panel: pan, putting the truck in the middle of the free area.
      map.project.mockReturnValue({ x: 200, y: 400 });
      rerender({ replay: { lngLat: [-88.1, 41], status: "driving" } });
      expect(map.easeTo).toHaveBeenCalledOnce();
      expect(map.easeTo.mock.calls[0][0]).toMatchObject({ center: [-88.1, 41], offset: [163, -50] });

      now.mockReturnValue(11_000);
      rerender({ replay: { lngLat: [-88.2, 41], status: "driving" } });
      expect(map.easeTo).toHaveBeenCalledOnce();

      now.mockReturnValue(13_000);
      map.emit("movestart", { originalEvent: new MouseEvent("mousedown") });
      now.mockReturnValue(14_000);
      rerender({ replay: { lngLat: [-88.3, 41], status: "driving" } });
      expect(map.easeTo).toHaveBeenCalledOnce();

      now.mockReturnValue(17_500);
      rerender({ replay: { lngLat: [-88.4, 41], status: "driving" } });
      expect(map.easeTo).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });
  });

  it("measures the map before fitting a route, as the results resize it in the same render", () => {
    const { map } = setup();
    expect(map.resize).toHaveBeenCalled();
    expect(map.resize.mock.invocationCallOrder[0]).toBeLessThan(map.fitBounds.mock.invocationCallOrder[0]);
  });

  it("doesn't take its own resize before a fit for the user moving the map", () => {
    const { map, rerender } = setup({ trip: null, preview: PREVIEW });
    rerender({ trip: sampleTrip, preview: [] });
    expect(map.resize).toHaveBeenCalledTimes(2);
    Object.defineProperty(map.container, "clientWidth", { value: 1200, configurable: true });
    Object.defineProperty(map.container, "clientHeight", { value: 800, configurable: true });
    map.project.mockImplementation(([lng]) => (lng < -90 ? { x: 500, y: 700 } : { x: 900, y: 100 }));
    // The replay still frames the route: no user move since the fit.
    rerender({ trip: sampleTrip, preview: [], replay: { lngLat: [-87.6, 41.9], status: "driving" } });
    expect(map.fitBounds).toHaveBeenCalledTimes(3);
  });

  it("keeps extra room clear at the bottom when fitting, if asked (the guided tour's captions)", () => {
    const { map } = setup({ bottomInset: 140 });
    expect(map.fitBounds.mock.calls[0][1]).toMatchObject({ padding: { top: 64, right: 64, bottom: 204, left: 390 } });
  });

  it("marks each stop's pin and popup with the stop's id", () => {
    setup();
    expect(markerFor("s5")).toHaveAttribute("data-stop-id", "s5");
    const popup = fake.FakePopup.instances.find((instance) => (instance.content as HTMLElement).dataset.stopId === "s5");
    expect(popup).toBeDefined();
  });

  it("names the GeoNames licence in the map credits", () => {
    const { map } = setup();
    const credits = map.addControl.mock.calls.map(
      ([control]) => (control as InstanceType<typeof fake.FakeControl>).options?.customAttribution,
    );
    expect(credits).toEqual(expect.arrayContaining([expect.stringContaining("Towns © GeoNames (CC BY 4.0)")]));
  });

  it("falls back to a note when the browser can't draw the map (no WebGL)", () => {
    fake.FakeMap.failNext = true;
    render(<RouteMap trip={sampleTrip} preview={[]} selectedStopId={null} onSelectStop={vi.fn()} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "The map can't be shown in this browser (WebGL is unavailable). Your route, stops and daily logs are below.",
    );
  });
});
