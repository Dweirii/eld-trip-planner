import clsx from "clsx";
import { type ReactNode, memo } from "react";
import type { DailyLog, DutyStatus } from "@/lib/api/types";
import { logHours, miles, minuteLabel } from "@/lib/format";
import { STATUS_NAMES } from "@/lib/stops";
import {
  GRID,
  GRID_BOTTOM,
  HOUR_LABELS,
  LABEL_Y,
  ROWS,
  VIEWBOX,
  bracketLabels,
  bracketPath,
  changePoints,
  dutyPath,
  hourLines,
  minuteToX,
  quarterTicks,
  rowCenterY,
  rowTop,
  statusAt,
} from "./geometry";

// SVG presentation attributes take literal colours (the --color-ink-blue / --color-teal / --color-coral-ink tokens).
const INK_BLUE = "#1f4fb5";
const TEAL = "#008080";
const CORAL_INK = "#d6304b";

const ROW_LABELS: Record<DutyStatus, [string, string?]> = {
  off_duty: ["1. Off Duty"],
  sleeper_berth: ["2. Sleeper", "Berth"],
  driving: ["3. Driving"],
  on_duty: ["4. On Duty", "(not driving)"],
};

/** More remarks than this print in two columns, so every day fits one landscape Letter page. */
const SINGLE_COLUMN_REMARKS = 5;

export interface LogSheetProps {
  log: DailyLog;
  /** Whole miles to write for today (defaults to log.miles_today rounded; LogSheets makes the days add up). */
  milesToday?: number;
  /** The stop id behind each bracket (same order as log.brackets), or null. */
  bracketStopIds?: readonly (string | null)[];
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
  /** Trip replay: the minute of this day to mark with a "now" line (null: none). */
  nowMinute?: number | null;
}

const NO_STOP_IDS: readonly (string | null)[] = [];

/**
 * One Driver's Daily Log, drawn like the FMCSA paper form and filled in "by hand". Memoised: during a
 * replay only the sheet under the playhead re-renders each frame, and then only its now line changes.
 */
export const LogSheet = memo(function LogSheet({
  log,
  milesToday,
  bracketStopIds = NO_STOP_IDS,
  selectedStopId = null,
  onSelectStop,
  nowMinute = null,
}: LogSheetProps) {
  const header = log.header;
  const twoColumnRemarks = log.remarks.length > SINGLE_COLUMN_REMARKS;
  const [year, month, day] = log.date.split("-");
  return (
    <article
      aria-label={`Driver's daily log for ${log.date}`}
      className="log-sheet mx-auto w-full min-w-[760px] max-w-[1000px] rounded-sm bg-paper px-7 pb-5 pt-6 font-mono text-ink shadow-[0_1px_0_#e6dcc8,0_14px_34px_rgb(4_59_75/0.13)] print:min-w-0 print:py-3"
    >
      <header className="grid grid-cols-[1.25fr_1fr_1.2fr] items-end gap-5">
        <div>
          <h3 className="font-serif text-[22px] font-bold leading-none">Drivers Daily Log</h3>
          <p className="mt-1 text-[10px]">(24 hours) · day {log.day_number}</p>
        </div>
        <Field label="(month) (day) (year)">
          <Ink>{`${month} / ${day} / ${year}`}</Ink>
        </Field>
        <p className="text-[9px] leading-snug">
          Original — File at home terminal.
          <br />
          Duplicate — Driver retains in his/her possession for 8 days.
        </p>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-5 print:mt-2">
        <Field label="From:" inline>
          <Ink>{log.from}</Ink>
        </Field>
        <Field label="To:" inline>
          <Ink>{log.to}</Ink>
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-5 gap-y-3 print:mt-2 print:gap-y-2">
        <Field label="Total miles driving today">
          <Ink>{miles(milesToday ?? log.miles_today)}</Ink>
        </Field>
        <Field label="Name of carrier">
          <Ink>{header.carrier_name}</Ink>
        </Field>
        <Field label="Main office address">
          <Ink>{header.main_office_address}</Ink>
        </Field>
        <Field label="Truck / trailer numbers">
          <Ink>{`${header.truck_number} / ${header.trailer_number}`}</Ink>
        </Field>
        <Field label="Driver signature">
          <Ink>{header.driver_name}</Ink>
        </Field>
        <Field label="Co-driver">
          <Ink>{header.co_driver_name || "—"}</Ink>
        </Field>
      </div>

      <DutyGrid
        log={log}
        bracketStopIds={bracketStopIds}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
        nowMinute={nowMinute}
      />

      {/* In print the remarks run the full width (two columns when there are many), so a day fits one page. */}
      <section className="mt-1 grid grid-cols-[1.3fr_1fr] gap-5 print:gap-y-1">
        <div className="print:contents">
          <Field label="Shipping documents · shipper & commodity">
            <Ink className="text-[18px]">{`${header.shipping_document} · ${header.shipper_commodity}`}</Ink>
          </Field>
          <ol
            aria-label="Remarks"
            className={clsx(
              "mt-2 space-y-0.5 text-[10px] leading-snug print:col-span-2 print:mt-0 print:space-y-0 print:leading-tight",
              twoColumnRemarks && "print:columns-2 print:gap-x-8",
            )}
          >
            {log.remarks.map((remark) => (
              <li key={`${remark.minute}-${remark.note}`} className="break-inside-avoid">
                <span className="tabular-nums">{remark.time}</span> ·{" "}
                <Ink className="text-[15px] print:text-[13px]">{remark.place}</Ink> — {remark.note}
              </li>
            ))}
          </ol>
        </div>
        <p className="self-end text-[9px] leading-snug print:col-start-2 print:row-start-1">
          Home terminal: {header.home_terminal_address}. Enter name of place you reported and where released from
          work and when and where each change of duty occurred. Use time standard of home terminal: {header.time_zone}.
        </p>
      </section>

      <footer
        data-role="recap"
        className="mt-3 grid grid-cols-[1.1fr_repeat(4,1fr)_1.4fr] items-end gap-3 border-t-2 border-ink pt-2 text-[9px] print:mt-2"
      >
        <div>
          <b>Recap:</b> complete at end of day
        </div>
        <RecapCell value={log.recap.on_duty_today} label="On duty today (lines 3 & 4)" />
        <RecapCell value={log.recap.a_last_7_days} label="A. On duty last 7 days incl. today" />
        <RecapCell value={log.recap.b_available_tomorrow} label="B. Available tomorrow (70 − A)" />
        <RecapCell value={log.recap.c_last_5_days} label="C. On duty last 5 days incl. today" />
        <div>70 Hour / 8 Day driver · *34 consecutive hours off resets to 70 hours available</div>
      </footer>
    </article>
  );
});

