"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Shield,
  Target,
  Loader2,
  BarChart3,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Holding {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "bond" | "reit" | "cash";
  value: number;
  allocation: number;
  return_1y: number;
  risk: "low" | "medium" | "high";
}

interface PortfolioMetrics {
  total_value: number;
  ytd_return: number;
  annual_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  beta: number;
}

interface CategoryAllocation {
  name: string;
  value: number;
  color: string;
}

interface ScoreCategory {
  category: string;
  score: number;
  max: number;
}

interface Recommendation {
  type: "warning" | "suggestion" | "positive";
  title: string;
  description: string;
}

/* ── Mock Data Generator ─────────────────────────────────────────── */

function generatePortfolioData() {
  const holdings: Holding[] = [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      type: "stock",
      value: 45200,
      allocation: 18.1,
      return_1y: 24.3,
      risk: "medium",
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corp.",
      type: "stock",
      value: 38500,
      allocation: 15.4,
      return_1y: 19.7,
      risk: "medium",
    },
    {
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      type: "etf",
      value: 52000,
      allocation: 20.8,
      return_1y: 22.1,
      risk: "medium",
    },
    {
      symbol: "QQQ",
      name: "Invesco QQQ Trust",
      type: "etf",
      value: 28000,
      allocation: 11.2,
      return_1y: 26.8,
      risk: "medium",
    },
    {
      symbol: "BND",
      name: "Vanguard Total Bond Market",
      type: "bond",
      value: 35000,
      allocation: 14.0,
      return_1y: 4.2,
      risk: "low",
    },
    {
      symbol: "VGSH",
      name: "Vanguard Short-Term Treasury",
      type: "bond",
      value: 15000,
      allocation: 6.0,
      return_1y: 3.8,
      risk: "low",
    },
    {
      symbol: "VNQ",
      name: "Vanguard Real Estate ETF",
      type: "reit",
      value: 18000,
      allocation: 7.2,
      return_1y: 8.5,
      risk: "medium",
    },
    {
      symbol: "CASH",
      name: "Cash & Money Market",
      type: "cash",
      value: 18300,
      allocation: 7.3,
      return_1y: 4.9,
      risk: "low",
    },
  ];

  const metrics: PortfolioMetrics = {
    total_value: holdings.reduce((s, h) => s + h.value, 0),
    ytd_return: 14.7,
    annual_return: 16.2,
    volatility: 11.8,
    sharpe_ratio: 1.37,
    max_drawdown: -8.3,
    beta: 0.91,
  };

  const categoryAllocation: CategoryAllocation[] = [
    { name: "US Stocks", value: 33.5, color: "#6366f1" },
    { name: "ETFs", value: 32.0, color: "#10b981" },
    { name: "Bonds", value: 20.0, color: "#f59e0b" },
    { name: "REITs", value: 7.2, color: "#8b5cf6" },
    { name: "Cash", value: 7.3, color: "#6b7280" },
  ];

  const scores: ScoreCategory[] = [
    { category: "Diversification", score: 72, max: 100 },
    { category: "Risk Mgmt", score: 81, max: 100 },
    { category: "Growth", score: 78, max: 100 },
    { category: "Income", score: 55, max: 100 },
    { category: "Liquidity", score: 88, max: 100 },
    { category: "Cost Efficiency", score: 90, max: 100 },
  ];

  const recommendations: Recommendation[] = [
    {
      type: "warning",
      title: "High Tech Concentration",
      description:
        "33.5% of your portfolio is in individual tech stocks (AAPL + MSFT). Consider trimming to below 25% to reduce sector risk. Rebalance into international equity or value ETFs.",
    },
    {
      type: "suggestion",
      title: "Add International Exposure",
      description:
        "You have 0% international allocation. Consider adding VXUS (Vanguard Total International) at 10-15% to improve geographic diversification and reduce home-country bias.",
    },
    {
      type: "suggestion",
      title: "Increase Income Holdings",
      description:
        "Your income score is 55/100. Consider adding dividend-focused ETFs like SCHD or VIG to boost passive income while maintaining growth characteristics.",
    },
    {
      type: "positive",
      title: "Strong Risk-Adjusted Returns",
      description:
        "Your Sharpe ratio of 1.37 is well above the benchmark (1.0). Your bond allocation provides good downside protection with a max drawdown of only -8.3%.",
    },
    {
      type: "positive",
      title: "Low Cost Portfolio",
      description:
        "Your cost efficiency score is 90/100. Using low-cost Vanguard ETFs keeps expense ratios minimal, saving thousands in fees over time.",
    },
    {
      type: "suggestion",
      title: "Consider Tax-Loss Harvesting",
      description:
        "Review individual stock positions for tax-loss harvesting opportunities. This can offset up to $3,000/year in ordinary income.",
    },
  ];

  return { holdings, metrics, categoryAllocation, scores, recommendations };
}

/* ── Colors ─────────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  stock: "#6366f1",
  etf: "#10b981",
  bond: "#f59e0b",
  reit: "#8b5cf6",
  cash: "#6b7280",
};

const RISK_BADGE: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-primary/10 border-primary/30", text: "text-primary" },
  medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  high: { bg: "bg-red-50 border-red-200", text: "text-red-700" },
};

/* ══════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════ */

