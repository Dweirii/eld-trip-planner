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
    await userEvent.click(screen.getByRole("tab", { name: "Show all" }));
    expect(sheetWrappers().filter((w) => w.classList.contains("hidden"))).toHaveLength(0);
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
