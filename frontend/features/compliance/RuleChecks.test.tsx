import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { RuleChecks } from "./RuleChecks";

describe("RuleChecks", () => {
  it("shows every rule with its observed value, limit and citation", () => {
    render(<RuleChecks checks={sampleTrip.compliance} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("11-hour driving limit")).toBeInTheDocument();
    expect(screen.getByText("11 h / 11 h")).toBeInTheDocument();
    expect(screen.getByText("972 mi / 1,000 mi")).toBeInTheDocument();
    expect(screen.getByText("49 CFR 395.3(a)(3)")).toBeInTheDocument();
    expect(screen.getAllByText("passed")).toHaveLength(7);
  });

  it("flags a failed rule", () => {
    const failing = sampleTrip.compliance.map((check) =>
      check.id === "driving_11h" ? { ...check, observed: 11.75, passed: false } : check,
    );
    render(<RuleChecks checks={failing} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("11.75 h / 11 h")).toBeInTheDocument();
  });
});
