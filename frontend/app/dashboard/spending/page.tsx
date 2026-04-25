"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import {
  CreditCard,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Repeat,
  DollarSign,
  ShoppingBag,
  Home,
  Car,
  Utensils,
  Wifi,
  Dumbbell,
  Music,
  Tv,
  BookOpen,
  Plane,
  Zap,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Transaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  recurring: boolean;
}

interface CategorySpend {
  name: string;
  amount: number;
  budget: number;
  color: string;
  icon: string;
  change: number; // vs last month
}

interface Subscription {
  name: string;
  amount: number;
  frequency: "monthly" | "annual";
  nextBill: string;
  category: string;
  active: boolean;
}

interface MonthlyTrend {
  month: string;
  income: number;
  spending: number;
  savings: number;
}

interface SpendingInsight {
  type: "warning" | "positive" | "suggestion";
  title: string;
  description: string;
}

/* ── Mock Data ─────────────────────────────────────────────────────── */

function generateSpendingData() {
  const categories: CategorySpend[] = [
    {
      name: "Housing",
      amount: 2400,
      budget: 2400,
      color: "#6366f1",
      icon: "home",
      change: 0,
    },
    {
      name: "Food & Dining",
      amount: 847,
      budget: 800,
      color: "#f59e0b",
      icon: "utensils",
      change: 12.3,
    },
    {
      name: "Transportation",
      amount: 520,
      budget: 600,
      color: "#10b981",
      icon: "car",
      change: -8.1,
    },
    {
      name: "Shopping",
      amount: 634,
      budget: 500,
      color: "#ec4899",
      icon: "shopping",
      change: 26.8,
    },
    {
      name: "Entertainment",
      amount: 285,
      budget: 300,
      color: "#8b5cf6",
      icon: "tv",
      change: -5.2,
    },
    {
      name: "Health & Fitness",
      amount: 190,
      budget: 250,
      color: "#06b6d4",
      icon: "gym",
      change: 0,
    },
    {
      name: "Utilities",
      amount: 340,
      budget: 350,
      color: "#84cc16",
      icon: "zap",
      change: 3.4,
    },
    {
      name: "Education",
      amount: 120,
      budget: 200,
      color: "#f97316",
      icon: "book",
      change: -40.0,
    },
    {
      name: "Travel",
      amount: 0,
      budget: 400,
      color: "#14b8a6",
      icon: "plane",
      change: -100,
    },
    {
      name: "Subscriptions",
      amount: 187,
      budget: 200,
      color: "#a855f7",
      icon: "repeat",
      change: 5.1,
    },
  ];

  const subscriptions: Subscription[] = [
    {
      name: "Netflix",
      amount: 15.49,
      frequency: "monthly",
      nextBill: "2025-07-12",
      category: "Entertainment",
      active: true,
    },
    {
      name: "Spotify Family",
      amount: 16.99,
      frequency: "monthly",
      nextBill: "2025-07-08",
      category: "Entertainment",
      active: true,
    },
    {
      name: "iCloud+ 200GB",
      amount: 2.99,
      frequency: "monthly",
      nextBill: "2025-07-15",
      category: "Technology",
      active: true,
    },
    {
      name: "ChatGPT Plus",
      amount: 20.0,
      frequency: "monthly",
      nextBill: "2025-07-22",
      category: "Technology",
      active: true,
    },
    {
      name: "YouTube Premium",
      amount: 13.99,
      frequency: "monthly",
      nextBill: "2025-07-19",
      category: "Entertainment",
      active: true,
    },
    {
      name: "Gym Membership",
      amount: 49.99,
      frequency: "monthly",
      nextBill: "2025-07-01",
      category: "Health",
      active: true,
    },
    {
      name: "Adobe Creative Cloud",
      amount: 54.99,
      frequency: "monthly",
      nextBill: "2025-07-05",
      category: "Productivity",
      active: true,
    },
    {
      name: "Amazon Prime",
      amount: 139.0,
      frequency: "annual",
      nextBill: "2025-11-22",
      category: "Shopping",
      active: true,
    },
    {
      name: "Costco Membership",
      amount: 65.0,
      frequency: "annual",
      nextBill: "2026-02-15",
      category: "Shopping",
      active: true,
    },
    {
      name: "NYT Digital",
      amount: 4.0,
      frequency: "monthly",
      nextBill: "2025-07-28",
      category: "Education",
      active: false,
    },
  ];

  const monthlyTrends: MonthlyTrend[] = [
    { month: "Jan", income: 8500, spending: 5200, savings: 3300 },
    { month: "Feb", income: 8500, spending: 4800, savings: 3700 },
    { month: "Mar", income: 8500, spending: 5600, savings: 2900 },
    { month: "Apr", income: 9200, spending: 5100, savings: 4100 },
    { month: "May", income: 8500, spending: 5523, savings: 2977 },
    { month: "Jun", income: 8500, spending: 5523, savings: 2977 },
  ];

  const recentTransactions: Transaction[] = [
    {
      id: "t1",
      date: "2025-06-28",
      merchant: "Whole Foods Market",
      category: "Food & Dining",
      amount: 127.43,
      recurring: false,
    },
    {
      id: "t2",
      date: "2025-06-28",
      merchant: "Shell Gas Station",
      category: "Transportation",
      amount: 52.1,
      recurring: false,
    },
    {
      id: "t3",
      date: "2025-06-27",
      merchant: "Amazon.com",
      category: "Shopping",
      amount: 89.99,
      recurring: false,
    },
    {
      id: "t4",
      date: "2025-06-27",
      merchant: "Uber Eats",
      category: "Food & Dining",
      amount: 34.5,
      recurring: false,
    },
    {
      id: "t5",
      date: "2025-06-26",
      merchant: "Netflix",
      category: "Entertainment",
      amount: 15.49,
      recurring: true,
    },
    {
      id: "t6",
      date: "2025-06-26",
      merchant: "Trader Joe's",
      category: "Food & Dining",
      amount: 78.21,
      recurring: false,
    },
    {
      id: "t7",
      date: "2025-06-25",
      merchant: "Target",
      category: "Shopping",
      amount: 156.32,
      recurring: false,
    },
    {
      id: "t8",
      date: "2025-06-25",
      merchant: "Starbucks",
      category: "Food & Dining",
      amount: 6.85,
      recurring: false,
    },
    {
      id: "t9",
      date: "2025-06-24",
      merchant: "Austin Energy",
      category: "Utilities",
      amount: 145.0,
      recurring: true,
    },
    {
      id: "t10",
      date: "2025-06-24",
      merchant: "Spotify",
      category: "Entertainment",
      amount: 16.99,
      recurring: true,
    },
    {
      id: "t11",
      date: "2025-06-23",
      merchant: "H-E-B",
      category: "Food & Dining",
      amount: 93.44,
      recurring: false,
    },
    {
      id: "t12",
      date: "2025-06-22",
      merchant: "ChatGPT Plus",
      category: "Subscriptions",
      amount: 20.0,
      recurring: true,
    },
  ];

  const insights: SpendingInsight[] = [
    {
      type: "warning",
      title: "Shopping Over Budget",
      description:
        "You've spent $634 on shopping this month, $134 over your $500 budget. Consider waiting 24 hours before non-essential purchases.",
    },
    {
      type: "warning",
      title: "Food & Dining Trending Up",
      description:
        "Food spending is up 12.3% vs last month. Dining out accounted for $320 (38% of food spending). Meal prepping 2 extra days/week could save ~$200/month.",
    },
    {
      type: "positive",
      title: "Transportation Costs Down",
      description:
        "Transportation spending decreased 8.1% this month. Working from home 2 days/week is saving approximately $45/month in gas.",
    },
    {
      type: "suggestion",
      title: "Unused Subscription Detected",
      description:
        "NYT Digital ($4/mo) hasn't been used in 45 days. Consider canceling to save $48/year.",
    },
    {
      type: "positive",
      title: "Savings Rate: 35%",
      description:
        "You're saving $2,977/month (35% of income). This is well above the recommended 20%. Your emergency fund will be fully funded in 2 months at this rate.",
    },
    {
      type: "suggestion",
      title: "Annual Subscription Savings",
      description:
        "Switching Netflix and YouTube Premium to annual plans would save approximately $42/year.",
    },
  ];

  const totalSpending = categories.reduce((s, c) => s + c.amount, 0);
  const totalBudget = categories.reduce((s, c) => s + c.budget, 0);
  const totalSubsMonthly = subscriptions
    .filter((s) => s.active)
    .reduce(
      (sum, s) => sum + (s.frequency === "monthly" ? s.amount : s.amount / 12),
      0,
    );

  return {
    categories,
    subscriptions,
    monthlyTrends,
    recentTransactions,
    insights,
    totalSpending,
    totalBudget,
    totalSubsMonthly,
    income: 8500,
    savingsRate: 35,
  };
}

