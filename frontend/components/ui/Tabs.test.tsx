import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TabPanel, Tabs } from "./Tabs";

const ITEMS = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
] as const;
type Id = (typeof ITEMS)[number]["id"];

function Harness({ initial = "one" }: { initial?: Id | null }) {
  const [selected, setSelected] = useState<Id | null>(initial);
  return (
    <>
      <Tabs idBase="t" label="Numbers" items={ITEMS} selected={selected} onSelect={setSelected} />
      {ITEMS.map((item) => (
        <TabPanel key={item.id} idBase="t" id={item.id} hidden={selected !== null && selected !== item.id}>
          {`${item.label} panel`}
        </TabPanel>
      ))}
    </>
  );
}

describe("Tabs", () => {
  it("wires tabs and panels together (WAI-ARIA tabs pattern)", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Numbers" })).toBeInTheDocument();
    const tab = screen.getByRole("tab", { name: "One" });
    const panel = screen.getByRole("tabpanel", { name: "One" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    expect(panel).toHaveAttribute("tabindex", "0");
    expect(panel).toHaveTextContent("One panel");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "false");
  });

  it("uses a roving tabindex", () => {
    render(<Harness initial="two" />);
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("keeps the tablist reachable when no tab is selected", () => {
    render(<Harness initial={null} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "false",
    ]);
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("moves focus and selection with the arrow, Home and End keys", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "One" }));

    await userEvent.keyboard("{ArrowRight}");
    const two = screen.getByRole("tab", { name: "Two" });
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Two" })).toBeVisible();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects a tab on click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Three" }));
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Three" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "One" })).not.toBeInTheDocument();
  });
});
