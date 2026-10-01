import type { Trip } from "@/lib/api/types";

/** The exact rules and assumptions the plan was built on (served by the API). */
export function Assumptions({ assumptions }: { assumptions: Trip["assumptions"] }) {
  return (
    <div className="space-y-4 text-[12px]">
      <table className="w-full">
        <caption className="sr-only">Rules applied</caption>
        <tbody className="divide-y divide-dashed divide-line">
          {assumptions.rules.map((rule) => (
            <tr key={rule.label}>
              <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                {rule.label}
              </th>
              <td className="py-1.5 pr-2 tabular-nums">{rule.value}</td>
              <td className="py-1.5 text-right text-[10.5px] text-muted">{rule.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="list-disc space-y-1.5 pl-4 text-[11.5px] leading-snug text-text/85">
        {assumptions.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
