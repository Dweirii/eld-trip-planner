"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_FORM,
  type FormErrors,
  type TripFormValues,
  fromTrip,
  mapApiErrors,
  toRequest,
  validate,
} from "@/features/trip-form/model";
import { ApiError, api } from "@/lib/api/client";
import type { Trip } from "@/lib/api/types";

export interface Notice {
  message: string;
  retry: boolean;
}

/** All planner state: form values, validation, the planned trip, selection, and notices. */
export function usePlanner(initialTrip: Trip | null) {
  const [trip, setTrip] = useState<Trip | null>(initialTrip);
  const [mode, setMode] = useState<"form" | "results">(initialTrip ? "results" : "form");
  const [values, setValuesState] = useState<TripFormValues>(initialTrip ? fromTrip(initialTrip) : EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const requestRef = useRef(0);

  useEffect(
    () => () => {
      requestRef.current++;
    },
    [],
  );

  const plan = useCallback(async (next: TripFormValues) => {
    setValuesState(next);
    const clientErrors = validate(next);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    const request = ++requestRef.current;
    setPending(true);
    setNotice(null);
    try {
      const planned = await api.planTrip(toRequest(next));
      if (request !== requestRef.current) return;
      setTrip(planned);
      setMode("results");
      setSelectedStopId(null);
      window.history.replaceState(null, "", `/trips/${planned.id}`);
    } catch (error) {
      if (request !== requestRef.current) return;
      if (error instanceof ApiError) {
        const fieldErrors = mapApiErrors(error.fieldErrors());
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          setNotice({
            message: error.message,
            retry: error.status === 0 || error.status >= 500 || error.code === "upstream_unavailable",
          });
        }
      } else {
        setNotice({ message: "Something went wrong. Please try again.", retry: true });
      }
    } finally {
      if (request === requestRef.current) setPending(false);
    }
  }, []);

  /** Update the form and clear the errors of the fields that changed. */
  const setValues = (next: TripFormValues) => {
    setErrors((current) => {
      const remaining = { ...current };
      for (const key of Object.keys(current) as (keyof TripFormValues)[]) {
        if (next[key] !== values[key]) delete remaining[key];
      }
      return remaining;
    });
    setValuesState(next);
  };

  const reset = useCallback(() => {
    requestRef.current++;
    setPending(false);
    setTrip(null);
    setValuesState(EMPTY_FORM);
    setErrors({});
    setNotice(null);
    setSelectedStopId(null);
    setMode("form");
    window.history.replaceState(null, "", "/");
  }, []);

  const selectStop = useCallback((id: string | null) => {
    setSelectedStopId((current) => (id === null || id === current ? null : id));
  }, []);

  return {
    trip,
    mode,
    values,
    errors,
    pending,
    notice,
    selectedStopId,
    plan,
    retry: () => plan(values),
    edit: () => setMode("form"),
    cancelEdit: () => {
      if (!trip) return;
      setMode("results");
      setValuesState(fromTrip(trip));
      setErrors({});
    },
    reset,
    selectStop,
    setValues,
    dismissNotice: () => setNotice(null),
  };
}
