"use client";

import { EXAMPLE_TRIPS } from "./examples";
import type { TripFormValues } from "./model";

/** One click fills the form with a ready-made trip and plans it. */
export function ExampleChips({ onPick, disabled }: { onPick: (values: TripFormValues) => void; disabled: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Or try an example</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLE_TRIPS.map((example) => (
          <button
            key={example.id}
            type="button"
            disabled={disabled}
            title={example.hint}
            onClick={() => onPick(example.values)}
            className="rounded-full bg-[#e3f2f2] px-2.5 py-1 text-[11px] font-semibold text-[#006b6b] hover:bg-[#d3eaea] disabled:opacity-50"
          >
            {example.label}
            <span className="sr-only">{` — ${example.hint}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
