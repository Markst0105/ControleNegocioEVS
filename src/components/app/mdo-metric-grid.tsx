import {
  MDO_METRICS,
  formatMdoMetric,
  type MdoMetrics,
} from "@/lib/mdo-metrics";
import { cn } from "@/lib/utils";

export function MdoMetricGrid({
  metrics,
  kpiDays,
  days,
}: {
  metrics: MdoMetrics;
  kpiDays: number;
  days: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {MDO_METRICS.map((metric) => {
        const missing = metric.source === "manual" && kpiDays === 0;
        const partial =
          metric.source === "manual" && kpiDays > 0 && kpiDays < days;

        return (
          <div
            key={metric.key}
            title={metric.description}
            className="min-w-0 bg-paper px-4 py-4"
          >
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
              <span className="truncate">{metric.label}</span>
              {partial ? (
                <span
                  className="rounded-sm bg-citrus-soft px-1 py-px text-[8.5px] font-semibold tracking-wide text-citrus-ink uppercase"
                  title={`Soma de ${kpiDays} de ${days} dias com MDO registrado.`}
                >
                  parcial
                </span>
              ) : null}
            </dt>
            <dd
              className={cn(
                "num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap sm:text-[19px]",
                missing && "text-ink-soft",
              )}
            >
              {formatMdoMetric(missing ? null : metrics[metric.key], metric.kind)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
