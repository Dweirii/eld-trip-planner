/** Shown while the API plans the trip (usually 1–3 s). */
export function PlanningOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center lg:left-[360px]"
    >
      <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-xs font-bold text-brand shadow-lg">
        <svg width="48" height="16" viewBox="0 0 48 16" aria-hidden="true">
          <path
            d="M2 12 C 14 2, 26 14, 46 4"
            fill="none"
            stroke="#008080"
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-draw-route"
          />
        </svg>
        Planning under FMCSA rules…
      </div>
    </div>
  );
}
