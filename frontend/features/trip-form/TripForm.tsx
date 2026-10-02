"use client";

import Link from "next/link";
import type { Ref } from "react";
import { TOUR_HREF } from "@/features/tour/invite";
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
  /** Focused by the workspace when the panel switches to the form. */
  headingRef?: Ref<HTMLHeadingElement>;
}

export function TripForm({ values, errors, pending, onChange, onSubmit, onExample, headingRef }: TripFormProps) {
  const setLocation = (key: "current" | "pickup" | "dropoff") => (value: LocationValue) =>
    onChange({ ...values, [key]: value });

  return (
    <form
      noValidate
      data-tour="trip-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        {/* Focused when the form comes back: a highlight inside its own box, clear of the line below. */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="-mx-1.5 rounded-md px-1.5 text-[15px] font-extrabold focus-visible:bg-[#e6f3f3] focus-visible:shadow-[inset_3px_0_0_var(--color-teal)] focus-visible:outline-hidden"
        >
          Plan a trip
        </h2>
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
          marker="pickup"
          value={values.pickup}
          onChange={setLocation("pickup")}
          error={errors.pickup}
        />
        <LocationInput
          label="Dropoff location"
          marker="dropoff"
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
      <DetailsSection values={values} onChange={onChange} errors={errors} />
      <button
        type="submit"
        data-tour="plan"
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
      {/* A second, quiet way into the guided tour, for someone looking at an empty form. */}
      <Link
        href={TOUR_HREF}
        className="-mt-1 flex w-fit items-center gap-1.5 text-[12px] font-semibold text-teal hover:underline"
      >
        <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false">
          <path
            d="M2.5 1.4v7.2a.5.5 0 0 0 .76.43l5.6-3.6a.5.5 0 0 0 0-.86l-5.6-3.6a.5.5 0 0 0-.76.43z"
            fill="currentColor"
          />
        </svg>
        Not sure where to start? Take the tour
      </Link>
    </form>
  );
}
