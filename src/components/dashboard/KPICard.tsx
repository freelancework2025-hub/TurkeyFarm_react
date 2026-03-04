import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";

export type TrendDirection = "up" | "down" | "flat";

export interface KPICardProps {
  label: string;
  value: string | number;
  trend?: TrendDirection;
  trendValue?: string;
  unit?: string;
  icon?: LucideIcon;
  status?: "success" | "warning" | "danger" | "neutral";
  className?: string;
  /** Animate number with NumberTicker (only for numeric values) */
  animateValue?: boolean;
}

const TREND_COLORS: Record<TrendDirection, string> = {
  up: "text-green-600 dark:text-green-500",
  down: "text-red-600 dark:text-red-500",
  flat: "text-muted-foreground",
};

const STATUS_COLORS = {
  success: "border-l-4 border-l-green-500",
  warning: "border-l-4 border-l-yellow-500",
  danger: "border-l-4 border-l-red-500",
  neutral: "",
};

export function KPICard({
  label,
  value,
  trend = "flat",
  trendValue,
  unit,
  icon: Icon,
  status = "neutral",
  className,
  animateValue = false,
}: KPICardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md",
        STATUS_COLORS[status],
        className
      )}
    >
      {Icon && (
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">
          {animateValue && typeof value === "number" ? (
            <NumberTicker value={value} decimalPlaces={0} />
          ) : typeof value === "number" ? (
            value.toLocaleString("fr-FR")
          ) : (
            value
          )}
        </span>
        {unit && (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
      </div>
      {trend !== "flat" && trendValue && (
        <div className={cn("mt-1 flex items-center gap-1 text-xs", TREND_COLORS[trend])}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}
