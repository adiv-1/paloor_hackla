"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useAuth } from "@/lib/auth";
import type { SimBlock } from "@/lib/modules/types";
import { ListenButton } from "./ListenButton";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Synthetic GBM with regime shifts. Two preset portfolios for comparison.
function simulate(seed: number, days: number, mu: number, sigma: number, start = 10000) {
  let v = start;
  const out: number[] = [v];
  let rng = seed;
  let regime: "normal" | "bear" | "bull" = "normal";
  for (let i = 1; i <= days; i++) {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    const u1 = (rng / 4294967296) || 1e-9;
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    const u2 = rng / 4294967296;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    if (i % 90 === 0) {
      const r = (rng % 100) / 100;
      regime = r < 0.15 ? "bear" : r < 0.3 ? "bull" : "normal";
    }
    const muAdj = regime === "bear" ? mu - 0.3 : regime === "bull" ? mu + 0.2 : mu;
    const sigmaAdj = regime === "bear" ? sigma * 1.4 : sigma;
    const dt = 1 / 252;
    v = v * Math.exp((muAdj - 0.5 * sigmaAdj * sigmaAdj) * dt + sigmaAdj * Math.sqrt(dt) * z);
    out.push(v);
  }
  return out;
}

function metrics(series: number[]) {
  const start = series[0];
  const end = series[series.length - 1];
  const totalReturn = (end / start - 1) * 100;
  const rets = [];
  for (let i = 1; i < series.length; i++) rets.push(series[i] / series[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const vol = Math.sqrt(variance * 252) * 100;
  let peak = series[0];
  let maxDD = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return { totalReturn, vol, maxDD: maxDD * 100, end };
}

interface Props {
  block: SimBlock;
  moduleId: string;
  moduleTitle: string;
  concept: string;
  onComplete: () => void;
}

export function SimTaskBlock({ block, moduleId, moduleTitle, concept, onComplete }: Props) {
  const { token } = useAuth();
  const isCompounding = block.mode === "compounding";

  // Allocation mode: stock %.  Compounding mode: years invested.
  const [stockPctA, setStockPctA] = useState(95);   // concentrated default
  const [stockPctB, setStockPctB] = useState(60);   // diversified default
  const [yearsA, setYearsA] = useState<number>(block.portfolios[0].years ?? 40);
  const [yearsB, setYearsB] = useState<number>(block.portfolios[1].years ?? 30);

  const [hasRun, setHasRun] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const days = block.durationYears * 252;
  const start = block.startingValue || (isCompounding ? 0 : 10000);

  const sim = useMemo(() => {
    if (!hasRun) return null;

    if (isCompounding) {
      // Deterministic monthly compounding. Show both side-by-side on a shared
      // monthly axis equal to the longer of the two horizons.
      const monthly = block.monthlyContribution ?? 500;
      const annual = block.expectedAnnualReturn ?? 0.07;
      const r = annual / 12;
      const months = Math.max(yearsA, yearsB) * 12;
      const seriesA: number[] = [start];
      const seriesB: number[] = [start];
      let vA = start;
      let vB = start;
      for (let m = 1; m <= months; m++) {
        if (m <= yearsA * 12) vA = (vA + monthly) * (1 + r);
        if (m <= yearsB * 12) vB = (vB + monthly) * (1 + r);
        seriesA.push(vA);
        seriesB.push(vB);
      }
      const data = seriesA.map((v, i) => ({
        day: i, // months in this mode; tick formatter handles label
        [block.portfolios[0].label]: Math.round(v),
        [block.portfolios[1].label]: Math.round(seriesB[i]),
      }));
      const contribsA = monthly * yearsA * 12;
      const contribsB = monthly * yearsB * 12;
      const a = {
        totalReturn: contribsA > 0 ? (vA / contribsA - 1) * 100 : 0,
        vol: 0,
        maxDD: 0,
        end: vA,
        contributed: contribsA,
        gain: vA - contribsA,
      };
      const b = {
        totalReturn: contribsB > 0 ? (vB / contribsB - 1) * 100 : 0,
        vol: 0,
        maxDD: 0,
        end: vB,
        contributed: contribsB,
        gain: vB - contribsB,
      };
      return { data, a, b, isCompounding: true as const, months };
    }

    // Allocation mode (existing)
    const muA = 0.04 + (stockPctA / 100) * 0.06;
    const sigmaA = 0.05 + (stockPctA / 100) * 0.30;
    const muB = 0.04 + (stockPctB / 100) * 0.06;
    const sigmaB = 0.05 + (stockPctB / 100) * 0.18;
    const a = simulate(42, days, muA, sigmaA, start);
    const b = simulate(99, days, muB, sigmaB, start);
    const data = a.map((v, i) => ({
      day: i,
      [block.portfolios[0].label]: Math.round(v),
      [block.portfolios[1].label]: Math.round(b[i]),
    }));
    return { data, a: metrics(a), b: metrics(b), isCompounding: false as const };
  }, [hasRun, stockPctA, stockPctB, yearsA, yearsB, days, start, block, isCompounding]);

  async function runFeedback() {
    if (!sim) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/learn/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          module_id: moduleId,
          module_title: moduleTitle,
          concept,
          user_choices: isCompounding
            ? {
                [block.portfolios[0].label]: { years: yearsA },
                [block.portfolios[1].label]: { years: yearsB },
              }
            : {
                [block.portfolios[0].label]: { stockPct: stockPctA },
                [block.portfolios[1].label]: { stockPct: stockPctB },
              },
          sim_outputs: {
            [block.portfolios[0].label]: sim.a,
            [block.portfolios[1].label]: sim.b,
          },
        }),
      });
      const json = await res.json();
      setFeedback(json.feedback || "");
    } catch {
      setFeedback("Couldn't reach the AI tutor right now. Move on when you're ready.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{block.prompt}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {isCompounding ? (
          <>
            <YearsSlider
              label={block.portfolios[0].label}
              value={yearsA}
              onChange={setYearsA}
              accent="emerald"
            />
            <YearsSlider
              label={block.portfolios[1].label}
              value={yearsB}
              onChange={setYearsB}
              accent="sky"
            />
          </>
        ) : (
          <>
            <PortfolioSlider label={block.portfolios[0].label} value={stockPctA} onChange={setStockPctA} accent="emerald" />
            <PortfolioSlider label={block.portfolios[1].label} value={stockPctB} onChange={setStockPctB} accent="sky" />
          </>
        )}
      </div>

      {!hasRun ? (
        <button
          onClick={() => setHasRun(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Run simulation
        </button>
      ) : (
        <button
          onClick={() => setHasRun(false)}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-accent"
        >
          Reset and try different allocations
        </button>
      )}

      {sim && (
        <>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <LineChart data={sim.data}>
                <XAxis
                  dataKey="day"
                  stroke="#888"
                  fontSize={11}
                  tickFormatter={(v) =>
                    isCompounding ? `${(v / 12).toFixed(0)}y` : `${(v / 252).toFixed(1)}y`
                  }
                />
                <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey={block.portfolios[0].label} stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={block.portfolios[1].label} stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {isCompounding ? (
              <>
                <CompoundResultCard label={block.portfolios[0].label} m={sim.a as any} accent="emerald" />
                <CompoundResultCard label={block.portfolios[1].label} m={sim.b as any} accent="sky" />
              </>
            ) : (
              <>
                <ResultCard label={block.portfolios[0].label} m={sim.a} accent="emerald" />
                <ResultCard label={block.portfolios[1].label} m={sim.b} accent="sky" />
              </>
            )}
          </div>

          {!feedback && (
            <button
              onClick={runFeedback}
              disabled={loading}
              className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Get AI feedback"}
            </button>
          )}

          {feedback && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground whitespace-pre-line">
              <div className="mb-2 flex justify-end">
                <ListenButton text={feedback} autoPlay />
              </div>
              {feedback}
            </div>
          )}

          {feedback && (
            <button
              onClick={onComplete}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PortfolioSlider({ label, value, onChange, accent }: { label: string; value: number; onChange: (v: number) => void; accent: "emerald" | "sky" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-medium ${accent === "emerald" ? "text-emerald-500" : "text-sky-500"}`}>
        {value}% stocks · {100 - value}% bonds
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-muted ${accent === "emerald" ? "accent-emerald-500" : "accent-sky-500"}`}
      />
    </div>
  );
}

function ResultCard({ label, m, accent }: { label: string; m: { totalReturn: number; vol: number; maxDD: number; end: number }; accent: "emerald" | "sky" }) {
  const color = accent === "emerald" ? "text-emerald-500" : "text-sky-500";
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>${m.end.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">
        Return: <span className="text-foreground">{m.totalReturn.toFixed(1)}%</span> · Vol:{" "}
        <span className="text-foreground">{m.vol.toFixed(1)}%</span> · Max DD:{" "}
        <span className="text-foreground">{m.maxDD.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function YearsSlider({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accent: "emerald" | "sky";
}) {
  const color = accent === "emerald" ? "text-emerald-500" : "text-sky-500";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-medium ${color}`}>
        {value} years invested
      </div>
      <input
        type="range"
        min={5}
        max={50}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-muted ${
          accent === "emerald" ? "accent-emerald-500" : "accent-sky-500"
        }`}
      />
    </div>
  );
}

function CompoundResultCard({
  label,
  m,
  accent,
}: {
  label: string;
  m: { end: number; contributed: number; gain: number; totalReturn: number };
  accent: "emerald" | "sky";
}) {
  const color = accent === "emerald" ? "text-emerald-500" : "text-sky-500";
  const compoundShare = m.end > 0 ? (m.gain / m.end) * 100 : 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>
        ${Math.round(m.end).toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">
        You put in:{" "}
        <span className="text-foreground">${Math.round(m.contributed).toLocaleString()}</span> · Compounding added:{" "}
        <span className="text-foreground">${Math.round(m.gain).toLocaleString()}</span>{" "}
        ({compoundShare.toFixed(0)}% of total)
      </div>
    </div>
  );
}
