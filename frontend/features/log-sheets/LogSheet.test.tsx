import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { dutyPath } from "./geometry";
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

  it("makes brackets keyboard focusable and selectable with Enter", async () => {
    const onSelectStop = vi.fn();
    render(<LogSheet log={day1} bracketStopIds={["s3", "s5"]} onSelectStop={onSelectStop} />);
    const bracket = screen.getByRole("button", { name: "Stop at St. Louis, MO" });
    expect(bracket).toHaveAttribute("tabindex", "0");
    bracket.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelectStop).toHaveBeenCalledWith("s3");
  });
});
