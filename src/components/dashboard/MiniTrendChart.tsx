import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { cn } from "@/lib/utils";

export interface TrendDataPoint {
  week: string;
  birds: number;
  weight: number;
  mortality: number;
  food: number;
}

interface MiniTrendChartProps {
  data: TrendDataPoint[];
  className?: string;
}

const COLORS = {
  birds: "#1e3a8a",
  weight: "#16a34a",
  mortality: "#dc2626",
  food: "#eab308",
};

export function MiniTrendChart({ data, className }: MiniTrendChartProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm",
        className
      )}
    >
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Tendances (4–6 dernières semaines)
      </h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBirds" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.birds} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.birds} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.weight} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.weight} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: number) => [
                value.toLocaleString("fr-FR"),
                "",
              ]}
              labelFormatter={(label) => `Semaine ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  birds: "Oiseaux",
                  weight: "Poids (kg)",
                  mortality: "Mortalité %",
                  food: "Aliment (kg)",
                };
                return labels[value] ?? value;
              }}
            />
            <Area
              type="monotone"
              dataKey="birds"
              yAxisId="left"
              stroke={COLORS.birds}
              fillOpacity={1}
              fill="url(#colorBirds)"
              strokeWidth={2}
              name="birds"
            />
            <Line
              type="monotone"
              dataKey="weight"
              yAxisId="left"
              stroke={COLORS.weight}
              strokeWidth={2}
              dot={false}
              name="weight"
            />
            <Line
              type="monotone"
              dataKey="mortality"
              yAxisId="left"
              stroke={COLORS.mortality}
              strokeWidth={2}
              dot={false}
              name="mortality"
            />
            <Line
              type="monotone"
              dataKey="food"
              yAxisId="left"
              stroke={COLORS.food}
              strokeWidth={2}
              dot={false}
              name="food"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
