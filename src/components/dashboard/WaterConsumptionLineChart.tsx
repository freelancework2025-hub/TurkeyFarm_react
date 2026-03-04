/**
 * Line chart showing daily water consumption (CONSO. EAU L) for the selected week.
 * Data aggregated by day from hebdo records — each farm has its own data via filters.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Droplets } from "lucide-react";

export interface DailyWaterDataPoint {
  date: string;
  dayLabel: string;
  consoEauL: number;
}

interface WaterConsumptionLineChartProps {
  data: DailyWaterDataPoint[];
  semaine?: string;
  className?: string;
}

const chartConfig = {
  date: {
    label: "Date",
  },
  dayLabel: {
    label: "Jour",
  },
  consoEauL: {
    label: "CONSO. EAU (L)",
    color: "hsl(199, 89%, 48%)",
  },
} satisfies ChartConfig;

export function WaterConsumptionLineChart({
  data,
  semaine = "",
  className = "",
}: WaterConsumptionLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 py-12 text-center">
        <Droplets className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Aucune donnée de consommation d'eau pour cette semaine
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Les données apparaîtront une fois le suivi hebdomadaire renseigné
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <h3 className="mb-4 flex items-center gap-2 text-base font-display font-semibold text-foreground">
        <Droplets className="h-5 w-5 text-primary" />
        Consommation d'eau — {semaine ? `Semaine ${semaine}` : "Par jour"}
      </h3>
      <ChartContainer config={chartConfig} className="h-[260px] w-full">
        <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              label={{
                value: "L",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    `${Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`,
                    "",
                  ]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as DailyWaterDataPoint | undefined;
                    return p ? `${p.dayLabel} (${p.date})` : "";
                  }}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="consoEauL"
              stroke="var(--color-consoEauL)"
              strokeWidth={2.5}
              dot={{ fill: "var(--color-consoEauL)", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </LineChart>
      </ChartContainer>
    </div>
  );
}
