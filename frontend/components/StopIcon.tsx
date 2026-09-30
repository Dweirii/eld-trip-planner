import type { StopKind } from "@/lib/api/types";
import { ICON_VIEWBOX, STOP_STYLE, stopIconLayers } from "@/lib/stops";

/** A stop kind's colour and shape, the same as its map marker (decorative: always next to a text label). */
export function StopIcon({ kind, size = 14, className }: { kind: StopKind; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      data-shape={STOP_STYLE[kind].shape}
      className={className}
    >
      {stopIconLayers(kind).map((layer, index) => (
        <path
          key={index}
          d={layer.d}
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
