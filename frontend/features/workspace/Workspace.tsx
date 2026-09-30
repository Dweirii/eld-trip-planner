"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { LogSheets } from "@/features/log-sheets/LogSheets";
import { type PreviewPoint, previewPoints } from "@/features/trip-form/model";
import { TripForm } from "@/features/trip-form/TripForm";
import { api } from "@/lib/api/client";
import type { Trip } from "@/lib/api/types";
import { NoticeToast } from "./NoticeToast";
import { PlanningOverlay } from "./PlanningOverlay";
import { ResultsPanel } from "./ResultsPanel";
import { usePlanner } from "./usePlanner";

const RouteMap = dynamic(() => import("@/features/route-map/RouteMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#e8efef]" aria-hidden="true" />,
});

/** One shared empty preview, so showing results never hands the map a "new" array. */
const NO_PREVIEW: PreviewPoint[] = [];

/** The map workspace: the map fills the screen, the panel floats over it, the log sheets follow. */
export function Workspace({ initialTrip = null }: { initialTrip?: Trip | null }) {
  const planner = usePlanner(initialTrip);
  const { trip, mode, values, selectedStopId } = planner;
  const { current, pickup, dropoff } = values;
  const preview = useMemo(() => previewPoints(current, pickup, dropoff), [current, pickup, dropoff]);

  useEffect(() => {
    // Wake the serverless API while the user fills in the form.
    api.health().catch(() => undefined);
  }, []);

  const showResults = mode === "results" && trip !== null;
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-label="Trip planner"
        className="relative h-[calc(100svh-3rem)] min-h-[560px] overflow-hidden print:hidden"
      >
        <RouteMap
          trip={showResults ? trip : null}
          preview={showResults ? NO_PREVIEW : preview}
          selectedStopId={selectedStopId}
          onSelectStop={planner.selectStop}
        />
        <aside aria-label="Planner panel" className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-[0_-6px_24px_rgb(4_59_75/0.18)] lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-4 lg:max-h-[calc(100%-2rem)] lg:w-[340px] lg:rounded-2xl lg:shadow-[0_8px_30px_rgb(4_59_75/0.16)]">
          <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line lg:hidden" />
          {showResults ? (
            <ResultsPanel
              trip={trip}
              selectedStopId={selectedStopId}
              onSelectStop={planner.selectStop}
              onEdit={planner.edit}
              onNewTrip={planner.reset}
            />
          ) : (
            <>
              {trip && (
                <button
                  type="button"
                  onClick={planner.cancelEdit}
                  className="mb-2 text-[11px] font-semibold text-muted hover:text-brand"
                >
                  <span aria-hidden="true">←</span> Back to results
                </button>
              )}
              <TripForm
              values={values}
              errors={planner.errors}
              pending={planner.pending}
              onChange={planner.setValues}
              onSubmit={() => void planner.plan(values)}
              onExample={(example) => void planner.plan(example)}
              />
            </>
          )}
        </aside>
        {planner.pending && <PlanningOverlay />}
        {planner.notice && (
          <NoticeToast notice={planner.notice} onRetry={() => void planner.retry()} onDismiss={planner.dismissNotice} />
        )}
      </section>
      {showResults && <LogSheets trip={trip} selectedStopId={selectedStopId} onSelectStop={planner.selectStop} />}
    </main>
  );
}
