import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MapLegend } from "./MapLegend";

describe("MapLegend", () => {
  it("lists every stop kind with its own shape", () => {
    render(<MapLegend />);
    const [desktop] = screen.getAllByRole("list", { name: "Map legend" });
    const shapes = within(desktop)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("svg")?.getAttribute("data-shape"));
    expect(shapes).toEqual(["ring", "circle", "square", "diamond", "triangle", "pill", "star"]);
  });

  it("opens and closes the small-screen legend", async () => {
    render(<MapLegend />);
    const toggle = screen.getByRole("button", { name: "Legend" });
    const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(list).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(list).toBeVisible();
    expect(within(list).getByText("34-h restart")).toBeInTheDocument();
  });

  it("lifts the small-screen legend above the playback bar while a trip replays", () => {
    const { rerender } = render(<MapLegend />);
    const corner = () => screen.getByRole("button", { name: "Legend" }).parentElement!;
    expect(corner()).toHaveClass("bottom-[calc(60%+0.75rem)]");
    rerender(<MapLegend raised />);
    expect(corner()).toHaveClass("bottom-[calc(60%+0.75rem+6.75rem)]");
  });
});
