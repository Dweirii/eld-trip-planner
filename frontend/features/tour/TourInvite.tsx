"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StopIcon } from "@/components/StopIcon";
import { TRUCK_PATHS } from "@/features/route-map/markers";
import { TOUR_HREF, type TourInviteStore, invitation, tourInvite } from "./invite";

/** The bubble drops in this long after the page loads (ms). */
export const APPEAR_AFTER = 1200;
/** Left alone this long, the bubble fades out (the pill keeps pulsing). */
export const COLLAPSE_AFTER = 12_000;
/** The fade's length (invite-out in globals.css). */
export const FADE = 300;

type Phase = "waiting" | "open" | "closing" | "closed";

/**
 * The bubble's life on this page: it waits, opens, and closes by itself unless the pointer is over it or
 * the focus is inside it (the clock stands still meanwhile). While it isn't `wanted`, nothing runs.
 */
function useBubble(wanted: boolean) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const left = useRef(COLLAPSE_AFTER);
  const held = hovered || focused;

  useEffect(() => {
    if (!wanted || phase === "closed") return;
    if (phase === "open" && held) return;
    const since = Date.now();
    const timer = window.setTimeout(
      () => setPhase(phase === "waiting" ? "open" : phase === "open" ? "closing" : "closed"),
      phase === "waiting" ? APPEAR_AFTER : phase === "open" ? left.current : FADE,
    );
    return () => {
      window.clearTimeout(timer);
      if (phase === "open") left.current = Math.max(0, left.current - (Date.now() - since));
    };
  }, [wanted, phase, held]);

  return {
    visible: wanted && (phase === "open" || phase === "closing"),
    closing: phase === "closing",
    setHovered,
    setFocused,
  };
}

/**
 * The top bar's "Take the tour" pill, and the invitation to press it. While the invitation is live (see
 * invite.ts) the pill pulses; on the empty planner a bubble drops from it once, says what the tour is, and
 * fades out again if it is left alone. The server renders the static pill; the browser decides the rest.
 */
export function TourInvite({ store = tourInvite }: { store?: TourInviteStore }) {
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { live, bubble } = invitation(snapshot, pathname);
  const { visible, closing, setHovered, setFocused } = useBubble(bubble);
  const pillRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  function dismiss() {
    // The focus was on something that is about to go: the pill takes it.
    if (cardRef.current?.contains(document.activeElement)) pillRef.current?.focus();
    store.dismiss();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    dismiss();
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }

  return (
    // Small screens: the bubble spans the header (its positioned ancestor); wider, it hangs from the pill.
    <span className={clsx("tour-invite sm:relative", live && "is-live")}>
      <span className="relative flex">
        {live && (
          <>
            <span aria-hidden="true" className="tour-invite__ring" />
            <span aria-hidden="true" className="tour-invite__ring" />
          </>
        )}
        {/* A plain link: the workspace starts the guided tour when it sees ?tour=1. */}
        {/* Small screens: just the play icon, so the links keep to one line. */}
        <Link
          ref={pillRef}
          href={TOUR_HREF}
          aria-label="Take the tour"
          title="Take the tour"
          className="relative flex items-center gap-1.5 overflow-hidden rounded-full bg-coral-ink p-1 font-bold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)] transition-colors hover:bg-[#bd2741] sm:pr-3"
        >
          {live && <span aria-hidden="true" className="tour-invite__shimmer" />}
          <PlayBadge />
          <span className="relative hidden sm:inline">Take the tour</span>
        </Link>
        {visible && (
          <span
            aria-hidden="true"
            data-closing={closing || undefined}
            className="tour-invite__arrow pointer-events-none absolute left-1/2 top-full z-20 mt-[2.5px] size-3 -translate-x-1/2 rotate-45 rounded-[3px] bg-white print:hidden"
          />
        )}
      </span>
      {visible && (
        <section
          ref={cardRef}
          aria-label="Guided tour invitation"
          data-closing={closing || undefined}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="tour-invite__card absolute inset-x-3 top-[45px] z-10 whitespace-normal rounded-2xl bg-white p-2.5 text-left font-normal text-text shadow-[0_14px_44px_rgb(4_59_75/0.3)] print:hidden sm:inset-x-auto sm:left-1/2 sm:top-full sm:mt-2 sm:w-[19.5rem] sm:-translate-x-1/2 sm:p-3"
        >
          <RouteSketch />
          <h2 className="mt-2.5 text-[14.5px] font-extrabold leading-tight tracking-[-0.01em] sm:mt-3">
            New here? Take the 2-minute tour
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">Watch Milepost plan a real trip, hands-free.</p>
          <Link
            href={TOUR_HREF}
            className="mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-coral-ink py-1 pl-1 pr-3.5 text-[12.5px] font-extrabold text-white transition-colors hover:bg-[#bd2741] sm:mt-3"
          >
            <PlayBadge />
            Start the tour
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={dismiss}
            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full text-muted transition hover:bg-white hover:text-brand sm:right-2 sm:top-2"
          >
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </section>
      )}
    </span>
  );
}

