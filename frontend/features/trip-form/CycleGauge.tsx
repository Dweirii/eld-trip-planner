"use client";

import { logHours } from "@/lib/format";

const CYCLE_LIMIT = 70;

export interface CycleGaugeProps {
  value: number;
  onChange: (hours: number) => void;
  error?: string;
}

/** Hours already used in the 70-hour / 8-day cycle: a slider, an exact number, and what's left. */
export function CycleGauge({ value, onChange, error }: CycleGaugeProps) {
  const valid = Number.isFinite(value);
  const used = valid ? Math.min(Math.max(value, 0), CYCLE_LIMIT) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="cycle-used" className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
          Current cycle used
        </label>
        <div className="flex items-center gap-1 text-[12px]">
          <input
            type="number"
            aria-label="Hours used"
            min={0}
            max={CYCLE_LIMIT}
            step={0.25}
            value={valid ? value : ""}
            onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
            className="w-16 rounded-lg border-[1.5px] border-line px-2 py-1 text-right font-semibold tabular-nums focus:border-teal focus:outline-none"
          />
          <span className="text-muted">h</span>
        </div>
      </div>
      <input
        id="cycle-used"
        type="range"
        min={0}
        max={CYCLE_LIMIT}
        step={0.25}
        value={used}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-describedby="cycle-used-help"
        className="mt-2 w-full accent-teal"
      />
      <p id="cycle-used-help" className="mt-1 flex justify-between text-[11px] text-muted">
        <span>
          <b className="text-text">{`${logHours(used)} h`}</b> used
        </span>
        <span>
          <b className="text-text">{`${logHours(CYCLE_LIMIT - used)} h`}</b> left of 70
        </span>
      </p>
      {error && (
        <p role="alert" className="mt-1 text-[11px] font-semibold text-coral">
          {error}
        </p>
      )}
    </div>
  );
}
