import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { api } from "@/lib/api/client";
import { Workspace } from "./Workspace";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
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
  vi.mocked(api.health).mockResolvedValue({ status: "ok", engine_version: "test" });
  planTrip.mockResolvedValue(sampleTrip);
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
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
});
