"use client";

import { useContext, useEffect } from "react";
import { TourControllerContext } from "./controller";
import { TourOverlay } from "./TourOverlay";
import { useTour } from "./useTour";

/**
 * The guided tour, started by `?tour=1` (the top bar's "Take the tour"). It reads the URL, so the
 * workspace renders it inside a Suspense boundary.
 */
export function Tour({
  raised = false,
  onActiveChange,
}: {
  /** The trip replay's bar is open: on desktop the caption card moves to the top of the map, out of its way. */
  raised?: boolean;
  /** Told when the tour starts and ends (the map keeps room for the caption card meanwhile). */
  onActiveChange?: (active: boolean) => void;
}) {
  const tour = useTour(useContext(TourControllerContext));
  useEffect(() => {
    onActiveChange?.(tour.active);
  }, [tour.active, onActiveChange]);
  if (!tour.active) return null;
  return (
    <TourOverlay
      index={tour.index}
      total={tour.total}
      entry={tour.entry}
      caption={tour.caption}
      detail={tour.detail}
      paused={tour.paused}
      captions={tour.captions}
      target={tour.target}
      raised={raised}
      onPrevious={tour.previous}
      onToggle={tour.toggle}
      onNext={tour.next}
      onToggleCaptions={tour.toggleCaptions}
      onExit={tour.exit}
    />
  );
}
