import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { LogSheets } from "./LogSheets";

function sheetWrappers() {
  return screen.getAllByRole("article").map((sheet) => sheet.parentElement!);
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

  it("follows the selected stop to its day", () => {
    render(<LogSheets trip={sampleTrip} selectedStopId="s7" onSelectStop={vi.fn()} />);
    expect(sheetWrappers()[1]).not.toHaveClass("hidden");
  });

  it("prints every sheet", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<LogSheets trip={sampleTrip} selectedStopId={null} onSelectStop={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print / PDF all" }));
    expect(print).toHaveBeenCalledOnce();
  });
});
