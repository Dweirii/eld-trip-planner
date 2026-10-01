/** DOM helpers for the guided tour: finding its targets, measuring them, scrolling and pressing. */
import type { StepContext, TourTarget } from "./runner";

/** A selector for an element marked `data-tour="name"`. */
export const tourTarget = (name: string) => `[data-tour="${name}"]`;

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

function clips(element: Element): boolean {
  const { overflowX, overflowY } = getComputedStyle(element);
  return overflowX !== "visible" || overflowY !== "visible";
}

/** The part of `element` its scrolling ancestors don't hide, in viewport pixels (null: nothing shows). */
export function visibleBox(element: Element): Box | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  let top = rect.top;
  let left = rect.left;
  let right = rect.right;
  let bottom = rect.bottom;
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (!clips(node)) continue;
    const clip = node.getBoundingClientRect();
    top = Math.max(top, clip.top);
    left = Math.max(left, clip.left);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }
  if (right - left < 1 || bottom - top < 1) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Every element a target names, in document order. */
export function targetElements(target: TourTarget): Element[] {
  const selectors = typeof target === "string" ? [target] : target;
  return selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
}

/** One box around every visible part of the target (null: none of it shows). */
export function targetBox(target: TourTarget): Box | null {
  let union: { top: number; left: number; right: number; bottom: number } | null = null;
  for (const element of targetElements(target)) {
    const box = visibleBox(element);
    if (!box) continue;
    const right = box.left + box.width;
    const bottom = box.top + box.height;
    union = union
      ? {
          top: Math.min(union.top, box.top),
          left: Math.min(union.left, box.left),
          right: Math.max(union.right, right),
          bottom: Math.max(union.bottom, bottom),
        }
      : { top: box.top, left: box.left, right, bottom };
  }
  return union && { top: union.top, left: union.left, width: union.right - union.left, height: union.bottom - union.top };
}

/** The first visible element a target names. */
export function visibleElement(target: TourTarget): Element | null {
  return targetElements(target).find((candidate) => visibleBox(candidate) !== null) ?? null;
}

/** Scroll `scroller` (or the page) to `top`, eased over `ms`; pausable, and instant under reduced motion. */
export async function scrollTo(ctx: StepContext<unknown>, top: number, ms: number, scroller?: HTMLElement | null) {
  const element = scroller ?? document.scrollingElement ?? document.documentElement;
  const from = element.scrollTop;
  const to = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight));
  if (Math.abs(to - from) < 1) return;
  await ctx.animate(ms, (progress) => {
    element.scrollTop = from + (to - from) * easeInOut(progress);
  });
}

/** The page offset that puts `element` `margin` pixels below the top of the viewport. */
export function pageTopOf(element: Element, margin = 0): number {
  const scroller = document.scrollingElement ?? document.documentElement;
  return element.getBoundingClientRect().top + scroller.scrollTop - margin;
}

/** The planner panel (on small screens, the bottom sheet): it scrolls on its own. */
export function plannerPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(tourTarget("panel"));
}

/** Scroll the planner panel just enough to show `element` (its top, if it is taller than the panel). */
export async function revealInPanel(ctx: StepContext<unknown>, element: Element | null, ms: number, margin = 12) {
  const panel = plannerPanel();
  if (!panel || !element || !panel.contains(element)) return;
  const box = panel.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  let delta = 0;
  if (rect.top < box.top + margin || rect.height > box.height - 2 * margin) delta = rect.top - box.top - margin;
  else if (rect.bottom > box.bottom - margin) delta = rect.bottom - box.bottom + margin;
  if (delta !== 0) await scrollTo(ctx, panel.scrollTop + delta, ms, panel);
}

/** A visible press on a button: it dips and comes back, like a click (skipped under reduced motion). */
export function press(element: Element | null, reducedMotion: boolean): void {
  if (!element || reducedMotion || typeof element.animate !== "function") return;
  element.animate(
    [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(0.94)", filter: "brightness(0.9)", offset: 0.4 },
      { transform: "scale(1)", filter: "brightness(1)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
  );
}
