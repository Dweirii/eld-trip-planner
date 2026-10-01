"use client";

import clsx from "clsx";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useRef } from "react";
import { type Box, easeInOut, targetBox, targetElements, visibleBox } from "./dom";
import type { TourTarget } from "./runner";
import { TOUR_UI_ATTRIBUTE } from "./useTour";

export interface TourOverlayProps {
  index: number;
  total: number;
  /** Changes each time a step is entered: the caption fades in and is announced again. */
  entry: number;
  caption: string;
  detail?: string | null;
  paused: boolean;
  /** Off: the card shrinks to a slim control pill, for a clean recording. */
  captions: boolean;
  target: TourTarget | null;
  /** Desktop: lift the card above the trip replay's bar while it is open. */
  raised?: boolean;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onToggleCaptions: () => void;
  onExit: () => void;
}

const PAUSED = "Paused (press Space to continue)";

/** Desktop: the map keeps this much more room at the bottom while the tour runs, for the caption card. */
export const CAPTION_ROOM = 140;
/** The card moves out of the way when this much of the spotlight's target is under it. */
const DODGE_SHARE = 0.25;

/** The share of `target` that `card` covers. */
function coveredShare(target: Box, card: Box): number {
  const width = Math.min(target.left + target.width, card.left + card.width) - Math.max(target.left, card.left);
  const height = Math.min(target.top + target.height, card.top + card.height) - Math.max(target.top, card.top);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / (target.width * target.height);
}

/** The guided tour on screen: the spotlight, and a caption card with its controls. Never printed. */
export function TourOverlay(props: TourOverlayProps) {
  const { index, total, entry, caption, detail, paused, captions, target, raised = false } = props;
  const cardRef = useRef<HTMLElement>(null);

  // When the spotlight's target sits under the card (a log sheet's remarks; on a phone, a map pin), the
  // card moves out of the way (desktop: to the top of the map; small screens: to the bottom) until the
  // spotlight moves on.
  const dodge = useCallback((box: Box | null) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const { transform } = getComputedStyle(card);
    const shift = transform && transform !== "none" ? new DOMMatrixReadOnly(transform).m42 : 0;
    const home = { top: rect.top - shift, left: rect.left, width: rect.width, height: rect.height };
    const covered = box !== null && coveredShare(box, home) > DODGE_SHARE;
    if (covered !== (card.dataset.dodge !== undefined)) {
      if (covered) card.dataset.dodge = "";
      else delete card.dataset.dodge;
    }
  }, []);
  const counter = (
    <p className="shrink-0 text-[11.5px] font-bold tabular-nums text-muted">
      <span aria-hidden="true">{`${index + 1} / ${total}`}</span>
      <span className="sr-only">{`Step ${index + 1} of ${total}`}</span>
    </p>
  );

  return (
    <div {...{ [TOUR_UI_ATTRIBUTE]: "" }} className="print:hidden">
      <Spotlight target={target} onTarget={dodge} />
      <section
        ref={cardRef}
        aria-label="Guided tour"
        data-tour-card=""
        data-docked={raised || undefined}
        className={clsx(
          "animate-bar-in fixed inset-x-3 top-[3.75rem] z-[70] mx-auto transition-transform duration-[650ms] ease-[cubic-bezier(0.45,0,0.2,1)] motion-reduce:transition-none",
          // Desktop: bottom left over the map, level with the panel's bottom edge; docked or dodging,
          // at the top of the map instead (16px under the header).
          "lg:inset-x-auto lg:top-auto lg:bottom-[5.5rem] lg:left-[372px] lg:mx-0",
          "data-[dodge]:translate-y-[calc(100svh-100%-4.5rem)]",
          "lg:data-[docked]:translate-y-[calc(-100svh+100%+9.5rem)] lg:data-[dodge]:translate-y-[calc(-100svh+100%+9.5rem)]",
          captions
            ? "max-w-[420px] rounded-2xl bg-white px-4 pb-3 pt-3.5 shadow-[0_14px_44px_rgb(4_59_75/0.28)] lg:w-[400px]"
            : "w-fit rounded-full bg-white p-1 shadow-[0_8px_28px_rgb(4_59_75/0.26)]",
        )}
      >
        {captions ? (
          <>
            <div className="flex items-center gap-3">
              <Mileposts index={index} total={total} />
              {counter}
            </div>
            <div aria-live="polite" aria-atomic="true" className="mt-2.5">
              <p
                key={`${entry}:${caption}`}
                className="animate-caption-in text-[15px] font-semibold leading-[1.45] text-text"
              >
                {caption}
              </p>
              {detail && (
                <p className="animate-caption-in mt-2 w-fit max-w-full truncate rounded-lg bg-[#e3f2f2] px-2.5 py-1 font-mono text-[12px] font-semibold text-brand">
                  {detail}
                </p>
              )}
            </div>
            <p aria-live="polite" className="text-[12px] font-bold text-coral-ink">
              {paused && <span className="mt-1.5 block">{PAUSED}</span>}
            </p>
            <Controls {...props} className="mt-2.5" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 pl-3">
              {counter}
              {paused && <span className="ml-1.5 text-[11.5px] font-bold text-coral-ink">{PAUSED}</span>}
              <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line" />
              <Controls {...props} />
            </div>
            {/* Screen readers still hear each step with the captions hidden. */}
            <p aria-live="polite" aria-atomic="true" className="sr-only">
              {caption}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** The tour's progress as mile markers along a road: passed, here (coral) and still to come. */
function Mileposts({ index, total }: { index: number; total: number }) {
  const progress = total > 1 ? index / (total - 1) : 1;
  return (
    <div aria-hidden="true" className="relative flex h-3.5 flex-1 items-end justify-between">
      <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#e3eeee]" />
      <span
        className="absolute bottom-0 left-0 h-[2px] rounded-full bg-teal transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      {Array.from({ length: total }, (_, post) => (
        <span
          key={post}
          className={clsx(
            "relative mb-[2px] w-[2px] rounded-t-full transition-[height,background-color] duration-300 motion-reduce:transition-none",
            post < index ? "h-1.5 bg-teal" : post === index ? "h-3 bg-coral-ink" : "h-1.5 bg-[#c9dada]",
          )}
        />
      ))}
    </div>
  );
}

