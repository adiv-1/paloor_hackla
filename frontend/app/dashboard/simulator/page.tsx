"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import {
  Play,
  Pause,
  FastForward,
  SkipForward,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Plus,
  X,
  Info,
  Building2,
  Landmark,
  ShoppingBag,
  Zap,
  Clock,
  AlertTriangle,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Asset {
  ticker: string;
  name: string;
  type: "equity" | "bond" | "reit" | "etf";
  color: string;
  annualReturn: number;
  annualVol: number;
  dividendYield: number;
}

interface PricePoint {
  date: string;
  dayIndex: number;
  prices: Record<string, number>;
  portfolioValue: number;
}

interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
}

interface TradeRecord {
  id: number;
  day: number;
  date: string;
  type: "buy" | "sell";
  ticker: string;
  shares: number;
  price: number;
  total: number;
}

/* ── Asset Universe ────────────────────────────────────────────────── */

const ASSETS: Asset[] = [
  // Equities
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    type: "equity",
    color: "#10b981",
    annualReturn: 0.18,
    annualVol: 0.28,
    dividendYield: 0.005,
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corp.",
    type: "equity",
    color: "#3b82f6",
    annualReturn: 0.2,
    annualVol: 0.26,
    dividendYield: 0.008,
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    type: "equity",
    color: "#f59e0b",
    annualReturn: 0.15,
    annualVol: 0.3,
    dividendYield: 0.0,
  },
  {
    ticker: "AMZN",
    name: "Amazon.com",
    type: "equity",
    color: "#ef4444",
    annualReturn: 0.16,
    annualVol: 0.32,
    dividendYield: 0.0,
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase",
    type: "equity",
    color: "#6366f1",
    annualReturn: 0.12,
    annualVol: 0.24,
    dividendYield: 0.025,
  },
  {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    type: "equity",
    color: "#ec4899",
    annualReturn: 0.08,
    annualVol: 0.16,
    dividendYield: 0.03,
  },
  {
    ticker: "SPY",
    name: "S&P 500 ETF",
    type: "etf",
    color: "#14b8a6",
    annualReturn: 0.1,
    annualVol: 0.18,
    dividendYield: 0.013,
  },
  {
    ticker: "QQQ",
    name: "Nasdaq 100 ETF",
    type: "etf",
    color: "#8b5cf6",
    annualReturn: 0.14,
    annualVol: 0.22,
    dividendYield: 0.006,
  },
  // Bonds
  {
    ticker: "BND",
    name: "Total Bond Market ETF",
    type: "bond",
    color: "#6366f1",
    annualReturn: 0.035,
    annualVol: 0.06,
    dividendYield: 0.033,
  },
  {
    ticker: "TLT",
    name: "20+ Year Treasury ETF",
    type: "bond",
    color: "#0ea5e9",
    annualReturn: 0.02,
    annualVol: 0.14,
    dividendYield: 0.038,
  },
  {
    ticker: "HYG",
    name: "High Yield Corporate Bond",
    type: "bond",
    color: "#a855f7",
    annualReturn: 0.055,
    annualVol: 0.1,
    dividendYield: 0.055,
  },
  {
    ticker: "AGG",
    name: "Aggregate Bond ETF",
    type: "bond",
    color: "#64748b",
    annualReturn: 0.03,
    annualVol: 0.05,
    dividendYield: 0.03,
  },
  // REITs / Real Estate
  {
    ticker: "VNQ",
    name: "Vanguard Real Estate ETF",
    type: "reit",
    color: "#f59e0b",
    annualReturn: 0.08,
    annualVol: 0.2,
    dividendYield: 0.038,
  },
  {
    ticker: "PLD",
    name: "Prologis (Logistics REIT)",
    type: "reit",
    color: "#10b981",
    annualReturn: 0.1,
    annualVol: 0.22,
    dividendYield: 0.028,
  },
  {
    ticker: "O",
    name: "Realty Income Corp.",
    type: "reit",
    color: "#ec4899",
    annualReturn: 0.07,
    annualVol: 0.18,
    dividendYield: 0.05,
  },
  {
    ticker: "AMT",
    name: "American Tower REIT",
    type: "reit",
    color: "#0284c7",
    annualReturn: 0.09,
    annualVol: 0.2,
    dividendYield: 0.03,
  },
];

