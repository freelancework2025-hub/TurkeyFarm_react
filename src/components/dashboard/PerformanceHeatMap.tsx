import { cn } from "@/lib/utils";

export type PerformanceStatus = "ok" | "watch" | "bad";

export interface HeatMapRow {
  metric: string;
  s1: string | number;
  s2: string | number;
  s3: string | number;
  s4: string | number;
  status: PerformanceStatus;
}

interface PerformanceHeatMapProps {
  rows: HeatMapRow[];
  weeks?: string[];
  className?: string;
}

const STATUS_STYLES: Record<PerformanceStatus, string> = {
  ok: "bg-green-500/20 text-green-700 dark:text-green-400",
  watch: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  bad: "bg-red-500/20 text-red-700 dark:text-red-400",
};

const STATUS_LABELS: Record<PerformanceStatus, string> = {
  ok: "🟢 OK",
  watch: "🟡 À suivre",
  bad: "🔴 Hors norme",
};

export function PerformanceHeatMap({
  rows,
  weeks = ["S1", "S2", "S3", "S4"],
  className,
}: PerformanceHeatMapProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    >
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <h3 className="font-semibold text-foreground">
          Performance vs norme (matrice)
        </h3>
        <p className="text-xs text-muted-foreground">
          Vert = dans la norme | Jaune = attention | Rouge = hors norme
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-foreground">
                Métrique
              </th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className="px-4 py-2.5 text-center font-medium text-foreground"
                >
                  {w}
                </th>
              ))}
              <th className="px-4 py-2.5 text-center font-medium text-foreground">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.metric}
                className={cn(
                  "border-b border-border last:border-0",
                  i % 2 === 1 && "bg-muted/20"
                )}
              >
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {row.metric}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {row.s1}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {row.s2}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {row.s3}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {row.s4}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={cn(
                      "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                      STATUS_STYLES[row.status]
                    )}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
