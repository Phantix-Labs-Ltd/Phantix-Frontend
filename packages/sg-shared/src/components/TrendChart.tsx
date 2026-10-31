import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactNumber, niceTicks, shortDate, sparseTicks, useDashTheme } from "./DashboardWidgets";

export interface TrendPoint {
  label: string;
  value: number;
  secondary?: number | null;
}

interface Props {
  /** Time series ordered oldest → newest (natural x-axis direction). */
  points: TrendPoint[];
  /** Defaults to the dashboard blue. */
  color?: string;
  secondaryColor?: string;
  height?: number;
}

/** Time series in the dashboard look: a smooth filled area, three y-ticks,
 *  sparse date labels. An optional secondary series draws as a dashed line. */
export default function TrendChart({ points, color, secondaryColor = "#F43F5E", height = 180 }: Props) {
  const { d, tip } = useDashTheme();
  const stroke = color ?? d.line;
  const data = points.map((p) => ({
    label: p.label,
    value: p.value,
    ...(p.secondary != null ? { secondary: p.secondary } : {}),
  }));
  const hasSecondary = data.some((p) => p.secondary != null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-600" style={{ height }}>
        No trend data yet
      </div>
    );
  }

  const max = data.reduce((m, p) => Math.max(m, Number(p.value) || 0, Number(p.secondary) || 0), 0);
  const ticks = niceTicks(max);
  const tick = { fill: d.axis, fontSize: 12 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 18, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={d.grid} vertical={false} />
        <XAxis
          dataKey="label"
          ticks={sparseTicks(data.map((p) => p.label))}
          interval={0}
          tickFormatter={shortDate}
          tick={tick}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          domain={[0, ticks[ticks.length - 1]]}
          ticks={ticks}
          tickFormatter={compactNumber}
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip {...tip} cursor={{ stroke: d.axis, strokeDasharray: "3 3" }} labelFormatter={(l: string) => shortDate(l)} />
        <Area
          type="monotone"
          dataKey="value"
          name="value"
          stroke={stroke}
          strokeWidth={2}
          fill={stroke}
          fillOpacity={d.fillOpacity}
          dot={false}
          activeDot={{ r: 4, fill: stroke, stroke: d.card, strokeWidth: 2 }}
        />
        {hasSecondary && (
          <Area
            type="monotone"
            dataKey="secondary"
            name="critical+high"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            dot={false}
            activeDot={{ r: 3, fill: secondaryColor, stroke: d.card }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
