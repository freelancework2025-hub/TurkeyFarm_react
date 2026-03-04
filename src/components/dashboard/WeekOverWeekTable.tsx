import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface WoWRow {
  metric: string;
  current: string | number;
  previous: string | number;
  change: number;
  unit?: string;
}

interface WeekOverWeekTableProps {
  rows: WoWRow[];
  currentWeek?: string;
  previousWeek?: string;
  className?: string;
}

export function WeekOverWeekTable({
  rows,
  currentWeek = "S4",
  previousWeek = "S3",
  className,
}: WeekOverWeekTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    >
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <h3 className="font-semibold text-foreground">
          Comparaison semaine à semaine
        </h3>
        <p className="text-xs text-muted-foreground">
          {previousWeek} vs {currentWeek}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-foreground">
                Métrique
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-foreground">
                {previousWeek}
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-foreground">
                {currentWeek}
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-foreground">
                Variation
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isPositive = row.change > 0;
              const isNegative = row.change < 0;
              const changeColor =
                isPositive
                  ? "text-green-600 dark:text-green-500"
                  : isNegative
                    ? "text-red-600 dark:text-red-500"
                    : "text-muted-foreground";

              return (
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
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.previous}
                    {row.unit && (
                      <span className="ml-1 text-muted-foreground">
                        {row.unit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.current}
                    {row.unit && (
                      <span className="ml-1 text-muted-foreground">
                        {row.unit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 font-medium",
                        changeColor
                      )}
                    >
                      {isPositive && <TrendingUp className="h-3.5 w-3.5" />}
                      {isNegative && <TrendingDown className="h-3.5 w-3.5" />}
                      {row.change > 0 ? "+" : ""}
                      {row.change}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
