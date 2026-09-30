"use client";

import { CycleGauge } from "./CycleGauge";
import { DetailsSection } from "./DetailsSection";
import { ExampleChips } from "./ExampleChips";
import { LocationInput } from "./LocationInput";
import type { FormErrors, LocationValue, TripFormValues } from "./model";

export interface TripFormProps {
  values: TripFormValues;
  errors: FormErrors;
  pending: boolean;
  onChange: (values: TripFormValues) => void;
  onSubmit: () => void;
  onExample: (values: TripFormValues) => void;
}

export function TripForm({ values, errors, pending, onChange, onSubmit, onExample }: TripFormProps) {
  const setLocation = (key: "current" | "pickup" | "dropoff") => (value: LocationValue) =>
    onChange({ ...values, [key]: value });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-extrabold">Plan a trip</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          Route, required stops and filled-in daily logs under FMCSA Hours-of-Service rules.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Route</legend>
        <LocationInput
          label="Current location"
          marker="start"
          allowMyLocation
          value={values.current}
          onChange={setLocation("current")}
          error={errors.current}
        />
        <LocationInput
          label="Pickup location"
          marker="stop"
          value={values.pickup}
          onChange={setLocation("pickup")}
          error={errors.pickup}
        />
        <LocationInput
          label="Dropoff location"
          marker="stop"
          value={values.dropoff}
          onChange={setLocation("dropoff")}
          error={errors.dropoff}
        />
      </fieldset>
      <CycleGauge
        value={values.cycleUsed}
        onChange={(cycleUsed) => onChange({ ...values, cycleUsed })}
        error={errors.cycleUsed}
      />
      <DetailsSection values={values} onChange={onChange} error={errors.startTime} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-coral-ink py-2.5 text-[13px] font-extrabold text-white shadow-sm transition hover:brightness-95 disabled:opacity-70"
      >
        {pending ? (
          "Planning…"
        ) : (
          <>
            Plan trip <span aria-hidden="true">→</span>
          </>
        )}
      </button>
      <ExampleChips onPick={onExample} disabled={pending} />
    </form>
  );
}
