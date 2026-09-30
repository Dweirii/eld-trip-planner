import clsx from "clsx";
import type { RuleCheck } from "@/lib/api/types";
import { logHours, miles } from "@/lib/format";

function amount(value: number, unit: string): string {
  return unit === "mi" ? `${miles(value)} mi` : `${logHours(value)} h`;
}

/** The independent checker's verdict on every rule: observed / limit with the regulation cited. */
export function RuleChecks({ checks }: { checks: readonly RuleCheck[] }) {
  return (
    <ul className="divide-y divide-dashed divide-line">
      {checks.map((check) => (
        <li key={check.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
          <span>
            <span className="font-semibold">{check.title}</span>
            <span className="block text-[10.5px] text-muted">{check.citation}</span>
          </span>
          <span
            className={clsx(
              "flex shrink-0 items-center gap-1.5 font-bold tabular-nums",
              check.passed ? "text-teal" : "text-coral",
            )}
          >
            <span>{`${amount(check.observed, check.unit)} / ${amount(check.limit, check.unit)}`}</span>
            <span aria-hidden="true">{check.passed ? "✓" : "✕"}</span>
            <span className="sr-only">{check.passed ? "passed" : "failed"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