/** The play triangle in a white circle: the tour's mark, on the pill and on the bubble's button. */
function PlayBadge() {
  return (
    <span aria-hidden="true" className="relative grid size-[18px] shrink-0 place-items-center rounded-full bg-white">
      <svg viewBox="0 0 10 10" width="8" height="8" className="tour-invite__play translate-x-[0.5px]">
        <path
          d="M2.5 1.4v7.2a.5.5 0 0 0 .76.43l5.6-3.6a.5.5 0 0 0 0-.86l-5.6-3.6a.5.5 0 0 0-.76.43z"
          fill="var(--color-coral-ink)"
        />
      </svg>
    </span>
  );
}

/**
 * The tour in one picture: the replay's truck drives a dotted route, past its mileposts, to the pin, and
 * sets off again. Decorative; it stands still under reduced motion.
 */
function RouteSketch() {
  return (
    <div aria-hidden="true" className="relative h-11 overflow-hidden rounded-xl bg-[#e3f2f2]">
      <span className="tour-invite__road absolute left-5 right-12 top-[27px] h-[3px]" />
      {[25, 50, 75].map((mile) => (
        <span
          key={mile}
          className="absolute top-[32px] h-[5px] w-[2px] rounded-b-full bg-[#9cc9c9]"
          style={{ left: `calc(1.25rem + (100% - 4.25rem) * ${mile / 100})` }}
        />
      ))}
      <span className="tour-invite__travelled absolute left-5 right-[62px] top-[27px] h-[3px] rounded-full bg-teal" />
      <StopIcon kind="start" size={13} className="absolute left-5 top-[28.5px] -translate-x-1/2 -translate-y-1/2" />
      <svg
        viewBox="0 0 16 20"
        width="16"
        height="20"
        className="tour-invite__pin absolute right-12 top-[9.5px] translate-x-1/2"
      >
        <path
          d="M8 19.2c3.4-4.3 6-7.7 6-11A6 6 0 0 0 2 8.2c0 3.3 2.6 6.7 6 11z"
          fill="var(--color-coral)"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2.1" fill="#fff" />
      </svg>
      {/* As wide as the drive (it pulls up just short of the pin): moved by its own width, it carries the truck. */}
      <span className="tour-invite__truck absolute inset-y-0 left-5 right-[62px]">
        <span className="absolute left-0 top-[28.5px] grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand shadow-[0_0_0_2px_#fff,0_3px_8px_rgb(4_59_75/0.4)]">
          <svg viewBox="0 0 24 24" width="14" height="14">
            {TRUCK_PATHS.map(({ d, fill, stroke }) => (
              <path key={d} d={d} fill={fill} stroke={stroke} strokeWidth={stroke ? 1.3 : undefined} />
            ))}
          </svg>
        </span>
      </span>
    </div>
  );
}
