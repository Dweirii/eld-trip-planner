"use client";

import clsx from "clsx";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { StopIcon } from "@/components/StopIcon";
import { api } from "@/lib/api/client";
import type { Place } from "@/lib/api/types";
import type { LocationValue } from "./model";

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

/** GeolocationPositionError codes → what went wrong, in plain words. */
const GEOLOCATION_ERRORS: Record<number, string> = {
  1: "Location permission was denied.",
  2: "Your location isn't available right now.",
  3: "Finding your location timed out.",
};

export interface LocationInputProps {
  label: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  /** The map marker this place becomes (same shape and colour). */
  marker: "start" | "pickup" | "dropoff";
  error?: string;
  placeholder?: string;
  allowMyLocation?: boolean;
  search?: (query: string, signal: AbortSignal) => Promise<Place[]>;
  reverse?: (lat: number, lng: number) => Promise<Place>;
}

/** A US place picker: WAI-ARIA combobox with debounced, cancellable suggestions. */
export function LocationInput({
  label,
  value,
  onChange,
  marker,
  error,
  placeholder,
  allowMyLocation = false,
  search = api.searchPlaces,
  reverse = api.reversePlace,
}: LocationInputProps) {
  const inputId = useId();
  const listId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "locating">("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (query === null || query.trim().length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      search(query.trim(), controller.signal)
        .then((places) => {
          if (controller.signal.aborted) return;
          setOptions(places);
          setActive(places.length ? 0 : -1);
          // Suggestions never pop open over another field.
          setOpen(places.length > 0 && document.activeElement === inputRef.current);
          setStatus(places.length ? "idle" : "empty");
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setOptions([]);
          setOpen(false);
          setStatus("idle");
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);

  function type(text: string) {
    onChange({ label: text });
    setQuery(text);
    setLocalError(null);
    if (text.trim().length < MIN_QUERY) {
      setOptions([]);
      setOpen(false);
      setStatus("idle");
    }
  }

  function pick(place: Place) {
    onChange({ label: place.label, lat: place.lat, lng: place.lng });
    setQuery(null);
    setOptions([]);
    setOpen(false);
    setActive(-1);
    setStatus("idle");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocalError("Location isn't available in this browser.");
      return;
    }
    setStatus("locating");
    setLocalError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        reverse(coords.latitude, coords.longitude)
          .then((place) => pick({ label: place.label, lat: coords.latitude, lng: coords.longitude }))
          .catch(() => {
            setStatus("idle");
            setLocalError("We couldn't find a US town near you.");
          });
      },
      (failure) => {
        setStatus("idle");
        setLocalError(GEOLOCATION_ERRORS[failure.code] ?? GEOLOCATION_ERRORS[2]);
      },
      { timeout: 10_000 },
    );
  }

  const message = error ?? localError;
  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        className={clsx(
          "flex items-center gap-2 rounded-xl border-[1.5px] bg-white px-3 py-2 text-[13px] transition focus-within:border-teal",
          message ? "border-coral-ink" : "border-line",
        )}
      >
        <StopIcon kind={marker} size={13} className="shrink-0" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          autoComplete="off"
          value={value.label}
          placeholder={placeholder ?? label}
          onChange={(event) => type(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Leaving the field cancels the pending search (clearing the query aborts it).
            setOpen(false);
            setQuery(null);
            setStatus((current) => (current === "loading" ? "idle" : current));
          }}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-muted"
        />
        {status === "loading" && (
          <span className="text-[11px] text-muted" aria-hidden="true">
            …
          </span>
        )}
        {allowMyLocation && (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={status === "locating"}
            aria-label="Use my location"
            title="Use my location"
            className="text-base leading-none text-muted hover:text-teal disabled:opacity-40"
          >
            <span aria-hidden="true">◎</span>
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-white py-1 text-[13px] shadow-lg"
        >
          {options.map((place, index) => (
            <li
              key={`${place.label}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(place);
              }}
              onMouseEnter={() => setActive(index)}
              className={clsx("cursor-pointer px-3 py-1.5", index === active && "bg-surface")}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
      {status === "empty" && !message && (
        <p className="mt-1 text-[11px] text-muted">No US places match. Try &quot;City, ST&quot;.</p>
      )}
      {message && (
        <p id={messageId} role="alert" className="mt-1 text-[11px] font-semibold text-coral-ink">
          {message}
        </p>
      )}
    </div>
  );
}
