import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewPoint } from "@/features/trip-form/model";
import { sampleTrip } from "@/lib/api/__fixtures__";
import RouteMap, { type RouteMapProps } from "./RouteMap";

/** A tiny stand-in for MapLibre (jsdom has no WebGL): it records what the component asks for. */
const fake = vi.hoisted(() => {
  type Handler = () => void;

  class FakeSource {
    setData = vi.fn();
  }

  class FakeMap {
    static instances: FakeMap[] = [];
    static failNext = false;
    handlers = new Map<string, Handler[]>();
    sources = new Map<string, FakeSource>();
    fitBounds = vi.fn();
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
    emit(event: string) {
      this.handlers.get(event)?.forEach((handler) => handler());
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
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
      FakeMarker.instances.push(this);
    }
    setLngLat() {
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