export default function PortfolioPage() {
  const [data, setData] = useState<ReturnType<
    typeof generatePortfolioData
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate brief load
    const t = setTimeout(() => {
      setData(generatePortfolioData());
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="mt-3 text-sm text-muted-foreground">
          Analyzing portfolio...
        </span>
      </div>
    );
  }

  const { holdings, metrics, categoryAllocation, scores, recommendations } =
    data;
  const overallScore = Math.round(
    scores.reduce((s, c) => s + c.score, 0) / scores.length,
  );

  return (
    <div className="p-8 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl tracking-tight mb-1">
          Portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          Holdings analysis, allocation breakdown, and recommendations to
          improve your portfolio.
        </p>
      </div>

      {/* ═══ Metrics Row ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Value",
            value: `$${metrics.total_value.toLocaleString()}`,
            sub: null,
          },
          {
            label: "YTD Return",
            value: `${metrics.ytd_return > 0 ? "+" : ""}${metrics.ytd_return}%`,
            sub: metrics.ytd_return >= 0 ? "text-primary" : "text-red-500",
          },
          {
            label: "Sharpe Ratio",
            value: metrics.sharpe_ratio.toFixed(2),
            sub:
              metrics.sharpe_ratio >= 1 ? "text-primary" : "text-amber-600",
          },
          {
            label: "Max Drawdown",
            value: `${metrics.max_drawdown}%`,
            sub: "text-red-500",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="border border-border/50 rounded-lg px-4 py-3 bg-muted/20"
          >
            <p className="text-[10px] font-medium text-xs tracking-tight text-muted-foreground mb-1">
              {m.label}
            </p>
            <p className={`text-2xl font-semibold tracking-tight ${m.sub || ""}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* ═══ Main Grid: Holdings + Allocation ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Holdings Table */}
        <div className="lg:col-span-2 border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold">Current Holdings</h3>
          </div>
          <div className="divide-y divide-border">
            {holdings.map((h) => {
              const rb = RISK_BADGE[h.risk];
              return (
                <div
                  key={h.symbol}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[h.type] }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {h.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {h.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {h.type}
                        </span>
                        <span
                          className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded border capitalize ${rb.bg} ${rb.text}`}
                        >
                          {h.risk}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm tabular-nums font-semibold">
                        ${h.value.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {h.allocation}%
                      </p>
                    </div>
                    <span
                      className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums px-2 py-0.5 rounded ${
                        h.return_1y >= 0
                          ? "text-primary bg-primary/10"
                          : "text-red-700 bg-red-50"
                      }`}
                    >
                      {h.return_1y >= 0 ? (
                        <TrendingUp size={10} />
                      ) : (
                        <TrendingDown size={10} />
                      )}
                      {h.return_1y >= 0 ? "+" : ""}
                      {h.return_1y}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Allocation Pie */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold">Asset Allocation</h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categoryAllocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryAllocation.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderColor: "hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  formatter={(v: any) => [`${v}%`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {categoryAllocation.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    <span>{c.name}</span>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {c.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Portfolio Score + Radar ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Radar Chart */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Target size={14} /> Portfolio Scores
            </h3>
            <span
              className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded ${
                overallScore >= 80
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : overallScore >= 60
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {overallScore}/100
            </span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={scores}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="category"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold">Score Breakdown</h3>
          </div>
          <div className="p-5 space-y-4">
            {scores.map((s) => {
              const pct = (s.score / s.max) * 100;
              return (
                <div key={s.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{s.category}</span>
                    <span
                      className={`text-xs tabular-nums font-semibold ${
                        s.score >= 80
                          ? "text-primary"
                          : s.score >= 60
                            ? "text-amber-600"
                            : "text-red-500"
                      }`}
                    >
                      {s.score}/{s.max}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          s.score >= 80
                            ? "#10b981"
                            : s.score >= 60
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {/* Extra metrics */}
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Annual Return</span>
                <span className="tabular-nums font-semibold text-primary">
                  +{metrics.annual_return}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Volatility (σ)</span>
                <span className="tabular-nums">{metrics.volatility}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Beta (vs S&P)</span>
                <span className="tabular-nums">{metrics.beta}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Recommendations ═══ */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield size={14} /> Recommendations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actionable suggestions to improve your portfolio&apos;s
            risk-adjusted returns.
          </p>
        </div>
        <div className="divide-y divide-border">
          {recommendations.map((r, i) => (
            <div
              key={i}
              className="flex gap-3 px-5 py-3.5 hover:bg-accent/20 transition-colors"
            >
              <div className="mt-0.5 shrink-0">
                {r.type === "warning" ? (
                  <AlertTriangle size={14} className="text-amber-500" />
                ) : r.type === "positive" ? (
                  <CheckCircle size={14} className="text-primary" />
                ) : (
                  <Info size={14} className="text-blue-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {r.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
        <Info size={13} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Portfolio data shown is illustrative. Connect your brokerage accounts
          to see real holdings. All metrics are historical and do not guarantee
          future performance.
        </p>
      </div>
    </div>
  );
}
