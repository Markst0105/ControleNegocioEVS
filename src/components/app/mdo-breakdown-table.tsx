import Link from "next/link";

import {
  MDO_METRICS,
  formatMdoMetric,
  type MdoMetrics,
} from "@/lib/mdo-metrics";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type MdoBreakdownRow = {
  key: string;
  label: string;
  sublabel?: string;
  href?: string;
  metrics: MdoMetrics;
  kpiDays: number;
  days: number;
};

export function MdoBreakdownTable({
  rows,
  totals,
  labelHeading,
}: {
  rows: MdoBreakdownRow[];
  totals: MdoBreakdownRow;
  labelHeading: string;
}) {
  return (
    <div className="border-t border-ink/70">
      <div className="overflow-x-auto">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="border-b-ink/70 hover:bg-transparent">
              <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                {labelHeading}
              </TableHead>
              {MDO_METRICS.map((metric) => (
                <TableHead
                  key={metric.key}
                  title={metric.description}
                  className="h-9 px-2 text-right text-[10.5px] font-medium whitespace-nowrap text-ink-soft"
                >
                  {metric.shortLabel}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const manualMissing = row.kpiDays === 0;
              const dayLabel = (
                <span className="flex min-w-0 flex-col">
                  <span className="num text-[13px] font-medium">{row.label}</span>
                  {row.sublabel ? (
                    <span className="mt-0.5 text-[10px] font-normal text-ink-soft">
                      {row.sublabel}
                    </span>
                  ) : null}
                </span>
              );

              return (
                <TableRow
                  key={row.key}
                  className={cn(
                    "border-line/80 hover:bg-moss-soft/25",
                    manualMissing && "text-ink-soft/85",
                  )}
                >
                  <TableCell className="border-l-[3px] border-l-transparent py-2 pl-3">
                    {row.href ? (
                      <Link
                        href={row.href}
                        className="inline-flex underline-offset-2 hover:underline"
                      >
                        {dayLabel}
                      </Link>
                    ) : (
                      dayLabel
                    )}
                  </TableCell>
                  {MDO_METRICS.map((metric) => {
                    const missing = manualMissing && metric.source === "manual";
                    return (
                      <TableCell
                        key={metric.key}
                        className="num px-2 py-2 text-right text-[12px] whitespace-nowrap"
                      >
                        {formatMdoMetric(
                          missing ? null : row.metrics[metric.key],
                          metric.kind,
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}

            <TableRow className="border-t-ink/70 bg-surface/70 hover:bg-surface/70">
              <TableCell className="border-l-[3px] border-l-moss py-2.5 pl-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12px] font-medium">{totals.label}</span>
                  {totals.sublabel ? (
                    <span className="mt-0.5 text-[10px] font-normal text-ink-soft">
                      {totals.sublabel}
                    </span>
                  ) : null}
                </span>
              </TableCell>
              {MDO_METRICS.map((metric) => {
                const missing =
                  totals.kpiDays === 0 && metric.source === "manual";
                return (
                  <TableCell
                    key={metric.key}
                    className="num px-2 py-2.5 text-right text-[12px] font-medium whitespace-nowrap"
                  >
                    {formatMdoMetric(
                      missing ? null : totals.metrics[metric.key],
                      metric.kind,
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
