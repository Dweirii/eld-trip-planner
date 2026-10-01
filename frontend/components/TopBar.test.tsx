import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopBar } from "./TopBar";

describe("TopBar", () => {
  it("links home, to the API docs and to GitHub, and explains how it works", () => {
    render(<TopBar />);
    expect(screen.getByRole("link", { name: /milepost/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "API docs" })).toHaveAttribute("href", "/api/docs/");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/Dweirii/eld-trip-planner",
    );
    expect(screen.getByRole("button", { name: "How it works" })).toBeInTheDocument();
  });

  it("offers the guided tour first, before How it works", () => {
    render(<TopBar />);
    const tour = screen.getByRole("link", { name: "Take the tour" });
    expect(tour).toHaveAttribute("href", "/?tour=1");
    const howItWorks = screen.getByRole("button", { name: "How it works" });
    expect(tour.compareDocumentPosition(howItWorks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
