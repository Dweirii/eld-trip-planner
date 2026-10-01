"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LogSheets } from "@/features/log-sheets/LogSheets";
import { PlaybackBar } from "@/features/replay/PlaybackBar";
import { useTripReplay } from "@/features/replay/useTripReplay";
import { TourControllerContext, useTourController } from "@/features/tour/controller";
import { Tour } from "@/features/tour/Tour";
import { type PreviewPoint, previewPoints } from "@/features/trip-form/model";
import { TripForm } from "@/features/trip-form/TripForm";
import { api } from "@/lib/api/client";
import type { Trip } from "@/lib/api/types";
import { NoticeToast } from "./NoticeToast";
import { PlanningOverlay } from "./PlanningOverlay";
import { type ResultsTab, ResultsPanel } from "./ResultsPanel";
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
  const { trip, mode, values, selectedStopId, reset } = planner;
  const { current, pickup, dropoff } = values;
  const preview = useMemo(() => previewPoints(current, pickup, dropoff), [current, pickup, dropoff]);
  const showResults = mode === "results" && trip !== null;
  // The replay belongs to the results on screen: Edit trip, New trip or a new plan start it over.
  const replay = useTripReplay(showResults ? trip : null);

  useEffect(() => {
    // Wake the serverless API while the user fills in the form.
    api.health().catch(() => undefined);
  }, []);

  // Move focus to the panel's heading when the panel changes (a plan succeeds, Edit trip,
  // Back to results, New trip), but not on first load.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const view = showResults ? `results:${trip.id}` : trip ? "edit" : "form";
  const lastView = useRef(view);

  // The results' tab and log day live here so the guided tour can set them. Each time the results
  // appear (a new plan, Back to results) they open on the itinerary and Day 1.
  const [panelTab, setPanelTab] = useState<ResultsTab>("itinerary");
  const [logDay, setLogDay] = useState(0);
  const [tabsView, setTabsView] = useState(view);
  if (tabsView !== view) {
    setTabsView(view);
    setPanelTab("itinerary");
    setLogDay(0);
  }

  const tour = useTourController(
    {
      values,
      trip,
      results: showResults,
      pending: planner.pending,
      notice: planner.notice,
      invalid: Object.keys(planner.errors).length > 0,
      selectedStopId,
      tab: panelTab,
      logDay,
      replay: { active: replay.active, playing: replay.playing, ended: replay.ended },
    },
    {
      reset,
      setValues: planner.setValues,
      plan: (next) => void planner.plan(next),
      selectStop: planner.selectStop,
      showTab: setPanelTab,
      showDay: setLogDay,
      playReplay: replay.play,
      pauseReplay: replay.pause,
      resetReplay: replay.reset,
      setReplaySpeed: replay.setSpeed,
    },
  );
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    headingRef.current?.focus();
  }, [view]);

  // After planning here the URL becomes /trips/<id> via history.replaceState, so the router keeps
  // this page mounted. The logo links to "/": arriving back there always means a fresh planner.
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    const previous = lastPathname.current;
    lastPathname.current = pathname;
    if (pathname === "/" && previous !== "/" && trip) reset();
  }, [pathname, trip, reset]);

  return (
    <TourControllerContext value={tour}>
      <main className="flex flex-1 flex-col">
        <h1 className="sr-only">Milepost: ELD trip planner</h1>
        <section
          aria-label="Trip planner"
          className={clsx(
            "relative h-[calc(100svh-3rem)] min-h-[560px] overflow-hidden print:hidden",
            // Desktop: leave the Daily logs bar peeking above the fold.
            showResults && "lg:h-[calc(100svh-3rem-4.5rem)]",
          )}
        >
          {/* The panel comes first in reading order; z-index keeps it above the map. */}
          <aside
            aria-label="Planner panel"
            data-tour="panel"
            className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-[0_-6px_24px_rgb(4_59_75/0.18)] lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-4 lg:max-h-[calc(100%-2rem)] lg:w-[340px] lg:rounded-2xl lg:shadow-[0_8px_30px_rgb(4_59_75/0.16)]"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line lg:hidden" />
            {showResults ? (
              <ResultsPanel
                trip={trip}
                selectedStopId={selectedStopId}
                onSelectStop={planner.selectStop}
                onEdit={planner.edit}
                onNewTrip={reset}
                headingRef={headingRef}
                currentStopId={replay.currentStopId}
                drivingToStopId={replay.drivingToStopId}
                followCurrent={replay.playing}
                tab={panelTab}
                onTabChange={setPanelTab}
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
                  headingRef={headingRef}
                />
              </>
            )}
          </aside>
          <RouteMap
            trip={showResults ? trip : null}
            preview={showResults ? NO_PREVIEW : preview}
            selectedStopId={selectedStopId}
            onSelectStop={planner.selectStop}
            replay={replay.truck}
          />
          {showResults && <PlaybackBar replay={replay} />}
          <PlanningOverlay pending={planner.pending} />
          {planner.notice && (
            <NoticeToast notice={planner.notice} onRetry={() => void planner.retry()} onDismiss={planner.dismissNotice} />
          )}
        </section>
        {showResults && (
          <LogSheets
            trip={trip}
            selectedStopId={selectedStopId}
            onSelectStop={planner.selectStop}
            playhead={replay.playhead}
            activeDay={logDay}
            onActiveDayChange={setLogDay}
          />
        )}
        <Suspense fallback={null}>
          <Tour raised={showResults && replay.active} />
        </Suspense>
      </main>
    </TourControllerContext>
  );
}
