import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("trip loading skeleton", () => {
  it("shows a workspace-shaped skeleton and says what is loading", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the trip…");
  });
});
