"use client";

import { LOG_DETAIL_FIELDS, type TripFormValues } from "./model";

export interface DetailsSectionProps {
  values: TripFormValues;
  onChange: (values: TripFormValues) => void;
  error?: string;
}

/** Optional start time and log-sheet header details (defaults are filled in by the API). */
export function DetailsSection({ values, onChange, error }: DetailsSectionProps) {
  return (
    <details className="group text-[12px]">
      <summary className="cursor-pointer list-none font-bold text-teal">
        <span className="group-open:hidden">+ Start time &amp; log sheet details</span>
        <span className="hidden group-open:inline">− Start time &amp; log sheet details</span>
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            Start (home-terminal time; blank = now)
          </span>
          <input
            type="datetime-local"
            value={values.startTime}
            onChange={(event) => onChange({ ...values, startTime: event.target.value })}
            className="rounded-lg border-[1.5px] border-line px-2 py-1.5 focus:border-teal focus:outline-none"
          />
          {error && (
            <span role="alert" className="text-[11px] font-semibold text-coral">
              {error}
            </span>
          )}
        </label>
        {LOG_DETAIL_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{field.label}</span>
            <input
              value={values.details[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ ...values, details: { ...values.details, [field.key]: event.target.value } })
              }
              className="min-w-0 rounded-lg border-[1.5px] border-line px-2 py-1.5 focus:border-teal focus:outline-none"
            />
          </label>
        ))}
      </div>
    </details>
  );
}
