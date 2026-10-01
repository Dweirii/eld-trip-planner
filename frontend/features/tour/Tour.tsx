"use client";

import { useContext } from "react";
import { TourControllerContext } from "./controller";
import { TourOverlay } from "./TourOverlay";
import { useTour } from "./useTour";

/**
 * The guided tour, started by `?tour=1` (the top bar's "Take the tour"). It reads the URL, so the
 * workspace renders it inside a Suspense boundary.
 */
export function Tour({ raised = false }: { raised?: boolean }) {
  const tour = useTour(useContext(TourControllerContext));
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
