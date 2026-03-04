/**
 * Line chart showing daily mortality (MORTALITÉ NBRE) for the selected week.
 * Data aggregated by day from hebdo records — each farm has its own data via filters.
 * Mirrors the suivi hebdomadaire table structure (SuiviTechniqueHebdomadaire).
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
import { HeartPulse } from "lucide-react";

export interface DailyMortalityDataPoint {
  date: string;
  dayLabel: string;
  mortaliteNbre: number;
}

interface MortalityLineChartProps {
  data: DailyMortalityDataPoint[];
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
  mortaliteNbre: {
    label: "MORTALITÉ NBRE",
    color: "hsl(0, 72%, 51%)",
  },
} satisfies ChartConfig;

export function MortalityLineChart({
  data,
  semaine = "",
  className = "",
}: MortalityLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 py-12 text-center">
        <HeartPulse className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Aucune donnée de mortalité pour cette semaine
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
        <HeartPulse className="h-5 w-5 text-destructive" />
        Mortalité par jour — {semaine ? `Semaine ${semaine}` : "Par jour"}
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
            allowDecimals={false}
            label={{
              value: "Nbre",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
            }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => [
                  `${Number(value).toLocaleString("fr-FR")} dindons`,
                  "",
                ]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as DailyMortalityDataPoint | undefined;
                  return p ? `${p.dayLabel} (${p.date})` : "";
                }}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="mortaliteNbre"
            stroke="var(--color-mortaliteNbre)"
            strokeWidth={2.5}
            dot={{ fill: "var(--color-mortaliteNbre)", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