/* ── Price Generator (GBM with regime shifts) ─────────────────────── */

function generateHistoricalPrices(seed: number = 42): Record<string, number[]> {
  const DAYS = 750; // ~3 years of trading days
  const prices: Record<string, number[]> = {};

  // Seeded random
  let s = seed;
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
  const randNorm = () => {
    const u1 = rand();
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
  };

  // Market regime (shared across correlated assets)
  const regimes: number[] = [];
  let regime = 0; // 0=normal, 1=bull, -1=bear
  for (let d = 0; d < DAYS; d++) {
    if (rand() < 0.02) regime = regime === 0 ? (rand() > 0.5 ? 1 : -1) : 0;
    regimes.push(regime);
  }

  for (const asset of ASSETS) {
    const dailyReturn = asset.annualReturn / 252;
    const dailyVol = asset.annualVol / Math.sqrt(252);
    const p: number[] = [];

    // Start prices based on real rough levels
    const startPrices: Record<string, number> = {
      AAPL: 175,
      MSFT: 400,
      GOOGL: 140,
      AMZN: 180,
      JPM: 190,
      JNJ: 160,
      SPY: 480,
      QQQ: 410,
      BND: 74,
      TLT: 95,
      HYG: 78,
      AGG: 100,
      VNQ: 85,
      PLD: 120,
      O: 55,
      AMT: 200,
    };
    let price = startPrices[asset.ticker] || 100;

    for (let d = 0; d < DAYS; d++) {
      const regimeBias =
        regimes[d] * 0.001 * (asset.type === "bond" ? -0.5 : 1);
      const shock = randNorm();
      const ret = dailyReturn + regimeBias + dailyVol * shock;
      price = price * (1 + ret);
      price = Math.max(price, 1);
      p.push(Math.round(price * 100) / 100);
    }
    prices[asset.ticker] = p;
  }

  return prices;
}

