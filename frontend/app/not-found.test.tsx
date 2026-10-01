import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";
import TripNotFound from "./trips/[id]/not-found";

describe("not-found pages", () => {
  it("are generic at the root and specific for trips", () => {
    const { unmount } = render(<NotFound />);
    expect(screen.getByRole("heading", { name: "That page isn't here" })).toBeInTheDocument();
    unmount();
    render(<TripNotFound />);
    expect(screen.getByRole("heading", { name: "That trip isn't here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan a new trip" })).toHaveAttribute("href", "/");
  });
});
