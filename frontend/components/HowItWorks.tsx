"use client";

import { useRef } from "react";

/** "How it works" link in the top bar: a native <dialog> explaining the rules and the output. */
export function HowItWorks() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="hover:text-white">
        How it works
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="how-it-works-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto max-w-lg rounded-2xl p-0 text-text shadow-2xl backdrop:bg-brand/40"
      >
        <div className="space-y-4 p-6 text-sm leading-relaxed">
          <h2 id="how-it-works-title" className="text-lg font-extrabold">
            How Milepost plans a trip
          </h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Enter where the truck is, the pickup, the dropoff, and the hours already used in the
              70-hour / 8-day cycle.
            </li>
            <li>
              Milepost routes a truck (OpenRouteService heavy-goods profile) and simulates the trip
              under FMCSA Part 395: 11 h driving within a 14 h window, a 30-minute break after 8 h
              of driving, 10 h rests, the 70 h / 8-day limit with a 34-hour restart, fuel at least
              every 1,000 miles, and 1 hour each for pickup and dropoff.
            </li>
            <li>
              You get the route with every stop, a rule-by-rule compliance check, and a filled-in
              Driver&apos;s Daily Log for every day, ready to print.
            </li>
          </ol>
          <p className="text-muted">
            An independent checker re-verifies every plan. The Assumptions tab lists the exact
            rules applied.
          </p>
          <form method="dialog" className="text-right">
            <button className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white">
              Got it
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