function dayToDate(dayIndex: number): string {
  const base = new Date(2023, 5, 1); // June 1, 2023
  const d = new Date(base);
  d.setDate(d.getDate() + Math.floor(dayIndex * (365 / 252)));
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

/* ── Component ─────────────────────────────────────────────────────── */

const STARTING_CASH = 100000;
const SPEED_OPTIONS = [
  { label: "1x", days: 1 },
  { label: "5x", days: 5 },
  { label: "25x", days: 25 },
  { label: "Max", days: 50 },
];

export default function SimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [allPrices, setAllPrices] = useState<Record<string, number[]>>({});

  // Simulation state
  const [currentDay, setCurrentDay] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cash, setCash] = useState(STARTING_CASH);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<PricePoint[]>([]);

  // Trade dialog
  const [showTrade, setShowTrade] = useState(false);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [tradeTicker, setTradeTicker] = useState("SPY");
  const [tradeShares, setTradeShares] = useState(10);
  const [assetFilter, setAssetFilter] = useState<
    "all" | "equity" | "bond" | "reit" | "etf"
  >("all");

  // Init
  useEffect(() => {
    const timer = setTimeout(() => {
      setAllPrices(generateHistoricalPrices());
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Calculate portfolio value
  const getPortfolioValue = useCallback(
    (day: number, h: Holding[], c: number) => {
      let total = c;
      for (const hld of h) {
        const prices = allPrices[hld.ticker];
        if (prices && prices[day] !== undefined) {
          total += hld.shares * prices[day];
        }
      }
      return total;
    },
    [allPrices],
  );

  // Snapshot current day
  const snapshotDay = useCallback(
    (day: number, h: Holding[], c: number) => {
      const prices: Record<string, number> = {};
      ASSETS.forEach((a) => {
        if (allPrices[a.ticker]) prices[a.ticker] = allPrices[a.ticker][day];
      });
      return {
        date: dayToDate(day),
        dayIndex: day,
        prices,
        portfolioValue: getPortfolioValue(day, h, c),
      };
    },
    [allPrices, getPortfolioValue],
  );

  // Initialize first snapshot
  useEffect(() => {
    if (Object.keys(allPrices).length > 0 && portfolioHistory.length === 0) {
      setPortfolioHistory([snapshotDay(0, [], STARTING_CASH)]);
    }
  }, [allPrices, portfolioHistory.length, snapshotDay]);

  // Simulation tick
  useEffect(() => {
    if (!isRunning || currentDay >= 749) {
      if (currentDay >= 749) setIsRunning(false);
      return;
    }
    const interval = setInterval(() => {
      setCurrentDay((prev) => {
        const next = Math.min(prev + speed, 749);
        // Record snapshots
        setPortfolioHistory((hist) => {
          const newPoints: PricePoint[] = [];
          for (let d = prev + 1; d <= next; d++) {
            // Only record every Nth day to keep data manageable
            if (d % Math.max(1, Math.floor(speed / 2)) === 0 || d === next) {
              newPoints.push(snapshotDay(d, holdings, cash));
            }
          }
          return [...hist, ...newPoints];
        });
        if (next >= 749) setIsRunning(false);
        return next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [isRunning, currentDay, speed, holdings, cash, snapshotDay]);

  // Execute trade
  const executeTrade = () => {
    const prices = allPrices[tradeTicker];
    if (!prices) return;
    const price = prices[currentDay];
    const total = tradeShares * price;

    if (tradeType === "buy") {
      if (total > cash) return;
      setCash((c) => c - total);
      setHoldings((prev) => {
        const existing = prev.find((h) => h.ticker === tradeTicker);
        if (existing) {
          const newShares = existing.shares + tradeShares;
          const newAvg =
            (existing.avgCost * existing.shares + total) / newShares;
          return prev.map((h) =>
            h.ticker === tradeTicker
              ? {
                  ...h,
                  shares: newShares,
                  avgCost: newAvg,
                  currentPrice: price,
                }
              : h,
          );
        }
        return [
          ...prev,
          {
            ticker: tradeTicker,
            shares: tradeShares,
            avgCost: price,
            currentPrice: price,
          },
        ];
      });
    } else {
      const existing = holdings.find((h) => h.ticker === tradeTicker);
      if (!existing || existing.shares < tradeShares) return;
      setCash((c) => c + total);
      setHoldings((prev) => {
        if (existing.shares === tradeShares) {
          return prev.filter((h) => h.ticker !== tradeTicker);
        }
        return prev.map((h) =>
          h.ticker === tradeTicker
            ? { ...h, shares: h.shares - tradeShares, currentPrice: price }
            : h,
        );
      });
    }

    setTrades((prev) => [
      {
        id: prev.length + 1,
        day: currentDay,
        date: dayToDate(currentDay),
        type: tradeType,
        ticker: tradeTicker,
        shares: tradeShares,
        price,
        total,
      },
      ...prev,
    ]);
    setShowTrade(false);
  };

  // Reset sim
  const resetSim = () => {
    setCurrentDay(0);
    setIsRunning(false);
    setCash(STARTING_CASH);
    setHoldings([]);
    setTrades([]);
    setPortfolioHistory([]);
    // Re-seed prices for different market
    setAllPrices(generateHistoricalPrices(Math.floor(Math.random() * 10000)));
  };

  // Derived
  const currentPrices = useMemo(() => {
    const p: Record<string, number> = {};
    ASSETS.forEach((a) => {
      if (allPrices[a.ticker]) p[a.ticker] = allPrices[a.ticker][currentDay];
    });
    return p;
  }, [allPrices, currentDay]);

  const updatedHoldings = useMemo(
    () =>
      holdings.map((h) => ({
        ...h,
        currentPrice: currentPrices[h.ticker] || h.currentPrice,
      })),
    [holdings, currentPrices],
  );

  const totalValue = useMemo(
    () =>
      cash + updatedHoldings.reduce((s, h) => s + h.shares * h.currentPrice, 0),
    [cash, updatedHoldings],
  );

  const totalPnl = totalValue - STARTING_CASH;
  const totalPnlPct = ((totalPnl / STARTING_CASH) * 100).toFixed(2);

  const holdingsValue = updatedHoldings.reduce(
    (s, h) => s + h.shares * h.currentPrice,
    0,
  );

  const filteredAssets =
    assetFilter === "all"
      ? ASSETS
      : ASSETS.filter((a) => a.type === assetFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">Trade Simulator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practice investing with $100K virtual capital — fast-forward through
            years of market data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetSim}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            <RotateCcw size={13} />
            New Simulation
          </button>
        </div>
      </div>

      {/* Time Controls */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                isRunning
                  ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                  : "bg-primary/10 text-primary border border-primary/20"
              }`}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={() => {
                if (!isRunning) {
                  const next = Math.min(currentDay + 25, 749);
                  const newPoints: PricePoint[] = [];
                  for (let d = currentDay + 1; d <= next; d++) {
                    if (d % 5 === 0 || d === next)
                      newPoints.push(snapshotDay(d, holdings, cash));
                  }
                  setPortfolioHistory((h) => [...h, ...newPoints]);
                  setCurrentDay(next);
                }
              }}
              disabled={isRunning}
              className="w-9 h-9 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <FastForward size={16} />
            </button>
            <button
              onClick={() => {
                if (!isRunning) {
                  const newPoints: PricePoint[] = [];
                  for (let d = currentDay + 1; d <= 749; d++) {
                    if (d % 10 === 0 || d === 749)
                      newPoints.push(snapshotDay(d, holdings, cash));
                  }
                  setPortfolioHistory((h) => [...h, ...newPoints]);
                  setCurrentDay(749);
                }
              }}
              disabled={isRunning}
              className="w-9 h-9 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <SkipForward size={16} />
            </button>
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-1 border-l border-border pl-4">
            <span className="text-[10px] text-muted-foreground mr-1">
              Speed:
            </span>
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSpeed(opt.days)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  speed === opt.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div className="flex-1 flex items-center gap-3 border-l border-border pl-4">
            <Clock size={13} className="text-muted-foreground shrink-0" />
            <div className="flex-1">
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{ width: `${(currentDay / 749) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-28 text-right">
              Day {currentDay} · {dayToDate(currentDay)}
            </span>
          </div>

          {/* Trade button */}
          <button
            onClick={() => {
              setShowTrade(true);
              setTradeType("buy");
            }}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium hover:bg-primary/20 disabled:opacity-30 transition-colors"
          >
            <Plus size={13} />
            Trade
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <SimStat
          label="Portfolio Value"
          value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${totalPnlPct}%)`}
          subColor={totalPnl >= 0 ? "text-primary" : "text-red-500"}
          icon={
            <DollarSign
              size={16}
              className={totalPnl >= 0 ? "text-primary" : "text-red-500"}
            />
          }
        />
        <SimStat
          label="Cash"
          value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`${holdingsValue > 0 ? ((cash / totalValue) * 100).toFixed(0) : "100"}% of portfolio`}
          subColor="text-muted-foreground"
          icon={<BarChart3 size={16} className="text-blue-400" />}
        />
        <SimStat
          label="Holdings"
          value={`${updatedHoldings.length} assets`}
          sub={`$${holdingsValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} invested`}
          subColor="text-muted-foreground"
          icon={<TrendingUp size={16} className="text-violet-400" />}
        />
        <SimStat
          label="Total Trades"
          value={`${trades.length}`}
          sub={`${trades.filter((t) => t.type === "buy").length} buys · ${trades.filter((t) => t.type === "sell").length} sells`}
          subColor="text-muted-foreground"
          icon={<Zap size={16} className="text-amber-400" />}
        />
      </div>

      {/* Chart + Holdings */}
      <div className="grid grid-cols-3 gap-6">
        {/* Portfolio Chart */}
        <div className="col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Portfolio Performance</h3>
          {portfolioHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={portfolioHistory}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={totalPnl >= 0 ? "#10b981" : "#ef4444"}
                      stopOpacity={0.15}
                    />
                    <stop
                      offset="95%"
                      stopColor={totalPnl >= 0 ? "#10b981" : "#ef4444"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [
                    `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    "Value",
                  ]}
                />
                <ReferenceLine
                  y={STARTING_CASH}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="portfolioValue"
                  stroke={totalPnl >= 0 ? "#10b981" : "#ef4444"}
                  fill="url(#simGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
              Press Play or make a trade to start the simulation
            </div>
          )}
        </div>

        {/* Holdings */}
        <div className="rounded-xl border border-border bg-card p-5 overflow-hidden">
          <h3 className="text-sm font-semibold mb-3">Holdings</h3>
          {updatedHoldings.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center text-center">
              <ShoppingBag
                size={24}
                className="text-muted-foreground/30 mb-2"
              />
              <p className="text-xs text-muted-foreground">No holdings yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Click Trade to buy your first asset
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto">
              {updatedHoldings.map((h) => {
                const asset = ASSETS.find((a) => a.ticker === h.ticker);
                const pnl = (h.currentPrice - h.avgCost) * h.shares;
                const pnlPct = (
                  ((h.currentPrice - h.avgCost) / h.avgCost) *
                  100
                ).toFixed(1);
                return (
                  <div
                    key={h.ticker}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs"
                  >
                    <div
                      className="w-1.5 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: asset?.color || "#666" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{h.ticker}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                          {asset?.type}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {h.shares} shares @ ${h.avgCost.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">
                        $
                        {(h.shares * h.currentPrice).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <p
                        className={`text-[10px] tabular-nums ${pnl >= 0 ? "text-primary" : "text-red-500"}`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {pnlPct}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Market Prices + Trade History */}
      <div className="grid grid-cols-3 gap-6">
        {/* Market */}
        <div className="col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Market Prices</h3>
            <div className="flex items-center gap-1">
              {(["all", "equity", "bond", "reit", "etf"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAssetFilter(f)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors capitalize ${
                    assetFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "All" : f === "reit" ? "Real Estate" : f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => {
              const price = currentPrices[asset.ticker];
              const startPrice = allPrices[asset.ticker]?.[0];
              const change =
                price && startPrice
                  ? ((price - startPrice) / startPrice) * 100
                  : 0;
              return (
                <div
                  key={asset.ticker}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => {
                    setTradeTicker(asset.ticker);
                    setTradeType("buy");
                    setShowTrade(true);
                  }}
                >
                  <div
                    className="w-1 h-6 rounded-full"
                    style={{ backgroundColor: asset.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">
                        {asset.ticker}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {asset.name}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs tabular-nums">
                    ${price?.toFixed(2)}
                  </span>
                  <span
                    className={`text-[10px] tabular-nums flex items-center gap-0.5 w-16 justify-end ${change >= 0 ? "text-primary" : "text-red-500"}`}
                  >
                    {change >= 0 ? (
                      <ArrowUpRight size={10} />
                    ) : (
                      <ArrowDownRight size={10} />
                    )}
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade History */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Trade History</h3>
          {trades.length === 0 ? (
            <p className="text-xs text-muted-foreground">No trades yet</p>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {trades.slice(0, 20).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/20 text-[11px]"
                >
                  <span
                    className={`px-1 py-0.5 rounded font-bold uppercase text-[9px] ${t.type === "buy" ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-500"}`}
                  >
                    {t.type}
                  </span>
                  <span className="font-semibold">{t.ticker}</span>
                  <span className="text-muted-foreground">
                    {t.shares}×${t.price.toFixed(2)}
                  </span>
                  <span className="ml-auto text-muted-foreground/50">
                    {t.date}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Tip */}
      <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4 flex items-start gap-3">
        <Zap size={16} className="text-violet-400 mt-0.5 shrink-0" />
        <div className="text-xs text-violet-300 leading-relaxed">
          <strong>AI Tip:</strong>{" "}
          {updatedHoldings.length === 0
            ? "Start by buying a broad market ETF like SPY — it gives you instant diversification across 500 companies. Then layer in bonds (BND) and real estate (VNQ) as you learn."
            : (() => {
                const equityPct =
                  (updatedHoldings
                    .filter((h) => {
                      const a = ASSETS.find((x) => x.ticker === h.ticker);
                      return a?.type === "equity" || a?.type === "etf";
                    })
                    .reduce((s, h) => s + h.shares * h.currentPrice, 0) /
                    holdingsValue) *
                  100;
                const bondPct =
                  (updatedHoldings
                    .filter(
                      (h) =>
                        ASSETS.find((x) => x.ticker === h.ticker)?.type ===
                        "bond",
                    )
                    .reduce((s, h) => s + h.shares * h.currentPrice, 0) /
                    holdingsValue) *
                  100;
                const reitPct =
                  (updatedHoldings
                    .filter(
                      (h) =>
                        ASSETS.find((x) => x.ticker === h.ticker)?.type ===
                        "reit",
                    )
                    .reduce((s, h) => s + h.shares * h.currentPrice, 0) /
                    holdingsValue) *
                  100;
                if (bondPct === 0 && reitPct === 0)
                  return `Your portfolio is ${equityPct.toFixed(0)}% equities. Consider adding bonds (BND) for stability and REITs (VNQ) for real estate exposure — in the Bonds and Real Estate learning paths, you'll see why diversification matters.`;
                if (bondPct === 0)
                  return `You have ${equityPct.toFixed(0)}% equities and ${reitPct.toFixed(0)}% real estate — nice diversification start. Adding bonds (BND or AGG) would reduce your downside risk during bear markets.`;
                if (reitPct === 0)
                  return `${equityPct.toFixed(0)}% equities, ${bondPct.toFixed(0)}% bonds — solid foundation. Add real estate exposure through VNQ or PLD to complete the three-asset portfolio covered in the Intermediate module.`;
                return `${equityPct.toFixed(0)}% equities, ${bondPct.toFixed(0)}% bonds, ${reitPct.toFixed(0)}% real estate — you're building a diversified portfolio. Try fast-forwarding to see how allocation affects returns through different market regimes.`;
              })()}
        </div>
      </div>

      {/* Trade Dialog */}
      {showTrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowTrade(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-[420px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {tradeType === "buy" ? "Buy" : "Sell"} {tradeTicker}
              </h3>
              <button
                onClick={() => setShowTrade(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Buy/Sell Toggle */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted mb-4">
              <button
                onClick={() => setTradeType("buy")}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  tradeType === "buy"
                    ? "bg-primary text-white"
                    : "text-muted-foreground"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  tradeType === "sell"
                    ? "bg-red-500 text-white"
                    : "text-muted-foreground"
                }`}
              >
                Sell
              </button>
            </div>

            {/* Asset Selector */}
            <label className="text-xs text-muted-foreground mb-1 block">
              Asset
            </label>
            <select
              value={tradeTicker}
              onChange={(e) => setTradeTicker(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              {ASSETS.map((a) => (
                <option key={a.ticker} value={a.ticker}>
                  {a.ticker} — {a.name} ({a.type}) — $
                  {currentPrices[a.ticker]?.toFixed(2)}
                </option>
              ))}
            </select>

            {/* Shares */}
            <label className="text-xs text-muted-foreground mb-1 block">
              Shares
            </label>
            <input
              type="number"
              min={1}
              value={tradeShares}
              onChange={(e) =>
                setTradeShares(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-full mb-4 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 mb-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="tabular-nums">
                  ${currentPrices[tradeTicker]?.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums font-semibold">
                  $
                  {(
                    (currentPrices[tradeTicker] || 0) * tradeShares
                  ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available Cash</span>
                <span className="tabular-nums">
                  $
                  {cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              {tradeType === "sell" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shares Held</span>
                  <span className="tabular-nums">
                    {holdings.find((h) => h.ticker === tradeTicker)?.shares ||
                      0}
                  </span>
                </div>
              )}
            </div>

            {/* Warnings */}
            {tradeType === "buy" &&
              (currentPrices[tradeTicker] || 0) * tradeShares > cash && (
                <div className="flex items-center gap-2 text-xs text-red-500 mb-3">
                  <AlertTriangle size={14} />
                  <span>Insufficient cash for this trade</span>
                </div>
              )}
            {tradeType === "sell" &&
              tradeShares >
                (holdings.find((h) => h.ticker === tradeTicker)?.shares ||
                  0) && (
                <div className="flex items-center gap-2 text-xs text-red-500 mb-3">
                  <AlertTriangle size={14} />
                  <span>You don&apos;t hold enough shares</span>
                </div>
              )}

            <button
              onClick={executeTrade}
              disabled={
                (tradeType === "buy" &&
                  (currentPrices[tradeTicker] || 0) * tradeShares > cash) ||
                (tradeType === "sell" &&
                  tradeShares >
                    (holdings.find((h) => h.ticker === tradeTicker)?.shares ||
                      0))
              }
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-30 ${
                tradeType === "buy"
                  ? "bg-primary text-white hover:opacity-90"
                  : "bg-red-500 text-white hover:opacity-90"
              }`}
            >
              {tradeType === "buy" ? "Buy" : "Sell"} {tradeShares} {tradeTicker}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ─────────────────────────────────────────────────────── */

function SimStat({
  label,
  value,
  sub,
  subColor,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  subColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>
    </div>
  );
}
