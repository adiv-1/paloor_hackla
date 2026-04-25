"use client";

import { useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FrontierData {
  cloud: { volatility: number; return: number }[];
  max_sharpe: {
    weights: Record<string, number>;
    performance: { return: number; volatility: number; sharpe: number };
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API = `${API_BASE}/api/portfolio/frontier`;

const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border p-2 rounded text-xs shadow-lg">
      <p>Return: {fmt(d.y)}</p>
      <p>Risk: {fmt(d.x)}</p>
    </div>
  );
}

export function EfficientFrontierChart() {
  const [data, setData] = useState<FrontierData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="h-96 flex items-center justify-center text-sm text-muted-foreground">
        Loading frontier data...
      </div>
    );
  if (!data)
    return (
      <div className="h-96 flex items-center justify-center text-sm text-destructive">
        Failed to load data
      </div>
    );

  const cloud = data.cloud.map((p) => ({ x: p.volatility, y: p.return }));
  const optimal = [
    {
      x: data.max_sharpe.performance.volatility,
      y: data.max_sharpe.performance.return,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-lg p-6 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Efficient Frontier</h3>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500/60" />
              Simulated
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Optimal
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="x"
              stroke="#6b7280"
              tick={{ fontSize: 11 }}
              tickFormatter={fmt}
              label={{
                value: "Volatility",
                position: "insideBottom",
                offset: -18,
                fill: "#6b7280",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              stroke="#6b7280"
              tick={{ fontSize: 11 }}
              tickFormatter={fmt}
              label={{
                value: "Return",
                angle: -90,
                position: "insideLeft",
                fill: "#6b7280",
                fontSize: 12,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Scatter data={cloud} fill="#3b82f6" fillOpacity={0.4} />
            <Scatter data={optimal} fill="#10b981" shape="star" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Weights table */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <h3 className="text-sm font-medium mb-3">
          Max Sharpe Portfolio (Sharpe: {data.max_sharpe.performance.sharpe})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {Object.entries(data.max_sharpe.weights)
            .filter(([, w]) => w > 0.001)
            .sort(([, a], [, b]) => b - a)
            .map(([ticker, weight]) => (
              <div
                key={ticker}
                className="flex items-center justify-between py-1.5 px-3 rounded bg-muted/50 text-sm"
              >
                <span className="font-mono">{ticker}</span>
                <span className="text-muted-foreground font-mono">
                  {(weight * 100).toFixed(1)}%
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
