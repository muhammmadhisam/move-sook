'use client';

import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export type ChartLine = { name: string; color: string; points: number[] };

const AXIS = 'hsl(var(--muted-foreground))';
const GRID = 'hsl(var(--border))';

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
} as const;

/** Multi-series line chart. Props are series-of-points so callers stay simple. */
export function LineChart({
  labels,
  lines,
  height = 220,
}: {
  labels: string[];
  lines: ChartLine[];
  height?: number;
}) {
  const data = labels.map((label, i) => {
    const row: Record<string, number | string> = { label };
    for (const l of lines) row[l.name] = l.points[i] ?? 0;
    return row;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lines.map((l) => (
            <Line
              key={l.name}
              type="monotone"
              dataKey={l.name}
              stroke={l.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChart({
  data,
  height = 220,
  color = 'hsl(var(--primary))',
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} stroke={AXIS} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--accent))' }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
