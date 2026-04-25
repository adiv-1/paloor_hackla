"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { InteractiveWidget, WidgetOutput } from "@/lib/modules/types";

interface Props {
  widget: InteractiveWidget;
  onChange?: (output: WidgetOutput) => void;
}

export function InteractiveWidgetView({ widget, onChange }: Props) {
  switch (widget.type) {
    case "compound":
      return <CompoundWidget defaults={widget.defaults} onChange={onChange} />;
    case "real-vs-nominal":
      return <RealVsNominalWidget defaults={widget.defaults} onChange={onChange} />;
    case "allocation-2":
      return <AllocationWidget defaults={widget.defaults} onChange={onChange} />;
    case "correlation":
      return <CorrelationWidget defaults={widget.defaults} onChange={onChange} />;
  }
}

// ----------------- Compound Growth -----------------

function CompoundWidget({ defaults, onChange }: { defaults: { monthly: number; years: number; rate: number }; onChange?: (o: WidgetOutput) => void }) {
  const [monthly, setMonthly] = useState(defaults.monthly);
  const [years, setYears] = useState(defaults.years);
  const [rate, setRate] = useState(defaults.rate);

  const data = [];
  let balance = 0;
  for (let y = 0; y <= years; y++) {
    data.push({ year: y, balance: Math.round(balance) });
    balance = (balance + monthly * 12) * (1 + rate / 100);
  }
  const final = data[data.length - 1].balance;
  const contributed = monthly * 12 * years;
  const gain = final - contributed;

  // Push output to engine
  if (onChange) onChange({ final, contributed, gain });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Slider label={`Monthly: $${monthly}`} value={monthly} min={50} max={2000} step={50} onChange={setMonthly} />
        <Slider label={`Years: ${years}`} value={years} min={1} max={40} step={1} onChange={setYears} />
        <Slider label={`Annual return: ${rate}%`} value={rate} min={1} max={12} step={0.5} onChange={setRate} />
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis dataKey="year" stroke="#888" fontSize={11} />
            <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <Stat label="You contribute" value={`$${contributed.toLocaleString()}`} />
        <Stat label="Compounding adds" value={`$${gain.toLocaleString()}`} accent />
        <Stat label="Final value" value={`$${final.toLocaleString()}`} />
      </div>
    </div>
  );
}

// ----------------- Real vs Nominal -----------------

function RealVsNominalWidget({ defaults, onChange }: { defaults: { years: number; nominal: number; inflation: number }; onChange?: (o: WidgetOutput) => void }) {
  const [years, setYears] = useState(defaults.years);
  const [nominal, setNominal] = useState(defaults.nominal);
  const [inflation, setInflation] = useState(defaults.inflation);

  const data = [];
  let nom = 1;
  let real = 1;
  for (let y = 0; y <= years; y++) {
    data.push({ year: y, nominal: Math.round(nom * 10000) / 100, real: Math.round(real * 10000) / 100 });
    nom *= 1 + nominal / 100;
    real *= 1 + (nominal - inflation) / 100;
  }
  const finalNom = data[data.length - 1].nominal;
  const finalReal = data[data.length - 1].real;
  const erosion = finalNom - finalReal;

  if (onChange) onChange({ nominal: finalNom, real: finalReal, erosion });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Slider label={`Years: ${years}`} value={years} min={5} max={40} step={1} onChange={setYears} />
        <Slider label={`Nominal: ${nominal}%`} value={nominal} min={1} max={12} step={0.5} onChange={setNominal} />
        <Slider label={`Inflation: ${inflation}%`} value={inflation} min={0} max={8} step={0.25} onChange={setInflation} />
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis dataKey="year" stroke="#888" fontSize={11} />
            <YAxis stroke="#888" fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="nominal" stroke="#10b981" strokeWidth={2} dot={false} name="Nominal" />
            <Line type="monotone" dataKey="real" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Real" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3 text-center text-sm">
        <Stat label="Nominal value of $1" value={`$${finalNom.toFixed(2)}`} />
        <Stat label="Real value of $1" value={`$${finalReal.toFixed(2)}`} accent />
      </div>
    </div>
  );
}

// ----------------- Allocation Slider -----------------

function AllocationWidget({ defaults, onChange }: { defaults: { stockPct: number }; onChange?: (o: WidgetOutput) => void }) {
  const [stockPct, setStockPct] = useState(defaults.stockPct);
  const bondPct = 100 - stockPct;
  // Naive expected metrics
  const stockReturn = 8.5;
  const bondReturn = 3.5;
  const stockVol = 18;
  const bondVol = 5;
  const expReturn = (stockPct * stockReturn + bondPct * bondReturn) / 100;
  // Assume zero correlation for visual intuition
  const expVol = Math.sqrt(((stockPct / 100) ** 2) * stockVol ** 2 + ((bondPct / 100) ** 2) * bondVol ** 2);

  if (onChange) onChange({ stockPct, expReturn, expVol });

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Slider label={`Stocks: ${stockPct}% • Bonds: ${bondPct}%`} value={stockPct} min={0} max={100} step={5} onChange={setStockPct} />
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-full border border-border">
        <div className="bg-emerald-500" style={{ width: `${stockPct}%` }} />
        <div className="bg-sky-500" style={{ width: `${bondPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-center text-sm">
        <Stat label="Expected return" value={`${expReturn.toFixed(2)}%`} accent />
        <Stat label="Expected volatility" value={`${expVol.toFixed(2)}%`} />
      </div>
    </div>
  );
}

// ----------------- Correlation -----------------

function CorrelationWidget({ defaults, onChange }: { defaults: { correlation: number }; onChange?: (o: WidgetOutput) => void }) {
  const [correlation, setCorrelation] = useState(defaults.correlation);
  // 50/50 mix of two assets each with vol 15%
  const vol = 15;
  const w = 0.5;
  const combinedVol = Math.sqrt(2 * w * w * vol * vol * (1 + correlation));

  if (onChange) onChange({ correlation, combinedVol });

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Slider label={`Correlation: ${correlation.toFixed(2)}`} value={correlation} min={-1} max={1} step={0.05} onChange={setCorrelation} />
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-center text-sm">
        <div className="text-muted-foreground">Combined portfolio volatility</div>
        <div className="mt-1 text-2xl font-semibold text-primary">{combinedVol.toFixed(2)}%</div>
        <div className="mt-2 text-xs text-muted-foreground">
          Each asset has 15% volatility on its own. Lower correlation → less combined risk.
        </div>
      </div>
    </div>
  );
}

// ----------------- Shared UI -----------------

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-emerald-500"
      />
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