/* ── Category icon map ─────────────────────────────────────────────── */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  home: <Home size={12} />,
  utensils: <Utensils size={12} />,
  car: <Car size={12} />,
  shopping: <ShoppingBag size={12} />,
  tv: <Tv size={12} />,
  gym: <Dumbbell size={12} />,
  zap: <Zap size={12} />,
  book: <BookOpen size={12} />,
  plane: <Plane size={12} />,
  repeat: <Repeat size={12} />,
  music: <Music size={12} />,
  wifi: <Wifi size={12} />,
};

/* ══════════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════════ */

export default function SpendingPage() {
  const [data, setData] = useState<ReturnType<
    typeof generateSpendingData
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllTx, setShowAllTx] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setData(generateSpendingData());
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="mt-3 text-sm text-muted-foreground">
          Loading spending data...
        </span>
      </div>
    );
  }

  const {
    categories,
    subscriptions,
    monthlyTrends,
    recentTransactions,
    insights,
    totalSpending,
    totalBudget,
    totalSubsMonthly,
    income,
    savingsRate,
  } = data;

  const budgetUtilization = Math.round((totalSpending / totalBudget) * 100);
  const activeSubs = subscriptions.filter((s) => s.active);
  const visibleTx = showAllTx
    ? recentTransactions
    : recentTransactions.slice(0, 8);

  return (
    <div className="p-8 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl tracking-tight mb-1">Spending</h1>
        <p className="text-sm text-muted-foreground">
          Track spending, manage subscriptions, and get insights to optimize
          your cash flow.
        </p>
      </div>

      {/* ═══ Top Metrics ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: "Monthly Income",
            value: `$${income.toLocaleString()}`,
            color: "",
          },
          {
            label: "Total Spending",
            value: `$${totalSpending.toLocaleString()}`,
            color: totalSpending > totalBudget ? "text-red-500" : "",
          },
          {
            label: "Budget Used",
            value: `${budgetUtilization}%`,
            color:
              budgetUtilization > 100
                ? "text-red-500"
                : budgetUtilization > 85
                  ? "text-amber-600"
                  : "text-primary",
          },
          {
            label: "Subscriptions",
            value: `$${totalSubsMonthly.toFixed(0)}/mo`,
            color: "",
          },
          {
            label: "Savings Rate",
            value: `${savingsRate}%`,
            color: savingsRate >= 20 ? "text-primary" : "text-amber-600",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="border border-border/50 rounded-lg px-4 py-3 bg-muted/20"
          >
            <p className="text-[10px] font-medium text-xs tracking-tight text-muted-foreground mb-1">
              {m.label}
            </p>
            <p className={`text-2xl font-semibold tracking-tight ${m.color}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* ═══ Cash Flow Trend ═══ */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold">Monthly Cash Flow</h3>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={monthlyTrends}
              margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderColor: "hsl(var(--border))",
                  borderRadius: 8,
                }}
                formatter={(v: any, name?: string) => [
                  `$${Number(v).toLocaleString()}`,
                  name ?? "",
                ]}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#incGrad)"
                name="Income"
              />
              <Area
                type="monotone"
                dataKey="spending"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#spendGrad)"
                name="Spending"
              />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                name="Savings"
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-primary rounded" /> Income
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-red-500 rounded" /> Spending
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-indigo-500 rounded" /> Savings
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Categories + Recent Transactions ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category Spending */}
        <div className="lg:col-span-2 border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold">Spending by Category</h3>
          </div>
          <div className="p-4 space-y-3">
            {categories
              .filter((c) => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((cat) => {
                const pct = Math.min((cat.amount / cat.budget) * 100, 100);
                const over = cat.amount > cat.budget;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center"
                          style={{
                            backgroundColor: cat.color + "18",
                            color: cat.color,
                          }}
                        >
                          {CATEGORY_ICONS[cat.icon] || <DollarSign size={12} />}
                        </span>
                        <span className="text-xs font-medium">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs tabular-nums font-semibold ${over ? "text-red-500" : ""}`}
                        >
                          ${cat.amount.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          /${cat.budget.toLocaleString()}
                        </span>
                        {cat.change !== 0 && (
                          <span
                            className={`flex items-center gap-0.5 text-[10px] tabular-nums ${
                              cat.change > 0
                                ? "text-red-500"
                                : "text-primary"
                            }`}
                          >
                            {cat.change > 0 ? (
                              <ArrowUpRight size={9} />
                            ) : (
                              <ArrowDownRight size={9} />
                            )}
                            {Math.abs(cat.change)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: over ? "#ef4444" : cat.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold">Recent Transactions</h3>
          </div>
          <div className="divide-y divide-border">
            {visibleTx.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate max-w-[150px]">
                      {tx.merchant}
                    </span>
                    {tx.recurring && (
                      <Repeat
                        size={9}
                        className="text-muted-foreground shrink-0"
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {tx.date} · {tx.category}
                  </span>
                </div>
                <span className="text-xs tabular-nums font-semibold text-red-500 shrink-0">
                  -${tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {recentTransactions.length > 8 && (
            <button
              onClick={() => setShowAllTx(!showAllTx)}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border transition-colors"
            >
              {showAllTx
                ? "Show less"
                : `Show all ${recentTransactions.length}`}
            </button>
          )}
        </div>
      </div>

      {/* ═══ Subscriptions ═══ */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Repeat size={14} /> Subscriptions & Recurring
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${totalSubsMonthly.toFixed(0)}/month · $
              {(totalSubsMonthly * 12).toFixed(0)}/year
            </p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {subscriptions.map((sub) => (
            <div
              key={sub.name}
              className={`flex items-center justify-between px-5 py-2.5 hover:bg-accent/20 transition-colors ${
                !sub.active ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{sub.name}</span>
                  {!sub.active && (
                    <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      Inactive
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {sub.category} · Next: {sub.nextBill}
                </span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm tabular-nums font-semibold">
                  ${sub.amount.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  /{sub.frequency === "monthly" ? "mo" : "yr"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Insights ═══ */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap size={14} /> Spending Insights
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personalized recommendations based on your spending patterns.
          </p>
        </div>
        <div className="divide-y divide-border">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex gap-3 px-5 py-3.5 hover:bg-accent/20 transition-colors"
            >
              <div className="mt-0.5 shrink-0">
                {insight.type === "warning" ? (
                  <AlertTriangle size={14} className="text-amber-500" />
                ) : insight.type === "positive" ? (
                  <CheckCircle size={14} className="text-primary" />
                ) : (
                  <Info size={14} className="text-blue-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {insight.description}
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
          Spending data shown is illustrative. Connect your bank accounts to see
          real transactions and spending patterns. Categories and budgets can be
          customized in settings.
        </p>
      </div>
    </div>
  );
}