function Controls({
  paused,
  captions,
  onPrevious,
  onToggle,
  onNext,
  onToggleCaptions,
  onExit,
  className,
}: TourOverlayProps & { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-0.5", className)}>
      <IconButton label="Previous step" shortcut="←" onClick={onPrevious}>
        <ArrowIcon direction="left" />
      </IconButton>
      <IconButton label={paused ? "Resume tour" : "Pause tour"} shortcut="Space" onClick={onToggle} primary>
        {paused ? <PlayIcon /> : <PauseIcon />}
      </IconButton>
      <IconButton label="Next step" shortcut="→" onClick={onNext}>
        <ArrowIcon direction="right" />
      </IconButton>
      <span className={clsx(captions ? "flex-1" : "w-1")} />
      <button
        type="button"
        aria-label="Captions"
        aria-pressed={captions}
        title="Captions (C)"
        onClick={onToggleCaptions}
        className={clsx(
          "grid h-8 min-w-9 place-items-center rounded-full font-mono text-[10.5px] font-semibold transition",
          captions ? "text-brand hover:bg-surface" : "text-muted hover:bg-surface hover:text-brand",
        )}
      >
        <span
          className={clsx(
            "rounded-[5px] border-[1.5px] px-1 leading-[15px]",
            captions ? "border-brand bg-brand text-white" : "border-current",
          )}
        >
          CC
        </span>
      </button>
      <IconButton label="Exit tour" shortcut="Esc" onClick={onExit}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  shortcut,
  onClick,
  primary = false,
  children,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      className={clsx(
        "grid place-items-center rounded-full transition active:scale-95",
        primary ? "size-9 bg-brand text-white hover:bg-[#0a4f63]" : "size-8 text-brand hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

/** Spotlight moves take this long (eased); under reduced motion it jumps. */
const MOVE_MS = 650;
/** A target that vanishes for less than this (a re-render) keeps its ring. */
const MISSING_GRACE_MS = 250;
const PADDING = 6;
/** A map pin gets more room, so its ring reads as a ring. */
const PIN_PADDING = 10;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/** The ring around a target: padded, with corners that follow its own (a pill or pin stays round). */
function ringFor(box: Box, target: TourTarget): Box & { radius: number } {
  const pin = Math.max(box.width, box.height) < 40;
  const pad = pin ? PIN_PADDING : PADDING;
  const ring = { top: box.top - pad, left: box.left - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
  const elements = targetElements(target).filter((element) => visibleBox(element) !== null);
  // Several elements in one ring (a tab bar and its panel, a pin and its popup) get plain rounded corners.
  const own =
    elements.length === 1 ? Number.parseFloat(getComputedStyle(elements[0]).borderTopLeftRadius) || 0 : 0;
  const round = elements.length === 1 && own >= Math.min(box.width, box.height) / 2;
  const radius = round ? Math.min(ring.width, ring.height) / 2 : Math.min(Math.max(own + pad, 14), 20);
  return { ...ring, radius };
}

/**
 * A soft teal ring round the target and a dim over everything else (one element: its box-shadow is the
 * dim). It glides between targets and follows them every frame as the page scrolls, the window resizes
 * or the map moves. It never takes a pointer event.
 */
function Spotlight({ target, onTarget }: { target: TourTarget | null; onTarget?: (box: Box | null) => void }) {
  const ringRef = useRef<HTMLDivElement>(null);
  const report = useEffectEvent((box: Box | null) => onTarget?.(box));
  const drawn = useRef<(Box & { radius: number }) | null>(null);
  const key = target === null ? "" : JSON.stringify(target);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const selectors: TourTarget | null = key ? JSON.parse(key) : null;
    const reduce = window.matchMedia?.(REDUCED_MOTION)?.matches ?? false;
    // A ring already on screen glides to the new target; a hidden one appears there.
    const from = ring.style.opacity === "1" ? drawn.current : null;
    let startedAt: number | null = null;
    let missingSince: number | null = null;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const box = selectors ? targetBox(selectors) : null;
      report(box);
      if (!box) {
        missingSince ??= now;
        if (!selectors || now - missingSince > MISSING_GRACE_MS) ring.style.opacity = "0";
        return;
      }
      missingSince = null;
      const to = ringFor(box, selectors as TourTarget);
      startedAt ??= now;
      const progress = !from || reduce ? 1 : easeInOut(Math.min((now - startedAt) / MOVE_MS, 1));
      const next =
        progress >= 1 || !from
          ? to
          : {
              top: lerp(from.top, to.top, progress),
              left: lerp(from.left, to.left, progress),
              width: lerp(from.width, to.width, progress),
              height: lerp(from.height, to.height, progress),
              radius: lerp(from.radius, to.radius, progress),
            };
      drawn.current = next;
      ring.style.transform = `translate(${next.left}px, ${next.top}px)`;
      ring.style.width = `${next.width}px`;
      ring.style.height = `${next.height}px`;
      ring.style.borderRadius = `${next.radius}px`;
      ring.style.opacity = "1";
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      className="tour-spotlight pointer-events-none fixed left-0 top-0 z-[60] opacity-0 transition-opacity duration-300 motion-reduce:transition-none"
    />
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" className="translate-x-px">
      <path
        d="M4.5 2.9v10.2a.8.8 0 0 0 1.22.68l8.1-5.1a.8.8 0 0 0 0-1.36l-8.1-5.1A.8.8 0 0 0 4.5 2.9z"
        fill="currentColor"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="3.5" y="2.5" width="3.2" height="11" rx="1.1" fill="currentColor" />
      <rect x="9.3" y="2.5" width="3.2" height="11" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
      className={clsx(direction === "left" && "-scale-x-100")}
    >
      <path
        d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
