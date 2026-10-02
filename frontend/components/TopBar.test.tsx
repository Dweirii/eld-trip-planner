import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => {
  navigation.pathname = "/";
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

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

  it("invites a first visit to take the tour: the link pulses, until a tour has been seen", () => {
    const { unmount } = render(<TopBar />);
    const tour = screen.getByRole("link", { name: "Take the tour" });
    expect(tour).toHaveAttribute("href", "/?tour=1");
    expect(tour.closest(".tour-invite")).toHaveClass("is-live");
    unmount();

    window.localStorage.setItem("milepost:tour-seen", "1");
    render(<TopBar />);
    const seen = screen.getByRole("link", { name: "Take the tour" });
    expect(seen).toHaveAttribute("href", "/?tour=1");
    expect(seen.closest(".tour-invite")).not.toHaveClass("is-live");
  });

  it("keeps the header one line high, whatever the invitation does", () => {
    render(<TopBar />);
    expect(screen.getByRole("banner")).toHaveClass("h-12", "shrink-0");
  });
});
