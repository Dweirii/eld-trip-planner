import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { dutyPath, minuteToX, rowCenterY } from "./geometry";
import { LogSheet } from "./LogSheet";

const day1 = sampleTrip.daily_logs[0];

function texts(element: Element | null): string[] {
  return [...(element?.querySelectorAll("text") ?? [])].map((node) => node.textContent ?? "");
}

describe("LogSheet", () => {
  it("fills in the header like the paper form", () => {
    render(<LogSheet log={day1} />);
    expect(screen.getByText("10 / 01 / 2026")).toBeInTheDocument();
    expect(screen.getByText("Milepost Freight Co.")).toBeInTheDocument();
    expect(screen.getByText("604")).toBeInTheDocument(); // 603.5 miles today
    expect(screen.getByText("TRK 1042 / TRL 88317")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // no co-driver
  });

  it("draws the duty line and writes each row total, summing to 24", () => {
    const { container } = render(<LogSheet log={day1} />);
    expect(container.querySelector('[data-role="duty-line"]')).toHaveAttribute("d", dutyPath(day1.segments));
    expect(texts(container.querySelector('[data-role="totals"]'))).toEqual(["6", "6", "11", "1", "=24"]);
  });

  it("lists the remarks and fills in the recap", () => {
    const { container } = render(<LogSheet log={day1} />);
    const remarks = screen.getByRole("list", { name: /remarks/i });
    expect(within(remarks).getAllByRole("listitem")).toHaveLength(4);
    expect(within(remarks).getByText(/Pickup — on duty/)).toBeInTheDocument();
    const recap = container.querySelector('[data-role="recap"]');
    expect([...(recap?.querySelectorAll("[data-value]") ?? [])].map((n) => n.textContent)).toEqual([
      "12",
      "24.5",
      "45.5",
      "24.5",
    ]);
  });

  it("gives screen readers a table of the duty segments", () => {
    render(<LogSheet log={day1} />);
    const table = screen.getByRole("table", { name: /duty status segments/i });
    expect(within(table).getAllByRole("row")).toHaveLength(1 + day1.segments.length);
  });

  it("selects the stop behind a bracket", async () => {
    const onSelectStop = vi.fn();
    render(<LogSheet log={day1} bracketStopIds={["s3", "s5"]} onSelectStop={onSelectStop} />);
    await userEvent.click(screen.getByRole("button", { name: "Stop at St. Louis, MO" }));
    expect(onSelectStop).toHaveBeenCalledWith("s3");
  });

  it("exposes the grid as a labelled group so its bracket buttons reach assistive tech", () => {
    const { container } = render(<LogSheet log={day1} bracketStopIds={["s3", "s5"]} onSelectStop={vi.fn()} />);
    const grid = screen.getByRole("group", { name: "Duty status grid for 2026-10-01" });
    expect(within(grid).getByRole("button", { name: "Stop at St. Louis, MO" })).toBeInTheDocument();
    expect(container.querySelector('[data-role="duty-line"]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[data-role="totals"]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText(/Totals: Off duty 6 h, Sleeper berth 6 h, Driving 11 h, On duty \(not driving\) 1 h/)).toHaveClass(
      "sr-only",
    );
  });

  it("writes the miles it is given (so the days can add up to the trip total)", () => {
    render(<LogSheet log={day1} milesToday={603} />);
    expect(screen.getByText("603")).toBeInTheDocument();
  });

  it("makes brackets keyboard focusable and selectable with Enter", async () => {
    const onSelectStop = vi.fn();
    render(<LogSheet log={day1} bracketStopIds={["s3", "s5"]} onSelectStop={onSelectStop} />);
    const bracket = screen.getByRole("button", { name: "Stop at St. Louis, MO" });
    expect(bracket).toHaveAttribute("tabindex", "0");
    bracket.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelectStop).toHaveBeenCalledWith("s3");
  });

  describe("the replay's now line", () => {
    it("crosses the grid at the playhead's minute, with the time on top and a dot on the current status", () => {
      const { container } = render(<LogSheet log={day1} nowMinute={600} />);
      const now = container.querySelector('[data-role="now-line"]')!;
      expect(now).toHaveAttribute("aria-hidden", "true");
      expect(now).toHaveClass("print:hidden");
      const line = now.querySelector("line")!;
      expect(line).toHaveAttribute("x1", String(minuteToX(600)));
      expect(line).toHaveAttribute("x2", String(minuteToX(600)));
      expect(line).toHaveAttribute("stroke", "#d6304b");
      expect(texts(now)).toEqual(["10:00"]);
      expect(now.querySelector("circle")).toHaveAttribute("cy", String(rowCenterY("driving")));
    });

    it("moves with the minute, down to fractions of one", () => {
      const { container, rerender } = render(<LogSheet log={day1} nowMinute={1079.5} />);
      expect(container.querySelector('[data-role="now-line"] line')).toHaveAttribute("x1", String(minuteToX(1079.5)));
      expect(texts(container.querySelector('[data-role="now-line"]'))).toEqual(["17:59"]);
      rerender(<LogSheet log={day1} nowMinute={1440} />);
      expect(texts(container.querySelector('[data-role="now-line"]'))).toEqual(["24:00"]);
    });

    it("is not drawn without a playhead", () => {
      const { container, rerender } = render(<LogSheet log={day1} nowMinute={600} />);
      rerender(<LogSheet log={day1} nowMinute={null} />);
      expect(container.querySelector('[data-role="now-line"]')).toBeNull();
      rerender(<LogSheet log={day1} />);
      expect(container.querySelector('[data-role="now-line"]')).toBeNull();
    });
  });
});
