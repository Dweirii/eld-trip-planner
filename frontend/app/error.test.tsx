import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("error page", () => {
  it("explains the failure and offers a retry and a way home", async () => {
    const retry = vi.fn();
    render(<ErrorPage error={new Error("Trip API responded with 503")} retry={retry} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Something went wrong loading this page" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Plan a new trip" })).toHaveAttribute("href", "/");
  });
});
