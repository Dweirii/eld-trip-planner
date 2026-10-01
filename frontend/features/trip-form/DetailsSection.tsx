"use client";

import { useEffect, useId, useRef } from "react";
import { type FormErrors, LOG_DETAIL_FIELDS, type TripFormValues, detailErrorKey } from "./model";

export interface DetailsSectionProps {
  values: TripFormValues;
  onChange: (values: TripFormValues) => void;
  errors: FormErrors;
}

const LABEL = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted";
const INPUT =
  "min-w-0 rounded-lg border-[1.5px] px-2 py-1.5 placeholder:text-muted focus:border-teal focus:outline-none";

/** Optional start time and log-sheet header details (defaults are filled in by the API). */
export function DetailsSection({ values, onChange, errors }: DetailsSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const baseId = useId();
  const hasError =
    Boolean(errors.startTime || errors.details) ||
    LOG_DETAIL_FIELDS.some((field) => errors[detailErrorKey(field.key)]);

  useEffect(() => {
    // Open the section when it holds an error, so the message is seen. Never force it closed:
    // fixing the error mid-edit must not collapse the fields under the user.
    if (hasError && detailsRef.current) detailsRef.current.open = true;
  }, [hasError]);

  return (
    <details ref={detailsRef} className="group text-[12px]">
      <summary className="cursor-pointer list-none font-bold text-teal">
        <span className="group-open:hidden">+ Start time &amp; log sheet details</span>
        <span className="hidden group-open:inline">− Start time &amp; log sheet details</span>
      </summary>
      {errors.details && (
        <p role="alert" className="mt-2 text-[11px] font-semibold text-coral-ink">
          {errors.details}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1">
          <label htmlFor={`${baseId}-start`} className={LABEL}>
            Start (home-terminal time; blank = now)
          </label>
          <input
            id={`${baseId}-start`}
            type="datetime-local"
            value={values.startTime}
            aria-invalid={errors.startTime ? true : undefined}
            aria-describedby={errors.startTime ? `${baseId}-start-error` : undefined}
            onChange={(event) => onChange({ ...values, startTime: event.target.value })}
            className={`${INPUT} ${errors.startTime ? "border-coral-ink" : "border-line"}`}
          />
          {errors.startTime && (
            <span id={`${baseId}-start-error`} role="alert" className="text-[11px] font-semibold text-coral-ink">
              {errors.startTime}
            </span>
          )}
        </div>
        {LOG_DETAIL_FIELDS.map((field) => {
          const error = errors[detailErrorKey(field.key)];
          const errorId = `${baseId}-${field.key}-error`;
          return (
            <div key={field.key} className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-${field.key}`} className={LABEL}>
                {field.label}
              </label>
              <input
                id={`${baseId}-${field.key}`}
                value={values.details[field.key] ?? ""}
                placeholder={field.placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) =>
                  onChange({ ...values, details: { ...values.details, [field.key]: event.target.value } })
                }
                className={`${INPUT} ${error ? "border-coral-ink" : "border-line"}`}
              />
              {error && (
                <span id={errorId} role="alert" className="text-[11px] font-semibold leading-snug text-coral-ink">
                  {error}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