function DutyGrid({
  log,
  bracketStopIds,
  selectedStopId,
  onSelectStop,
  nowMinute,
}: Required<Pick<LogSheetProps, "log" | "bracketStopIds">> &
  Pick<LogSheetProps, "selectedStopId" | "onSelectStop" | "nowMinute">) {
  const total = ROWS.reduce((sum, status) => sum + log.totals[status], 0);
  return (
    <>
      {/* A group, not an img: an img role would hide the focusable bracket buttons inside it. */}
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="mt-4 block w-full print:mt-2"
        role="group"
        aria-label={`Duty status grid for ${log.date}`}
      >
        <title>{`Duty status grid for ${log.date}`}</title>
        <GridArt log={log} total={total} />
        {log.brackets.map((bracket, index) => {
          const stopId = bracketStopIds[index] ?? null;
          const selected = stopId !== null && stopId === selectedStopId;
          const interactive = stopId !== null && onSelectStop !== undefined;
          return (
            <BracketMark
              key={`${bracket.start_minute}-${bracket.end_minute}`}
              d={bracketPath(bracket.start_minute, bracket.end_minute)}
              selected={selected}
              place={bracket.place}
              onSelect={interactive ? () => onSelectStop(stopId) : undefined}
            />
          );
        })}
        <g aria-hidden="true" className="font-hand" fontSize={14} fontWeight={700} fill="currentColor">
          {bracketLabels(log.brackets).map((label) => (
            <text key={label.index} transform={`translate(${label.x},${LABEL_Y}) rotate(30)`}>
              {label.place}
            </text>
          ))}
        </g>
        {nowMinute !== null && nowMinute !== undefined && <NowLine log={log} minute={nowMinute} />}
      </svg>
      <p className="sr-only">
        {`Totals: ${ROWS.map((status) => `${STATUS_NAMES[status]} ${logHours(log.totals[status])} h`).join(", ")}; ${logHours(total)} h in all.`}
      </p>
      <table className="sr-only">
        <caption>{`Duty status segments for ${log.date}`}</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
          </tr>
        </thead>
        <tbody>
          {log.segments.map((segment) => (
            <tr key={segment.start_minute}>
              <td>{STATUS_NAMES[segment.status]}</td>
              <td>{minuteLabel(segment.start_minute)}</td>
              <td>{minuteLabel(segment.end_minute)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Everything on the grid that only depends on the day: labels, rules, the duty line and totals (~350 nodes). */
const GridArt = memo(function GridArt({ log, total }: { log: DailyLog; total: number }) {
  return (
    <g aria-hidden="true">
      <g fontSize={8.5} fill="currentColor">
        {HOUR_LABELS.map((label, hour) => {
          const x = minuteToX(hour * 60);
          if (hour === 0 || hour === 24) {
            return (
              <text key={hour} x={x} y={8} textAnchor="middle">
                Mid-
                <tspan x={x} dy={8}>
                  night
                </tspan>
              </text>
            );
          }
          return (
            <text key={hour} x={x} y={14} textAnchor="middle">
              {label}
            </text>
          );
        })}
        <text x={GRID.totalsX} y={8}>
          Total
          <tspan x={GRID.totalsX} dy={8}>
            hours
          </tspan>
        </text>
        {ROWS.map((status) => {
          const [first, second] = ROW_LABELS[status];
          return (
            <text key={status} x={0} y={rowCenterY(status) + (second ? -1 : 3)}>
              {first}
              {second && (
                <tspan x={0} dy={9} fontSize={7.5}>
                  {second}
                </tspan>
              )}
            </text>
          );
        })}
      </g>

      <g stroke="currentColor" fill="none">
        {ROWS.map((status) => (
          <rect
            key={status}
            x={GRID.left}
            y={rowTop(status)}
            width={GRID.width}
            height={GRID.rowHeight}
            strokeWidth={1.1}
          />
        ))}
        {hourLines().map((x) => (
          <line key={x} x1={x} x2={x} y1={GRID.top} y2={GRID_BOTTOM} strokeWidth={0.8} />
        ))}
        {quarterTicks().map((tick) => (
          <line key={`${tick.x}-${tick.y1}`} x1={tick.x} x2={tick.x} y1={tick.y1} y2={tick.y2} strokeWidth={0.7} />
        ))}
      </g>

      <path
        data-role="duty-line"
        d={dutyPath(log.segments)}
        fill="none"
        stroke={INK_BLUE}
        strokeWidth={2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {changePoints(log.segments).map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={2.3} fill={INK_BLUE} />
      ))}

      <g data-role="totals" className="font-hand" fontSize={19} fontWeight={700} fill={INK_BLUE}>
        {ROWS.map((status) => (
          <text key={status} x={GRID.totalsX} y={rowCenterY(status) + 6}>
            {logHours(log.totals[status])}
          </text>
        ))}
        <text x={GRID.totalsX - 4} y={GRID_BOTTOM + 20}>{`=${logHours(total)}`}</text>
      </g>

      <text x={0} y={GRID_BOTTOM + 18} fontSize={8.5} fill="currentColor">
        Remarks
      </text>
    </g>
  );
});

const NOW_LABEL = { width: 34, height: 13 } as const;

/**
 * Trip replay: a coral playhead across the grid with the time on a tab at the top, and a dot where the
 * pen is. Decorative (the playback bar announces the time) and never printed.
 */
function NowLine({ log, minute }: { log: DailyLog; minute: number }) {
  const x = minuteToX(minute);
  const status = statusAt(log.segments, minute);
  return (
    <g data-role="now-line" aria-hidden="true" className="print:hidden" pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={NOW_LABEL.height}
        y2={GRID_BOTTOM + 3}
        stroke={CORAL_INK}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {status && (
        <circle
          cx={x}
          cy={rowCenterY(status)}
          r={3.8}
          fill={CORAL_INK}
          stroke="#fff"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <g transform={`translate(${x} 0)`}>
        <rect x={-NOW_LABEL.width / 2} y={0} width={NOW_LABEL.width} height={NOW_LABEL.height} rx={3} fill={CORAL_INK} />
        <text y={9.4} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#fff">
          {minuteLabel(Math.floor(minute))}
        </text>
      </g>
    </g>
  );
}

function Field({ label, inline = false, children }: { label: string; inline?: boolean; children: ReactNode }) {
  if (inline) {
    return (
      <div className="flex min-h-[26px] items-end gap-2 border-b-[1.3px] border-ink pb-px">
        <span className="pb-1 text-[9px] uppercase tracking-wide text-[#4a5568]">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <div>
      <div className="flex min-h-[26px] items-end border-b-[1.3px] border-ink pb-px">{children}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-[#4a5568]">{label}</div>
    </div>
  );
}

function Ink({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("font-hand text-[22px] font-bold leading-none text-ink-blue", className)}>{children}</span>;
}

function RecapCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex min-h-[24px] items-end border-b-[1.3px] border-ink">
        <Ink className="text-[20px]">
          <span data-value>{logHours(value)}</span>
        </Ink>
      </div>
      <div className="mt-1 leading-tight">{label}</div>
    </div>
  );
}

function BracketMark({
  d,
  selected,
  place,
  onSelect,
}: {
  d: string;
  selected: boolean;
  place: string;
  onSelect?: () => void;
}) {
  const stroke = selected ? TEAL : INK_BLUE;
  const strokeWidth = selected ? 3 : 1.7;
  if (!onSelect) return <path aria-hidden="true" d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} />;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Stop at ${place}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className="group cursor-pointer outline-none"
    >
      {/* Keyboard focus: a soft teal halo plus a thicker teal stroke (more than a colour change). */}
      <path
        d={d}
        fill="none"
        stroke={TEAL}
        strokeOpacity={0.3}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-0 group-focus-visible:opacity-100"
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        className="group-hover:stroke-[#008080] group-focus-visible:stroke-[#008080] group-focus-visible:[stroke-width:3.4]"
      />
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />
    </g>
  );
}
