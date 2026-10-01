import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { minuteToX } from "./geometry";
import { LogSheets, type LogSheetsProps, sheetPlayhead } from "./LogSheets";

function sheetWrappers() {
  return screen.getAllByRole("article").map((sheet) => sheet.parentElement!);
}

function nowLines() {
  return screen.getAllByRole("article", { hidden: true }).map((sheet) => {
    const line = sheet.querySelector('[data-role="now-line"] line');
    return line ? Number(line.getAttribute("x1")) : null;
  });
}

function visibleDays() {
  return sheetWrappers().map((wrapper) => !wrapper.classList.contains("hidden"));
}

function setup(props: Partial<LogSheetsProps> = {}) {
  const all: LogSheetsProps = { trip: sampleTrip, selectedStopId: null, onSelectStop: vi.fn(), ...props };
  const view = render(<LogSheets {...all} />);
  return { ...view, rerender: (next: Partial<LogSheetsProps>) => view.rerender(<LogSheets {...all} {...next} />) };
}

describe("LogSheets", () => {
  it("shows one day at a time but keeps every sheet in the page for printing", () => {
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    const wrappers = sheetWrappers();
    const [first, second] = wrappers;
    expect(first).not.toHaveClass("hidden");
    expect(second).toHaveClass("hidden", "print:block");
    expect(first).toHaveClass("print:break-after-page");
    expect(wrappers[wrappers.length - 1]).not.toHaveClass("print:break-after-page");
  });

  it("switches days with the tabs and can show every day", async () => {
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Day 2 · Fri, Oct 2" }));
    expect(sheetWrappers()[0]).toHaveClass("hidden");
    expect(sheetWrappers()[1]).not.toHaveClass("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(sheetWrappers().filter((w) => w.classList.contains("hidden"))).toHaveLength(0);
    expect(screen.getAllByRole("tab").filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Show all" })).toHaveAttribute("aria-pressed", "true");
  });

  it("links each day tab to its sheet and moves between days with the arrow keys", async () => {
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    const [day1, day2] = screen.getAllByRole("tab");
    const [panel1] = sheetWrappers();
    expect(panel1).toHaveAttribute("role", "tabpanel");
    expect(day1).toHaveAttribute("aria-controls", panel1.id);
    expect(panel1).toHaveAttribute("aria-labelledby", day1.id);

    day1.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(day2).toHaveFocus();
    expect(day2).toHaveAttribute("aria-selected", "true");
    expect(sheetWrappers()[1]).not.toHaveClass("hidden");
  });

  it("writes whole miles per day that add up to the trip total", () => {
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    const [day1, day2] = screen.getAllByRole("article");
    // 603.5 + 368.6 = 972.1 mi: 603 + 369 = 972, not 604 + 369 = 973.
    expect(within(day1).getByText("603")).toBeInTheDocument();
    expect(within(day2).getByText("369")).toBeInTheDocument();
  });

  it("follows the selected stop to its day", () => {
    render(<LogSheets trip={sampleTrip} selectedStopId="s7" onSelectStop={vi.fn()} />);
    expect(sheetWrappers()[1]).not.toHaveClass("hidden");
  });

  it("can be controlled: shows the day it is given and reports the one picked", async () => {
    const onActiveDayChange = vi.fn();
    const { rerender } = setup({ activeDay: 1, onActiveDayChange });
    expect(visibleDays()).toEqual([false, true]);

    await userEvent.click(screen.getByRole("tab", { name: "Day 1 · Thu, Oct 1" }));
    expect(onActiveDayChange).toHaveBeenCalledWith(0);
    expect(visibleDays()).toEqual([false, true]);

    rerender({ activeDay: 0, onActiveDayChange });
    expect(visibleDays()).toEqual([true, false]);
  });

  it("reports day changes when it keeps its own day", async () => {
    const onActiveDayChange = vi.fn();
    setup({ onActiveDayChange });
    await userEvent.click(screen.getByRole("tab", { name: "Day 2 · Fri, Oct 2" }));
    expect(onActiveDayChange).toHaveBeenCalledWith(1);
    expect(visibleDays()).toEqual([false, true]);
  });

  it("prints every sheet", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print / PDF all" }));
    expect(print).toHaveBeenCalledOnce();
  });

  describe("during a trip replay", () => {
    it("draws the now line on the playhead's day only", () => {
      setup({ playhead: { isoDate: "2026-10-02", minuteOfDay: 300, playing: false } });
      expect(nowLines()).toEqual([null, minuteToX(300)]);
    });

    it("draws no now line without a playhead", () => {
      setup({ playhead: null });
      expect(nowLines()).toEqual([null, null]);
    });

    it("puts the very end of the trip at 24:00 on the last sheet when the next day has none", () => {
      expect(sheetPlayhead(sampleTrip.daily_logs, { isoDate: "2026-10-03", minuteOfDay: 0 })).toEqual({
        index: 1,
        minute: 1440,
      });
      expect(sheetPlayhead(sampleTrip.daily_logs, { isoDate: "2026-10-01", minuteOfDay: 0 })).toEqual({
        index: 0,
        minute: 0,
      });
      expect(sheetPlayhead(sampleTrip.daily_logs, { isoDate: "2026-12-25", minuteOfDay: 0 })).toBeNull();
      expect(sheetPlayhead(sampleTrip.daily_logs, null)).toBeNull();
    });

    it("follows the playhead to the next day while playing", () => {
      const { rerender } = setup({ playhead: { isoDate: "2026-10-01", minuteOfDay: 1400, playing: true } });
      expect(visibleDays()).toEqual([true, false]);
      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 10, playing: true } });
      expect(visibleDays()).toEqual([false, true]);
      expect(screen.getByRole("tab", { name: "Day 2 · Fri, Oct 2" })).toHaveAttribute("aria-selected", "true");
    });

    it("does not fight a day the user picks, until the day changes or play resumes", async () => {
      const { rerender } = setup({ playhead: { isoDate: "2026-10-02", minuteOfDay: 10, playing: true } });
      await userEvent.click(screen.getByRole("tab", { name: "Day 1 · Thu, Oct 1" }));
      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 20, playing: true } });
      expect(visibleDays()).toEqual([true, false]);
      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 20, playing: false } });
      expect(visibleDays()).toEqual([true, false]);

      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 20, playing: true } });
      expect(visibleDays()).toEqual([false, true]);

      await userEvent.click(screen.getByRole("tab", { name: "Day 1 · Thu, Oct 1" }));
      rerender({ playhead: { isoDate: "2026-10-01", minuteOfDay: 900, playing: false } }); // scrubbed back a day
      expect(visibleDays()).toEqual([true, false]);
      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 60, playing: false } });
      expect(visibleDays()).toEqual([false, true]);
    });

    it("asks a parent that controls the day to follow the playhead", () => {
      const onActiveDayChange = vi.fn();
      const { rerender } = setup({
        activeDay: 0,
        onActiveDayChange,
        playhead: { isoDate: "2026-10-01", minuteOfDay: 1400, playing: true },
      });
      expect(onActiveDayChange).not.toHaveBeenCalled();
      rerender({ activeDay: 0, onActiveDayChange, playhead: { isoDate: "2026-10-02", minuteOfDay: 10, playing: true } });
      expect(onActiveDayChange).toHaveBeenCalledExactlyOnceWith(1);
      rerender({ activeDay: 1, onActiveDayChange, playhead: { isoDate: "2026-10-02", minuteOfDay: 20, playing: true } });
      expect(visibleDays()).toEqual([false, true]);
      expect(onActiveDayChange).toHaveBeenCalledOnce();
    });

    it("keeps showing every day if the user asked for all", async () => {
      const { rerender } = setup({ playhead: { isoDate: "2026-10-01", minuteOfDay: 700, playing: true } });
      await userEvent.click(screen.getByRole("button", { name: "Show all" }));
      rerender({ playhead: { isoDate: "2026-10-02", minuteOfDay: 10, playing: true } });
      expect(visibleDays()).toEqual([true, true]);
      expect(nowLines()).toEqual([null, minuteToX(10)]);
    });

    it("lets the playhead's day win over a selected stop on another day", () => {
      const { rerender } = setup({
        selectedStopId: "s5",
        playhead: { isoDate: "2026-10-01", minuteOfDay: 900, playing: true },
      });
      expect(visibleDays()).toEqual([true, false]);
      rerender({ selectedStopId: "s5", playhead: { isoDate: "2026-10-02", minuteOfDay: 10, playing: true } });
      expect(visibleDays()).toEqual([false, true]);
      // A new selection takes over again.
      rerender({ selectedStopId: "s3", playhead: { isoDate: "2026-10-02", minuteOfDay: 20, playing: true } });
      expect(visibleDays()).toEqual([true, false]);
    });
  });
});
