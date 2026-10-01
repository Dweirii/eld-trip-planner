import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { api } from "@/lib/api/client";
import { Workspace } from "./Workspace";

const navigation = vi.hoisted(() => ({ pathname: "/", search: "", router: { replace: () => undefined } }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));
// The map needs WebGL; RouteMap has its own tests.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div role="region" aria-label="Route map" />;
    },
}));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...original, api: { ...original.api, planTrip: vi.fn(), health: vi.fn() } };
});

const planTrip = vi.mocked(api.planTrip);
const TITLE = "Chicago → St. Louis → Dallas";

beforeEach(() => {
  navigation.pathname = "/";
  navigation.search = "";
  vi.mocked(api.health).mockResolvedValue({ status: "ok", engine_version: "test" });
  planTrip.mockResolvedValue(sampleTrip);
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  // Replay frames never run on their own here; the tests scrub instead.
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

async function planExample() {
  await userEvent.click(screen.getByRole("button", { name: /Multi-day/ }));
  return screen.findByRole("heading", { name: TITLE });
}

describe("Workspace", () => {
  it("titles the page and puts the panel before the map in reading order", () => {
    render(<Workspace />);
    expect(screen.getByRole("heading", { level: 1, name: "Milepost: ELD trip planner" })).toHaveClass("sr-only");
    const panel = screen.getByRole("complementary", { name: "Planner panel" });
    const map = screen.getByRole("region", { name: "Route map" });
    expect(panel.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves focus to the panel heading whenever the panel changes", async () => {
    render(<Workspace />);
    expect(await planExample()).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Edit trip" }));
    expect(screen.getByRole("heading", { name: "Plan a trip" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(screen.getByRole("heading", { name: TITLE })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "New trip" }));
    expect(screen.getByRole("heading", { name: "Plan a trip" })).toHaveFocus();
  });

  it("does not move focus on first load", () => {
    render(<Workspace initialTrip={sampleTrip} />);
    expect(screen.getByRole("heading", { name: TITLE })).not.toHaveFocus();
  });

  it("announces planning through a status region that is always present", async () => {
    let finish: (trip: typeof sampleTrip) => void = () => undefined;
    planTrip.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<Workspace />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole("button", { name: /Multi-day/ }));
    expect(status).toHaveTextContent("Planning under FMCSA rules…");
    await act(async () => finish(sampleTrip));
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });

  it("jumps to the daily logs from the results panel", async () => {
    render(<Workspace initialTrip={sampleTrip} />);
    await userEvent.click(screen.getByRole("button", { name: "Daily logs" }));
    const heading = screen.getByRole("heading", { name: "Daily logs" });
    expect(heading).toHaveFocus();
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("jumps without animation when the user prefers reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduce") })));
    render(<Workspace initialTrip={sampleTrip} />);
    await userEvent.click(screen.getByRole("button", { name: "Daily logs" }));
    expect(screen.getByRole("heading", { name: "Daily logs" }).scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("keeps the results while the URL catches up after planning", async () => {
    render(<Workspace />);
    await planExample();
    // usePathname can still read "/" right after the plan; that is not a navigation home.
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("shows a fresh, empty planner when the logo brings the user back to /", async () => {
    const { rerender } = render(<Workspace />);
    await planExample();
    navigation.pathname = `/trips/${sampleTrip.id}`;
    rerender(<Workspace />);
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();

    navigation.pathname = "/";
    rerender(<Workspace />);
    expect(screen.getByRole("heading", { name: "Plan a trip" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current location" })).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Daily logs" })).not.toBeInTheDocument();
  });

  it("opens the results on the itinerary each time they appear", async () => {
    render(<Workspace initialTrip={sampleTrip} />);
    await userEvent.click(screen.getByRole("tab", { name: "Rules 7/7" }));
    await userEvent.click(screen.getByRole("tab", { name: "Day 2 · Fri, Oct 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit trip" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(screen.getByRole("tab", { name: "Itinerary" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Day 1 · Thu, Oct 1" })).toHaveAttribute("aria-selected", "true");
  });

  describe("guided tour", () => {
    it("starts from ?tour=1 on an empty planner and types the first city", async () => {
      navigation.search = "tour=1&tourSpeed=20";
      window.history.replaceState(null, "", "/?tour=1&tourSpeed=20");
      render(<Workspace initialTrip={sampleTrip} />);
      const tour = screen.getByRole("region", { name: "Guided tour" });
      expect(within(tour).getByText(/Milepost plans a truck trip/)).toBeInTheDocument();
      expect(window.location.search).toBe("");
      expect(await screen.findByRole("heading", { name: "Plan a trip" })).toBeInTheDocument();

      const current = screen.getByRole("combobox", { name: "Current location" });
      await waitFor(() => expect(current).toHaveValue("Chicago, IL"), { timeout: 3000 });
      expect(api.planTrip).not.toHaveBeenCalled();

      await userEvent.click(within(tour).getByRole("button", { name: "Exit tour" }));
      expect(screen.queryByRole("region", { name: "Guided tour" })).not.toBeInTheDocument();
    });

    it("leaves focus where it is when the tour brings up the results (its captions narrate instead)", async () => {
      navigation.search = "tour=1&tourSpeed=20";
      window.history.replaceState(null, "", "/?tour=1&tourSpeed=20");
      render(<Workspace />);
      // Next, step by step, to the results: the tour plans the trip itself.
      for (let step = 0; step < 5; step++) fireEvent.keyDown(document.body, { key: "ArrowRight" });
      const heading = await screen.findByRole("heading", { name: TITLE });
      expect(within(screen.getByRole("region", { name: "Guided tour" })).getByText("6 / 16")).toBeInTheDocument();
      expect(heading).not.toHaveFocus();
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe("trip replay", () => {
    const slider = () => screen.getByRole("slider", { name: "Trip time" });
    const nowLine = (date: string) =>
      screen.getByRole("article", { name: `Driver's daily log for ${date}`, hidden: true }).querySelector(
        '[data-role="now-line"]',
      );

    it("offers to play the trip once there are results", async () => {
      render(<Workspace />);
      expect(screen.queryByRole("button", { name: "Play trip" })).not.toBeInTheDocument();
      await planExample();
      expect(screen.getByRole("button", { name: "Play trip" })).toBeInTheDocument();
    });

    it("moves the itinerary's Now and the log's now line with the scrubber", async () => {
      render(<Workspace initialTrip={sampleTrip} />);
      expect(screen.queryByText("Now")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
      expect(screen.getByText("Driving to St. Louis, MO…")).toBeInTheDocument();
      expect(nowLine("2026-10-01")).not.toBeNull();

      fireEvent.change(slider(), { target: { value: "1000" } });
      const rest = screen.getByRole("button", { name: /10-h rest · Jasper, AR/ });
      expect(within(rest).getByText("Now")).toBeInTheDocument();
      expect(screen.queryByText(/Driving to/)).not.toBeInTheDocument();

      fireEvent.change(slider(), { target: { value: "1500" } });
      expect(nowLine("2026-10-01")).toBeNull();
      expect(nowLine("2026-10-02")).not.toBeNull();
      expect(screen.getByRole("tab", { name: "Day 2 · Fri, Oct 2" })).toHaveAttribute("aria-selected", "true");
    });

    it("stops and resets on Edit trip and New trip", async () => {
      render(<Workspace initialTrip={sampleTrip} />);
      await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
      fireEvent.change(slider(), { target: { value: "1000" } });

      await userEvent.click(screen.getByRole("button", { name: "Edit trip" }));
      expect(screen.queryByRole("group", { name: "Trip replay" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Back to results" }));
      expect(screen.getByRole("button", { name: "Play trip" })).toBeInTheDocument();
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
      expect(screen.queryByText("Now")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
      expect(slider()).toHaveAttribute("aria-valuetext", "Thu, Oct 1: Driving to St. Louis, MO"); // back at the start
      await userEvent.click(screen.getByRole("button", { name: "New trip" }));
      expect(screen.queryByRole("group", { name: "Trip replay" })).not.toBeInTheDocument();
    });
  });
});
