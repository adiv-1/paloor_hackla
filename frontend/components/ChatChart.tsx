"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Bar,
  ComposedChart,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Types matching backend extract_chart_data output ─── */
interface ChartSeries {
  key: string;
  color: string;
  type?: "bar";
}

interface RefLine {
  y: number;
  label: string;
  color: string;
}

export interface ChartData {
  type: "line" | "macd" | "price";
  title: string;
  series: ChartSeries[];
  data: Record<string, string | number>[];
  referenceLines?: RefLine[];
  yDomain?: [number, number];
}

/* ─── Helpers ─── */
function formatDate(d: string) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

function formatValue(v: number) {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a2e] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-white/70">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/60">{p.dataKey}:</span>
          <span className="font-mono text-white">{formatValue(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Single Chart ─── */
function SingleChart({ chart }: { chart: ChartData }) {
  const data = useMemo(() => {
    return chart.data.map((d) => ({ ...d, _label: formatDate(d.date as string) }));
  }, [chart.data]);

  const hasBar = chart.series.some((s) => s.type === "bar");
  const ChartComponent = hasBar ? ComposedChart : LineChart;

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-white/80">{chart.title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <ChartComponent data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="_label"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
            domain={chart.yDomain || ["auto", "auto"]}
            width={50}
          />
          <Tooltip content={<ChartTooltip />} />

          {chart.referenceLines?.map((rl, i) => (
            <ReferenceLine
              key={i}
              y={rl.y}
              stroke={rl.color}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={rl.label ? { value: rl.label, fill: rl.color, fontSize: 10, position: "right" } : undefined}
            />
          ))}

          {chart.series.map((s) =>
            s.type === "bar" ? (
              <Bar key={s.key} dataKey={s.key} fill={s.color} fillOpacity={0.5} radius={[2, 2, 0, 0]} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: s.color }} />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {chart.series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-white/50">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.key}
          </div>
        ))}
        {chart.referenceLines?.filter(rl => rl.label).map((rl, i) => (
          <div key={`ref-${i}`} className="flex items-center gap-1.5 text-[10px] text-white/50">
            <span className="inline-block h-0.5 w-3" style={{ backgroundColor: rl.color, opacity: 0.6 }} />
            {rl.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Carousel for Multiple Charts ─── */
export function ChartCarousel({ charts }: { charts: ChartData[] }) {
  const [active, setActive] = useState(0);

  if (!charts.length) return null;

  if (charts.length === 1) {
    return (
      <div className="my-3 rounded-xl border border-white/10 bg-[#0f0f1a]/80 p-4 backdrop-blur">
        <SingleChart chart={charts[0]} />
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-white/10 bg-[#0f0f1a]/80 p-4 backdrop-blur">
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {charts.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-primary" : "w-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActive((p) => Math.max(0, p - 1))}
            disabled={active === 0}
            className="p-1 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-white/60" />
          </button>
          <span className="text-[10px] text-white/40 font-mono min-w-[32px] text-center">
            {active + 1}/{charts.length}
          </span>
          <button
            onClick={() => setActive((p) => Math.min(charts.length - 1, p + 1))}
            disabled={active === charts.length - 1}
            className="p-1 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>
      </div>

      {/* Chart titles as tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {charts.map((c, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              i === active
                ? "bg-primary/20 text-primary"
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {/* Active chart */}
      <SingleChart chart={charts[active]} />
    </div>
  );
}

/* ─── Default Single Export (backward compat) ─── */
export default function ChatChart({ chart }: { chart: ChartData }) {
  return <ChartCarousel charts={[chart]} />;
}
