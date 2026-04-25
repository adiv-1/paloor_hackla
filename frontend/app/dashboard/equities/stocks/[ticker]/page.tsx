"use client";

import { Fragment, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EquityTickerSearch } from "@/components/EquityTickerSearch";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft,
  Loader2,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowDownUp,
  BarChart3,
  Activity,
  FileText,
  Users,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Minus,
  ArrowRight,
  Newspaper,
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  Save,
  ImagePlus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
  Line,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface Company {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  industry: string;
}

interface OverviewMeta {
  description: string;
  official_site: string;
  exchange: string;
  currency: string;
  country: string;
  fiscal_year_end: string;
  latest_quarter: string;
  market_cap: string;
  ebitda: string;
  pe_ratio: string;
  forward_pe: string;
  peg_ratio: string;
  book_value: string;
  dividend_per_share: string;
  dividend_yield: string;
  eps: string;
  roe: string;
  roa: string;
  beta: string;
  high_52w: string;
  low_52w: string;
  analyst_target: string;
  revenue_ttm: string;
  profit_margin: string;
  operating_margin: string;
  shares_outstanding: string;
}

interface RatioItem {
  value: number | null;
  formatted?: string | null;
  label: string;
}

interface HeaderRatioOption {
  id: string;
  item: RatioItem;
}

type HeaderMetricTile = {
  key: string;
  label: string;
  value: string;
  item: RatioItem;
};

interface PricePoint {
  date: string;
  price: number;
  rawPrice?: number;
  regime: string;
}

interface StatementRow {
  metric: string;
  label: string;
  values: Record<string, number>;
  formatted: Record<string, string>;
}

interface Statement {
  ticker: string;
  statement: string;
  period_type: string;
  periods: string[];
  rows: StatementRow[];
}

type StatementGroup = {
  summary: StatementRow;
  leadingDetails: StatementRow[];
  trailingDetails: StatementRow[];
};

interface InflectionPoint {
  date: string;
  price: number;
  from_regime: string;
  to_regime: string;
  z_score: number;
  significance: string;
}

interface MarketMover {
  date: string;
  z_score: number;
  price: number;
  direction: string;
  magnitude: string;
}

interface AnalysisData {
  prices: PricePoint[];
  z_scores: { date: string; z_score: number }[];
  regime_means: Record<string, number>;
  inflection_points: InflectionPoint[];
  market_movers: MarketMover[];
}

interface DocumentFiling {
  type: string;
  date: string;
  url: string;
  description?: string;
}

interface DocumentsResponse {
  total: number;
  annual_reports: DocumentFiling[];
  quarterly_reports: DocumentFiling[];
  announcements: DocumentFiling[];
  other: DocumentFiling[];
}

interface RegimeBand {
  start: string;
  end: string;
  regime: string;
  startIndex: number;
  endIndex: number;
}

type InsightSelection =
  | { kind: "event"; event: MarketMover }
  | { kind: "regime"; band: RegimeBand };

interface NewsArticle {
  title: string;
  snippet: string;
  url: string;
  publisher: string;
  article_date: string;
  relevance_window: "before" | "after";
  relevance_score: number | null;
}

interface EventInsight {
  articles: NewsArticle[];
  summary: string | null;
}

/* ━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y"] as const;
const PRICE_HISTORY_FETCH_PERIOD = "10Y";
const PERIOD_DAY_COUNTS: Record<(typeof PERIODS)[number], number> = {
  "1M": 31,
  "3M": 92,
  "6M": 183,
  "1Y": 366,
  "3Y": 1096,
  "5Y": 1827,
  "10Y": 3653,
};

type PriceStatsSummary = {
  current: number;
  start: number;
  change: number;
  changePct: number;
  isUp: boolean;
  startDate: string;
  endDate: string;
};

function mapHistoricalPricePoint(d: {
  date: string;
  close?: number | string | null;
  adj_close?: number | string | null;
}) {
  const adjustedPrice = Number(d.adj_close ?? d.close ?? 0);
  const rawPrice = Number(d.close ?? d.adj_close ?? 0);

  return {
    date: d.date,
    price: adjustedPrice,
    rawPrice,
    regime: "",
  } satisfies PricePoint;
}

function fmtPrice(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function fmtLongDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function slicePricesForPeriod(prices: PricePoint[], period: string) {
  if (!prices.length) return [];

  const dayCount = PERIOD_DAY_COUNTS[period as (typeof PERIODS)[number]];
  if (!dayCount) return prices;

  const latest = new Date(`${prices[prices.length - 1].date}T00:00:00`);
  const cutoff = new Date(latest);
  cutoff.setDate(cutoff.getDate() - dayCount);

  const filtered = prices.filter((point) => {
    const pointDate = new Date(`${point.date}T00:00:00`);
    return pointDate >= cutoff;
  });

  return filtered.length ? filtered : prices;
}

function buildPriceStats(prices: PricePoint[]): PriceStatsSummary | null {
  if (!prices.length) return null;

  const start = prices[0];
  const latest = prices[prices.length - 1];
  const change = latest.price - start.price;
  const changePct = start.price ? (change / start.price) * 100 : 0;

  return {
    current: latest.price,
    start: start.price,
    change,
    changePct,
    isUp: change >= 0,
    startDate: start.date,
    endDate: latest.date,
  };
}

function fmtPeriodHead(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatStatementDisplayValue(val: number, metricKey: string) {
  if (metricKey === "SharesOutstanding") {
    if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    return `${Math.round(val).toLocaleString()}`;
  }
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatementRow(statement: Statement | null, metric: string) {
  return statement?.rows.find((row) => row.metric === metric) ?? null;
}

function buildDerivedStatementRow(
  metric: string,
  label: string,
  periods: string[],
  valuesByPeriod: Record<string, number | undefined>,
): StatementRow | null {
  const values: Record<string, number> = {};
  const formatted: Record<string, string> = {};

  for (const period of periods) {
    const value = valuesByPeriod[period];
    if (value === undefined || Number.isNaN(value)) continue;
    values[period] = value;
    formatted[period] = formatStatementDisplayValue(value, metric);
  }

  if (!Object.keys(values).length) return null;
  return { metric, label, values, formatted };
}

function buildAugmentedCashflowStatement(
  cashflow: Statement | null,
  balance: Statement | null,
) {
  if (!cashflow) return null;

  const periods = cashflow.periods;
  const cashBalanceRow =
    getStatementRow(balance, "Cash") ??
    getStatementRow(balance, "CashAndShortTermInvestments");

  const operatingRow = getStatementRow(cashflow, "OperatingCashFlow");
  const investingRow = getStatementRow(cashflow, "InvestingCashFlow");
  const financingRow = getStatementRow(cashflow, "FinancingCashFlow");
  const capexRow = getStatementRow(cashflow, "CapitalExpenditures");

  if (!cashBalanceRow || !operatingRow || !investingRow || !financingRow) {
    return cashflow;
  }

  const balancePeriodIndex = new Map((balance?.periods ?? []).map((period, index) => [period, index]));

  const beginningCashValues: Record<string, number | undefined> = {};
  const netChangeValues: Record<string, number | undefined> = {};
  const balanceSheetChangeValues: Record<string, number | undefined> = {};
  const reconciliationGapValues: Record<string, number | undefined> = {};
  const endingCashValues: Record<string, number | undefined> = {};
  const freeCashFlowValues: Record<string, number | undefined> = {};

  for (const period of periods) {
    const operating = operatingRow.values[period];
    const investing = investingRow.values[period];
    const financing = financingRow.values[period];
    const cashComponents = [operating, investing, financing].filter(
      (value): value is number => value !== undefined,
    );

    if (cashComponents.length) {
      netChangeValues[period] = cashComponents.reduce((sum, value) => sum + value, 0);
    }

    const endingCash = cashBalanceRow.values[period];
    if (endingCash !== undefined) {
      endingCashValues[period] = endingCash;
    }

    const periodIndex = balancePeriodIndex.get(period);
    const priorPeriod = periodIndex !== undefined ? balance?.periods?.[periodIndex + 1] : undefined;
    const priorCash = priorPeriod ? cashBalanceRow.values[priorPeriod] : undefined;
    const beginningCash =
      priorCash !== undefined
        ? priorCash
        : endingCash !== undefined && netChangeValues[period] !== undefined
          ? endingCash - netChangeValues[period]
          : undefined;

    if (beginningCash !== undefined) {
      beginningCashValues[period] = beginningCash;
    }

    if (endingCash !== undefined && beginningCash !== undefined) {
      balanceSheetChangeValues[period] = endingCash - beginningCash;
      if (netChangeValues[period] !== undefined) {
        const gap = netChangeValues[period] - balanceSheetChangeValues[period];
        reconciliationGapValues[period] = Math.abs(gap) < 1 ? 0 : gap;
      }
    }

    const capex = capexRow?.values[period];
    if (operating !== undefined || capex !== undefined) {
      freeCashFlowValues[period] = (operating ?? 0) + (capex ?? 0);
    }
  }

  const derivedRows = [
    buildDerivedStatementRow("BeginningCashPosition", "Beginning Cash Position", periods, beginningCashValues),
    buildDerivedStatementRow("NetChangeInCash", "Net Change in Cash", periods, netChangeValues),
    buildDerivedStatementRow("BalanceSheetCashChange", "Balance Sheet Cash Change", periods, balanceSheetChangeValues),
    buildDerivedStatementRow("CashReconciliationGap", "Cash Reconciliation Gap", periods, reconciliationGapValues),
    buildDerivedStatementRow("EndingCashPosition", "Ending Cash Position", periods, endingCashValues),
    buildDerivedStatementRow("FreeCashFlow", "Free Cash Flow", periods, freeCashFlowValues),
  ].filter((row): row is StatementRow => Boolean(row));

  if (!derivedRows.length) return cashflow;

  return {
    ...cashflow,
    rows: [...cashflow.rows, ...derivedRows],
  } satisfies Statement;
}

function buildStatementGroups(statement: Statement) {
  const rowsByMetric = new Map(statement.rows.map((row) => [row.metric, row]));

  if (statement.statement === "income") {
    const groupBlueprints = [
      {
        summary: "Revenue",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "CostOfRevenue",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "GrossProfit",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "OperatingIncome",
        leadingDetails: [
          "ResearchAndDevelopment",
          "SellingGeneralAdmin",
          "OperatingExpenses",
        ],
        trailingDetails: [] as string[],
      },
      {
        summary: "EBITDA",
        leadingDetails: [] as string[],
        trailingDetails: [
          "DepreciationAmortization",
        ],
      },
      {
        summary: "EBIT",
        leadingDetails: [] as string[],
        trailingDetails: [
          "InterestIncome",
          "InterestExpense",
          "NetInterestIncome",
          "InvestmentIncomeNet",
          "OtherNonOperatingIncome",
          "InterestAndDebtExpense",
          "NonInterestIncome",
        ],
      },
      {
        summary: "PreTaxIncome",
        leadingDetails: [] as string[],
        trailingDetails: [
          "IncomeTaxExpense",
        ],
      },
      {
        summary: "NetIncomeContinuingOperations",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "NetIncome",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
    ];

    const usedMetrics = new Set<string>();
    const groups: StatementGroup[] = [];

    for (const blueprint of groupBlueprints) {
      const summary = rowsByMetric.get(blueprint.summary);
      if (!summary) continue;

      usedMetrics.add(summary.metric);
      const leadingDetails = blueprint.leadingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));
      const trailingDetails = blueprint.trailingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));

      leadingDetails.forEach((row) => usedMetrics.add(row.metric));
      trailingDetails.forEach((row) => usedMetrics.add(row.metric));

      groups.push({ summary, leadingDetails, trailingDetails });
    }

    for (const row of statement.rows) {
      if (usedMetrics.has(row.metric)) continue;
      groups.push({ summary: row, leadingDetails: [], trailingDetails: [] });
    }

    return groups;
  }

  if (statement.statement === "balance") {
    const currentCashMetric = rowsByMetric.has("Cash")
      ? "Cash"
      : rowsByMetric.has("CashAndShortTermInvestments")
        ? "CashAndShortTermInvestments"
        : null;
    const currentDebtMetric = rowsByMetric.has("ShortTermDebt")
      ? "ShortTermDebt"
      : rowsByMetric.has("CurrentLongTermDebt")
        ? "CurrentLongTermDebt"
        : null;

    const hiddenMetrics = new Set<string>();
    if (rowsByMetric.has("Cash") && rowsByMetric.has("CashAndShortTermInvestments")) {
      hiddenMetrics.add("CashAndShortTermInvestments");
    }
    if (rowsByMetric.has("ShortTermDebt") && rowsByMetric.has("CurrentLongTermDebt")) {
      hiddenMetrics.add("CurrentLongTermDebt");
    }

    const currentAssetDetails = [
      currentCashMetric,
      currentCashMetric === "Cash" ? "ShortTermInvestments" : null,
      "AccountsReceivable",
      "Inventory",
      "OtherCurrentAssets",
    ].filter((metric): metric is string => Boolean(metric));

    const currentLiabilityDetails = [
      "AccountsPayable",
      currentDebtMetric,
      "DeferredRevenue",
      "OtherCurrentLiabilities",
    ].filter((metric): metric is string => Boolean(metric));

    const groupBlueprints = [
      {
        summary: "CurrentAssets",
        leadingDetails: currentAssetDetails,
        trailingDetails: [] as string[],
      },
      {
        summary: "NoncurrentAssets",
        leadingDetails: [
          "PropertyPlantEquipment",
          "LongTermInvestments",
          "Goodwill",
          "IntangibleAssets",
          "OtherNonCurrentAssets",
        ],
        trailingDetails: [] as string[],
      },
      {
        summary: "TotalAssets",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "CurrentLiabilities",
        leadingDetails: currentLiabilityDetails,
        trailingDetails: [] as string[],
      },
      {
        summary: "NoncurrentLiabilities",
        leadingDetails: [
          "LongTermDebt",
          "CapitalLeaseObligations",
          "OtherNonCurrentLiabilities",
        ],
        trailingDetails: [] as string[],
      },
      {
        summary: "TotalLiabilities",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
      {
        summary: "TotalEquity",
        leadingDetails: [
          "CommonStock",
          "RetainedEarnings",
          "TreasuryStock",
          "OtherEquity",
        ],
        trailingDetails: [] as string[],
      },
      {
        summary: "SharesOutstanding",
        leadingDetails: [] as string[],
        trailingDetails: [] as string[],
      },
    ];

    const usedMetrics = new Set<string>();
    const groups: StatementGroup[] = [];

    for (const blueprint of groupBlueprints) {
      const summary = rowsByMetric.get(blueprint.summary);
      if (!summary) continue;

      usedMetrics.add(summary.metric);
      const leadingDetails = blueprint.leadingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));
      const trailingDetails = blueprint.trailingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));

      leadingDetails.forEach((row) => usedMetrics.add(row.metric));
      trailingDetails.forEach((row) => usedMetrics.add(row.metric));

      groups.push({ summary, leadingDetails, trailingDetails });
    }

    for (const row of statement.rows) {
      if (hiddenMetrics.has(row.metric)) continue;
      if (usedMetrics.has(row.metric)) continue;
      groups.push({ summary: row, leadingDetails: [], trailingDetails: [] });
    }

    return groups;
  }

  if (statement.statement === "cashflow") {
    const groupBlueprints = [
      {
        summary: "OperatingCashFlow",
        leadingDetails: [] as string[],
        trailingDetails: [
          "NetIncome",
          "DepreciationAmortization",
          "StockBasedCompensation",
          "ChangeInReceivables",
          "ChangeInInventory",
          "ChangeInOperatingAssets",
          "ChangeInOperatingLiabilities",
          "PaymentsForOperatingActivities",
          "ProceedsFromOperatingActivities",
          "OtherOperatingAdjustments",
        ],
      },
      {
        summary: "InvestingCashFlow",
        leadingDetails: [] as string[],
        trailingDetails: [
          "CapitalExpenditures",
          "OtherInvestingActivities",
        ],
      },
      {
        summary: "FinancingCashFlow",
        leadingDetails: [] as string[],
        trailingDetails: [
          "DividendsPaid",
          "ShareRepurchases",
          "ShortTermDebtRepayments",
          "DebtIssuedNet",
          "CommonStockIssued",
          "TreasuryStockSales",
          "OtherFinancingActivities",
        ],
      },
      {
        summary: "EndingCashPosition",
        leadingDetails: [] as string[],
        trailingDetails: [
          "BeginningCashPosition",
          "NetChangeInCash",
          "BalanceSheetCashChange",
          "CashReconciliationGap",
        ],
      },
      {
        summary: "FreeCashFlow",
        leadingDetails: [] as string[],
        trailingDetails: [
          "OperatingCashFlow",
          "CapitalExpenditures",
        ],
      },
    ];

    const usedMetrics = new Set<string>();
    const groups: StatementGroup[] = [];

    for (const blueprint of groupBlueprints) {
      const summary = rowsByMetric.get(blueprint.summary);
      if (!summary) continue;

      usedMetrics.add(summary.metric);
      const leadingDetails = blueprint.leadingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));
      const trailingDetails = blueprint.trailingDetails
        .map((metric) => rowsByMetric.get(metric))
        .filter((row): row is StatementRow => Boolean(row));

      leadingDetails.forEach((row) => usedMetrics.add(row.metric));
      trailingDetails.forEach((row) => usedMetrics.add(row.metric));

      groups.push({ summary, leadingDetails, trailingDetails });
    }

    for (const row of statement.rows) {
      if (usedMetrics.has(row.metric)) continue;
      groups.push({ summary: row, leadingDetails: [], trailingDetails: [] });
    }

    return groups;
  }

  const summaryMetrics = new Set([
    "Revenue",
    "CostOfRevenue",
    "GrossProfit",
    "OperatingIncome",
    "EBITDA",
    "EBIT",
    "PreTaxIncome",
    "NetIncomeContinuingOperations",
    "NetIncome",
    "TotalAssets",
    "TotalLiabilities",
    "TotalEquity",
    "CurrentAssets",
    "CurrentLiabilities",
    "OperatingCashFlow",
    "InvestingCashFlow",
    "FinancingCashFlow",
    "Cash",
  ]);

  const groups: StatementGroup[] = [];
  let currentGroup: StatementGroup | null = null;

  for (const row of statement.rows) {
    if (summaryMetrics.has(row.metric)) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { summary: row, leadingDetails: [], trailingDetails: [] };
    } else if (currentGroup) {
      currentGroup.trailingDetails.push(row);
    } else {
      groups.push({ summary: row, leadingDetails: [], trailingDetails: [] });
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

function getStatementSourceLabel(statement: Statement | null) {
  if (!statement) return "Source: Alpha Vantage normalized statement data, not EDGAR.";

  if (statement.statement === "income") {
    return "Source: Alpha Vantage INCOME_STATEMENT API, not EDGAR, normalized to SEC GAAP/IFRS fields.";
  }
  if (statement.statement === "balance") {
    return "Source: Alpha Vantage BALANCE_SHEET API, not EDGAR, normalized to SEC GAAP/IFRS fields.";
  }
  if (statement.statement === "cashflow") {
    return "Source: Alpha Vantage CASH_FLOW API, not EDGAR, normalized to SEC GAAP/IFRS fields.";
  }
  return "Source: Alpha Vantage normalized statement data, not EDGAR.";
}

function fmtRatioValue(item: RatioItem) {
  if (item.formatted) return item.formatted;
  if (typeof item.value === "number") {
    return item.value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }
  return "—";
}

function fmtRatioDisplay(item: RatioItem) {
  const value = fmtRatioValue(item);
  if (!item.formatted && item.label.includes("%") && typeof item.value === "number") {
    return `${value}%`;
  }
  return value;
}

function buildOverviewMetric(
  key: string,
  label: string,
  value: string,
  source?: RatioItem | null,
  fallbackValue: number | null = null,
) {
  return {
    key,
    label,
    value,
    item: {
      label,
      value: typeof source?.value === "number" ? source.value : fallbackValue,
      formatted: value,
    } satisfies RatioItem,
  };
}

const REGIME_FILL: Record<string, string> = {
  bull: "rgba(16,185,129,0.38)",
  bear: "rgba(239,68,68,0.35)",
  neutral: "rgba(156,163,175,0.14)",
};

// kept for backward-compat in ReferenceArea highlight
const REGIME_COLORS = REGIME_FILL;

const REGIME_LABEL: Record<string, string> = {
  bull: "Bull",
  bear: "Bear",
  neutral: "Neutral",
};

/* ━━ Sub-components ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Markdown renderer ───────────────────────────────────────────────────── */

function renderMarkdown(text: string): string {
  let html = text;
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-2 mb-1">$1</h2>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-muted px-1 py-0.5 rounded text-[11px]">$1</code>',
  );
  // Unordered list items (including nested with indentation)
  html = html.replace(/^\s*\* (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /(<li[^>]*>.*?<\/li>\n?)+/gs,
    (m) => `<ul class="space-y-0.5 my-1">${m}</ul>`,
  );
  // Line breaks (but not inside tags)
  html = html.replace(/\n/g, "<br/>");
  // Clean up double <br/> after </ul>
  html = html.replace(/<\/ul><br\/>/g, "</ul>");
  html = html.replace(/<\/h[23]><br\/>/g, (m) => m.replace("<br/>", ""));
  return html;
}

/* ── Ambient AI Popover ──────────────────────────────────────────────────── */

interface AmbientContext {
  type: "price_range" | "metric" | "margin" | "statement_cell";
  ticker: string;
  description: string;
  data?: Record<string, any>;
}

function AmbientAIPopover({
  context,
  position,
  onClose,
}: {
  context: AmbientContext;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const { token, user } = useAuth();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; text: string; image?: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate an initial insight on mount
  useEffect(() => {
    let cancelled = false;
    async function getInitialInsight() {
      setInitialLoading(true);
      try {
        const res = await fetch(`${API}/api/equities/v2/ambient-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context_type: context.type,
            ticker: context.ticker,
            description: context.description,
            data: context.data || {},
            query: null,
            history: [],
          }),
        });
        if (res.ok && !cancelled) {
          const result = await res.json();
          setMessages([{ role: "ai", text: result.response }]);
        }
      } catch {
        if (!cancelled)
          setMessages([
            {
              role: "ai",
              text: "Select a metric or range to get AI insights.",
            },
          ]);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }
    getInitialInsight();
    return () => { cancelled = true; };
  }, [context]);

  // Focus input after initial load
  useEffect(() => {
    if (!initialLoading) inputRef.current?.focus();
  }, [initialLoading]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function handleSend() {
    if (!query.trim() || loading) return;
    const userMsg = query.trim();
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/equities/v2/ambient-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_type: context.type,
          ticker: context.ticker,
          description: context.description,
          data: context.data || {},
          query: userMsg,
          history: messages.map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            text: m.text,
          })),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setMessages((prev) => [...prev, { role: "ai", text: result.response }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Sorry, I couldn't process that request." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setMessages((prev) => [
        ...prev,
        { role: "user", text: `[Uploaded image: ${file.name}]`, image: base64 },
      ]);
      // Send image with context for AI analysis
      setLoading(true);
      fetch(`${API}/api/equities/v2/ambient-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_type: context.type,
          ticker: context.ticker,
          description: context.description,
          data: { ...context.data, image: base64 },
          query: `Analyze this uploaded image in the context of ${context.ticker} ${context.description}`,
          history: messages.map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            text: m.text,
          })),
        }),
      })
        .then((r) => r.json())
        .then((result) =>
          setMessages((prev) => [...prev, { role: "ai", text: result.response }]),
        )
        .catch(() =>
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: "Could not analyze the image." },
          ]),
        )
        .finally(() => setLoading(false));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSaveToChat() {
    if (!token || !user || messages.length === 0) return;
    setSaving(true);
    try {
      // 1. Create a new AI conversation
      const convRes = await fetch(`${API}/api/chat/conversations/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: `${context.ticker} — ${context.description}`,
        }),
      });
      if (!convRes.ok) throw new Error("Failed to create conversation");
      const conv = await convRes.json();

      // 2. Insert all messages
      for (const msg of messages) {
        await fetch(
          `${API}/api/chat/conversations/${conv.id}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content: msg.text }),
          },
        );
      }
      setSaved(true);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  const containerClass = expanded
    ? "fixed inset-4 sm:inset-8 z-[9999] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
    : "w-[340px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden";

  const containerStyle: React.CSSProperties = expanded
    ? {}
    : {
        position: "fixed",
        top: Math.min(position.y, window.innerHeight - 400),
        left: Math.min(position.x + 8, window.innerWidth - 360),
        zIndex: 9999,
      };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/10"
        onClick={onClose}
      />
      <div style={containerStyle} className={containerClass}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Paloor AI
          </div>
          <div className="flex items-center gap-1">
            {!saved && messages.length > 0 && (
              <button
                onClick={handleSaveToChat}
                disabled={saving}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
                title="Save to Chat"
              >
                <Save className={`w-3.5 h-3.5 ${saving ? "animate-pulse" : ""}`} />
              </button>
            )}
            {saved && (
              <span className="text-[10px] text-emerald-500 font-medium px-1">
                Saved ✓
              </span>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
              title={expanded ? "Minimize" : "Expand"}
            >
              {expanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Context badge */}
        <div className="px-3 py-1.5 bg-muted/20 border-b border-border/30">
          <p className="text-[10px] text-muted-foreground truncate">
            {context.description}
          </p>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className={`overflow-y-auto px-3 py-2 space-y-3 flex-1 ${
            expanded ? "max-h-none" : "max-h-[280px]"
          }`}
        >
          {initialLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing…
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs leading-relaxed ${
                  msg.role === "ai"
                    ? "text-foreground/90"
                    : "text-primary font-medium"
                }`}
              >
                {msg.role === "user" && (
                  <span className="text-muted-foreground mr-1">You:</span>
                )}
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="Uploaded"
                    className="max-w-[200px] rounded-md border border-border/40 mb-1"
                  />
                )}
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(msg.text),
                  }}
                />
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking…
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-3 py-1 border-t border-border/20 bg-muted/10">
          <p className="text-[9px] text-muted-foreground/60 italic">
            AI insights are for informational purposes only and should not be considered financial advice.
          </p>
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50 bg-muted/10">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
            title="Upload image"
          >
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask a follow-up…"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none"
            disabled={initialLoading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !query.trim() || initialLoading}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Ratio Grid (compact, Screener.in-inspired) ──────────────────────────── */

function RatioGrid({
  ratios,
  onClickItem,
}: {
  ratios: Record<string, Record<string, RatioItem>>;
  onClickItem?: (item: RatioItem, key: string, e: React.MouseEvent) => void;
}) {
  const sections = [
    { key: "overview", label: "Overview" },
    { key: "valuation", label: "Valuation" },
    { key: "profitability", label: "Profitability" },
    { key: "liquidity", label: "Liquidity" },
    { key: "leverage", label: "Leverage" },
    { key: "efficiency", label: "Efficiency" },
    { key: "growth", label: "Growth" },
    { key: "cashflow", label: "Cash Flow" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sections.map(({ key, label }) => {
        const data = ratios[key];
        if (!data) return null;
        const entries = Object.entries(data).filter(
          ([, v]) => v.value !== null && v.value !== undefined,
        );
        if (!entries.length) return null;

        return (
          <div
            key={key}
            className="overflow-hidden rounded-xl bg-card p-5 border border-border pb-6 shadow-sm"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              {label}
            </h3>
            <dl className="divide-y divide-border/40">
              {entries.map(([entryKey, item]) => (
                <div
                  key={entryKey}
                  onClick={onClickItem ? (e) => onClickItem(item, entryKey, e) : undefined}
                  className={`flex items-center justify-between py-2 text-[13px] group ${onClickItem ? "cursor-pointer hover:bg-primary/5 transition-colors -mx-2 px-2 rounded-sm" : ""}`}
                >
                  <dt className="text-muted-foreground truncate leading-tight min-w-0 pr-4">
                    {item.label}
                  </dt>
                  <dd className="font-semibold text-foreground tabular-nums shrink-0 text-right">
                    {fmtRatioDisplay(item)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

/* ── Chart tooltip ───────────────────────────────────────────────────────── */

type ChartRangeInfo = {
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  change: number;
  changePct: number;
};

function ChartPeriodSelector({
  period,
  setPeriod,
}: {
  period: string;
  setPeriod: (p: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-background/85 p-1 shadow-sm">
      {PERIODS.map((p) => {
        const active = period === p;
        return (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function ChartRangeSummary({
  rangeInfo,
  onClear,
  onAskAI,
}: {
  rangeInfo: ChartRangeInfo;
  onClear: () => void;
  onAskAI?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const positive = rangeInfo.change >= 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-border/60 bg-gradient-to-r from-primary/[0.08] via-background to-background px-4 py-3.5 shadow-sm">
      <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Selected Window
      </div>
      <p className="text-[13px] font-medium text-muted-foreground">
        {fmtLongDate(rangeInfo.startDate)} to {fmtLongDate(rangeInfo.endDate)}
      </p>
      <p className="text-[15px] font-semibold tabular-nums text-foreground">
        {fmtPrice(rangeInfo.startPrice)} to {fmtPrice(rangeInfo.endPrice)}
      </p>
      <p
        className={`text-[15px] font-semibold tabular-nums ${
          positive ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {positive ? "+" : ""}
        {rangeInfo.change.toFixed(2)} ({rangeInfo.changePct.toFixed(2)}%)
      </p>
      <div className="ml-auto flex items-center gap-2">
        {onAskAI && (
          <button
            onClick={onAskAI}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            title="Ask AI about this range"
          >
            <Sparkles className="h-3 w-3" />
            Ask AI
          </button>
        )}
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>
    </div>
  );
}

function ChartHorizonSummary({
  period,
  priceStats,
}: {
  period: string;
  priceStats: PriceStatsSummary | null;
}) {
  if (!priceStats) return null;

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      <div className="rounded-[18px] border border-border/60 bg-background/90 px-3.5 py-2.5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Latest Price
        </p>
        <p className="mt-1.5 text-[21px] font-semibold tracking-tight text-foreground tabular-nums">
          {fmtPrice(priceStats.current)}
        </p>
      </div>
      <div className="rounded-[18px] border border-border/60 bg-background/90 px-3.5 py-2.5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {period} Return
        </p>
        <p
          className={`mt-1.5 text-[21px] font-semibold tracking-tight tabular-nums ${
            priceStats.isUp ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {priceStats.isUp ? "+" : ""}
          {priceStats.changePct.toFixed(2)}%
        </p>
      </div>
      <div className="rounded-[18px] border border-border/60 bg-background/90 px-3.5 py-2.5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Period Window
        </p>
        <p className="mt-1.5 text-[13px] font-semibold text-foreground tabular-nums">
          {fmtPrice(priceStats.start)} to {fmtPrice(priceStats.current)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {fmtLongDate(priceStats.startDate)} to {fmtLongDate(priceStats.endDate)}
        </p>
      </div>
    </div>
  );
}

function PriceTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="pointer-events-none z-50 rounded-xl border border-border/70 bg-background/95 px-3.5 py-3 text-[11px] shadow-[0_20px_45px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
      <p className="text-muted-foreground">{fmtLongDate(d.date)}</p>
      <p className="mt-1 text-[15px] font-semibold text-foreground">{fmtPrice(d.price)}</p>
      {d.regime && (
        <p className="mt-1 text-muted-foreground capitalize">
          Trend: {REGIME_LABEL[d.regime] || d.regime}
        </p>
      )}
      {d.eventZ != null && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <p className="font-semibold text-amber-600">
            Z-Score: {d.eventZ > 0 ? "+" : ""}{d.eventZ.toFixed(2)}
          </p>
          <p className="text-muted-foreground">
            {Math.abs(d.eventZ) >= 3 ? "Extreme" : "Significant"} {d.eventZ > 0 ? "upward" : "downward"} move
          </p>
        </div>
      )}
    </div>
  );
}

function PlainPriceChart({
  prices,
  period,
  setPeriod,
  priceStats,
}: {
  prices: PricePoint[];
  period: string;
  setPeriod: (p: string) => void;
  priceStats: PriceStatsSummary | null;
}) {
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);

  const rangeInfo = useMemo(() => {
    if (rangeStart === null || rangeEnd === null || !prices.length) return null;
    const lo = Math.min(rangeStart, rangeEnd);
    const hi = Math.max(rangeStart, rangeEnd);
    if (lo === hi) return null;
    const startP = prices[lo];
    const endP = prices[hi];
    if (!startP || !endP) return null;
    const change = endP.price - startP.price;
    const changePct = (change / startP.price) * 100;
    return {
      startDate: startP.date,
      endDate: endP.date,
      startPrice: startP.price,
      endPrice: endP.price,
      change,
      changePct,
    };
  }, [rangeEnd, rangeStart, prices]);

  const minPrice = useMemo(
    () => Math.min(...prices.map((p) => p.price)) * 0.98,
    [prices],
  );
  const maxPrice = useMemo(
    () => Math.max(...prices.map((p) => p.price)) * 1.02,
    [prices],
  );

  if (!prices.length) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No price data. Click &quot;Fetch Prices&quot; to load.
      </div>
    );
  }

  return (
    <div
      className="select-none space-y-4"
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className="flex flex-col gap-4 rounded-[22px] border border-border/60 bg-muted/[0.12] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Time Horizon
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a window, then drag across the line to compare any two dates.
            </p>
          </div>
          <ChartPeriodSelector period={period} setPeriod={setPeriod} />
        </div>

        <ChartHorizonSummary period={period} priceStats={priceStats} />
      </div>

      {rangeInfo && (
        <ChartRangeSummary
          rangeInfo={rangeInfo}
          onClear={() => {
            setRangeStart(null);
            setRangeEnd(null);
          }}
        />
      )}

      <div className="rounded-[24px] border border-primary/20 bg-gradient-to-b from-primary/[0.04] via-background to-background px-2 py-3 shadow-sm sm:px-3 sm:py-4">
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart
            data={prices}
            onMouseDown={(e: any) => {
              if (e?.activeTooltipIndex != null) {
                setRangeStart(e.activeTooltipIndex);
                setRangeEnd(e.activeTooltipIndex);
                setSelecting(true);
              }
            }}
            onMouseMove={(e: any) => {
              if (selecting && e?.activeTooltipIndex != null) {
                setRangeEnd(e.activeTooltipIndex);
              }
            }}
            onMouseUp={() => setSelecting(false)}
          >
            <defs>
              <linearGradient id="plainPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="rgb(15,118,110)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="95%"
                  stopColor="rgb(15,118,110)"
                  stopOpacity={0.03}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip content={<PriceTooltip />} />
            {rangeStart !== null &&
              rangeEnd !== null &&
              rangeStart !== rangeEnd && (
                <ReferenceArea
                  x1={prices[Math.min(rangeStart, rangeEnd)]?.date}
                  x2={prices[Math.max(rangeStart, rangeEnd)]?.date}
                  fill="var(--primary)"
                  fillOpacity={0.1}
                  strokeOpacity={0}
                />
              )}
            <Area
              type="linear"
              dataKey="price"
              stroke="rgb(15,23,42)"
              strokeWidth={2.2}
              fill="url(#plainPriceFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Unified interactive chart with signals & deep-dive ─────────────────── */

function SignalsPriceChart({
  ticker,
  prices,
  analysis,
  period,
  setPeriod,
  priceStats,
  selectedInsight,
  onSelectInsight,
}: {
  ticker: string;
  prices: PricePoint[];
  analysis: AnalysisData | null;
  period: string;
  setPeriod: (p: string) => void;
  priceStats: PriceStatsSummary | null;
  selectedInsight: InsightSelection | null;
  onSelectInsight: (selection: InsightSelection | null) => void;
}) {
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [isDragged, setIsDragged] = useState(false);
  const [insight, setInsight] = useState<EventInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [ambientCtx, setAmbientCtx] = useState<{
    context: AmbientContext;
    position: { x: number; y: number };
  } | null>(null);

  // Build pipeline params from current selection
  const pipelineParams = useMemo(() => {
    if (!selectedInsight) return null;
    const eventDate =
      selectedInsight.kind === "event"
        ? selectedInsight.event.date
        : selectedInsight.band.start;
    const eventType =
      selectedInsight.kind === "event" ? "zscore" : "regime_shift";
    const details =
      selectedInsight.kind === "event"
        ? `Z-score ${selectedInsight.event.direction} spike of ${selectedInsight.event.z_score} (${selectedInsight.event.magnitude}) at $${selectedInsight.event.price}`
        : `Regime: ${selectedInsight.band.regime} from ${selectedInsight.band.start} to ${selectedInsight.band.end}`;
    return { eventDate, eventType, details };
  }, [selectedInsight]);

  // When selection changes: check cache first, auto-run pipeline if no cached data
  useEffect(() => {
    if (!selectedInsight || !pipelineParams) {
      setInsight(null);
      return;
    }
    let cancelled = false;
    const { eventDate, eventType, details } = pipelineParams;

    async function loadInsight() {
      setInsightLoading(true);
      try {
        // 1. Check cache
        const cacheRes = await fetch(
          `${API}/api/equities/v2/news/${ticker}/${eventDate}`,
        );
        if (cacheRes.ok) {
          const cached = await cacheRes.json();
          if (
            !cancelled &&
            cached.summary &&
            cached.summary !== "No news articles found for this event." &&
            cached.articles?.length > 0
          ) {
            setInsight(cached);
            setInsightLoading(false);
            return;
          }
        }

        // 2. No cache — auto-run the pipeline
        if (cancelled) return;
        setPipelineRunning(true);
        const pipeRes = await fetch(
          `${API}/api/equities/v2/process-event/${ticker}?event_date=${eventDate}&event_type=${eventType}&event_details=${encodeURIComponent(details)}`,
          { method: "POST" },
        );
        if (!cancelled && pipeRes.ok) {
          setInsight(await pipeRes.json());
        }
      } catch {
        if (!cancelled) setInsight({ articles: [], summary: null });
      } finally {
        if (!cancelled) {
          setInsightLoading(false);
          setPipelineRunning(false);
        }
      }
    }

    loadInsight();
    return () => {
      cancelled = true;
    };
  }, [selectedInsight, ticker, pipelineParams]);

  // Manual re-run (e.g. to refresh stale data)
  const handleRunPipeline = useCallback(async () => {
    if (!pipelineParams) return;
    const { eventDate, eventType, details } = pipelineParams;

    setPipelineRunning(true);
    try {
      const res = await fetch(
        `${API}/api/equities/v2/process-event/${ticker}?event_date=${eventDate}&event_type=${eventType}&event_details=${encodeURIComponent(details)}`,
        { method: "POST" },
      );
      if (res.ok) {
        setInsight(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setPipelineRunning(false);
    }
  }, [pipelineParams, ticker]);

  // Base line for trend analysis always comes from raw market price history.
  const mergedPrices = useMemo(() => {
    if (!analysis?.prices?.length) return prices;
    const analysisByDate = Object.fromEntries(
      analysis.prices.map((p) => [p.date, p]),
    );
    return prices.map((p) => ({
      ...p,
      regime: analysisByDate[p.date]?.regime || p.regime || "neutral",
    }));
  }, [analysis, prices]);

  const moverByDate = useMemo(() => {
    if (!analysis?.market_movers?.length)
      return {} as Record<string, MarketMover>;
    return Object.fromEntries(analysis.market_movers.map((m) => [m.date, m]));
  }, [analysis]);

  const inflectionByDate = useMemo(() => {
    if (!analysis?.inflection_points?.length)
      return {} as Record<string, InflectionPoint>;
    return Object.fromEntries(
      analysis.inflection_points.map((i) => [i.date, i]),
    );
  }, [analysis]);

  const chartData = useMemo(
    () =>
      mergedPrices.map((p) => ({
        ...p,
        eventZ: moverByDate[p.date]?.z_score ?? null,
        eventMagnitude: moverByDate[p.date]?.magnitude ?? null,
        inflection: inflectionByDate[p.date] ?? null,
        // Per-regime price keys for AUC fills — undefined = gap in that area
        priceBull: p.regime === "bull" ? p.price : undefined,
        priceBear: p.regime === "bear" ? p.price : undefined,
        priceNeutral: !p.regime || p.regime === "neutral" ? p.price : undefined,
      })),
    [mergedPrices, moverByDate, inflectionByDate],
  );

  const regimeBands = useMemo(() => {
    if (!mergedPrices.length) return [] as RegimeBand[];
    const out: RegimeBand[] = [];
    let startIdx = 0;
    for (let i = 1; i < mergedPrices.length; i++) {
      if (mergedPrices[i].regime !== mergedPrices[startIdx].regime) {
        out.push({
          start: mergedPrices[startIdx].date,
          end: mergedPrices[i - 1].date,
          regime: mergedPrices[startIdx].regime || "neutral",
          startIndex: startIdx,
          endIndex: i - 1,
        });
        startIdx = i;
      }
    }
    out.push({
      start: mergedPrices[startIdx].date,
      end: mergedPrices[mergedPrices.length - 1].date,
      regime: mergedPrices[startIdx].regime || "neutral",
      startIndex: startIdx,
      endIndex: mergedPrices.length - 1,
    });
    return out;
  }, [mergedPrices]);

  const rangeInfo = useMemo(() => {
    if (rangeStart === null || rangeEnd === null || !chartData.length)
      return null;
    const lo = Math.min(rangeStart, rangeEnd);
    const hi = Math.max(rangeStart, rangeEnd);
    if (lo === hi) return null;
    const startP = chartData[lo];
    const endP = chartData[hi];
    if (!startP || !endP) return null;
    const change = endP.price - startP.price;
    const changePct = (change / startP.price) * 100;
    return {
      startDate: startP.date,
      endDate: endP.date,
      startPrice: startP.price,
      endPrice: endP.price,
      change,
      changePct,
    };
  }, [rangeStart, rangeEnd, chartData]);

  const minPrice = useMemo(
    () => Math.min(...chartData.map((p) => p.price)) * 0.98,
    [chartData],
  );
  const maxPrice = useMemo(
    () => Math.max(...chartData.map((p) => p.price)) * 1.02,
    [chartData],
  );

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No price data. Click &quot;Fetch Prices&quot; to load.
      </div>
    );
  }

  return (
    <div
      className="select-none space-y-4"
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className="flex flex-col gap-4 rounded-[22px] border border-border/60 bg-muted/[0.12] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Time Horizon
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Explore the regime overlays, then click any region or event marker for context.
            </p>
          </div>
          <ChartPeriodSelector period={period} setPeriod={setPeriod} />
        </div>

        <ChartHorizonSummary period={period} priceStats={priceStats} />

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5">
            <span
              className="inline-block h-2.5 w-3 rounded-sm"
              style={{ background: REGIME_FILL.bull }}
            />
            Bull
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5">
            <span
              className="inline-block h-2.5 w-3 rounded-sm"
              style={{ background: REGIME_FILL.bear }}
            />
            Bear
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Trend shift events
          </span>
        </div>
      </div>

      {rangeInfo && (
        <ChartRangeSummary
          rangeInfo={rangeInfo}
          onAskAI={(e) => {
            setAmbientCtx({
              context: {
                type: "price_range",
                ticker,
                description: `${ticker} price from ${fmtDate(rangeInfo.startDate)} to ${fmtDate(rangeInfo.endDate)}: ${fmtPrice(rangeInfo.startPrice)} → ${fmtPrice(rangeInfo.endPrice)} (${rangeInfo.changePct >= 0 ? "+" : ""}${rangeInfo.changePct.toFixed(2)}%)`,
                data: {
                  start_date: rangeInfo.startDate,
                  end_date: rangeInfo.endDate,
                  start_price: rangeInfo.startPrice,
                  end_price: rangeInfo.endPrice,
                  change_pct: rangeInfo.changePct,
                },
              },
              position: { x: e.clientX, y: e.clientY },
            });
          }}
          onClear={() => {
            setRangeStart(null);
            setRangeEnd(null);
          }}
        />
      )}

      <div className="rounded-[24px] border border-primary/20 bg-gradient-to-b from-primary/[0.04] via-background to-background px-2 py-3 shadow-sm sm:px-3 sm:py-4">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart
            data={chartData}
            onMouseDown={(e: any) => {
              if (e?.activeTooltipIndex != null && e.activeLabel) {
                setRangeStart(e.activeTooltipIndex);
                setRangeEnd(e.activeTooltipIndex);
                setSelecting(true);
                setIsDragged(false);
              }
            }}
            onMouseMove={(e: any) => {
              if (selecting && e?.activeTooltipIndex != null) {
                if (e.activeTooltipIndex !== rangeStart) setIsDragged(true);
                setRangeEnd(e.activeTooltipIndex);
              }
            }}
            onMouseUp={(e: any) => {
              if (!isDragged && rangeStart !== null) {
                const idx = e?.activeTooltipIndex ?? rangeStart;
                const pt = chartData[idx];
                if (pt && !pt.eventZ) {
                  const band = regimeBands.find(
                    (b) =>
                      b.startIndex <= idx && b.endIndex >= idx,
                  );
                  if (band) onSelectInsight({ kind: "regime", band });
                }
                setRangeStart(null);
                setRangeEnd(null);
              }
              setSelecting(false);
              setIsDragged(false);
            }}
            style={{ cursor: "crosshair" }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip content={<PriceTooltip />} />

            {rangeStart !== null &&
              rangeEnd !== null &&
              rangeStart !== rangeEnd && (
                <ReferenceArea
                  x1={chartData[Math.min(rangeStart, rangeEnd)]?.date}
                  x2={chartData[Math.max(rangeStart, rangeEnd)]?.date}
                  fill="var(--primary)"
                  fillOpacity={0.1}
                  strokeOpacity={0}
                />
              )}

            {/* Regime AUC fills — one Area per regime so they tile under the price curve */}
            <defs>
              <linearGradient id="fillBull" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="rgb(16,185,129)"
                  stopOpacity={0.45}
                />
                <stop
                  offset="95%"
                  stopColor="rgb(16,185,129)"
                  stopOpacity={0.08}
                />
              </linearGradient>
              <linearGradient id="fillBear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(239,68,68)" stopOpacity={0.42} />
                <stop
                  offset="95%"
                  stopColor="rgb(239,68,68)"
                  stopOpacity={0.08}
                />
              </linearGradient>
              <linearGradient id="fillNeutral" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="rgb(156,163,175)"
                  stopOpacity={0.14}
                />
                <stop
                  offset="95%"
                  stopColor="rgb(156,163,175)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>

            <Area
              type="linear"
              dataKey="priceBull"
              stroke="none"
              fill="url(#fillBull)"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              type="linear"
              dataKey="priceBear"
              stroke="none"
              fill="url(#fillBear)"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              type="linear"
              dataKey="priceNeutral"
              stroke="none"
              fill="url(#fillNeutral)"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />

            {selectedInsight?.kind === "regime" && (
              <ReferenceArea
                x1={selectedInsight.band.start}
                x2={selectedInsight.band.end}
                fill={
                  REGIME_COLORS[selectedInsight.band.regime] ||
                  REGIME_COLORS.neutral
                }
                fillOpacity={0.4}
                stroke="var(--foreground)"
                strokeOpacity={0.15}
              />
            )}

            <Line
              type="linear"
              dataKey="price"
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={(props: any) => {
                const pt = props.payload;
                if (pt.eventZ == null) return <g key={props.key} />;
                const isSelected =
                  selectedInsight?.kind === "event" &&
                  selectedInsight.event.date === pt.date;
                return (
                  <g key={props.key} style={{ cursor: "pointer" }}>
                    {/* Invisible hitbox for easier clicking */}
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={16}
                      fill="transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInsight({
                          kind: "event",
                          event: {
                            date: pt.date,
                            z_score: pt.eventZ,
                            price: pt.price,
                            direction: pt.eventZ > 0 ? "up" : "down",
                            magnitude: pt.eventMagnitude || "significant",
                          },
                        });
                      }}
                    />
                    {/* Pulse ring on selected */}
                    {isSelected && (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={10}
                        fill="none"
                        stroke="rgb(245,158,11)"
                        strokeWidth={1.5}
                        opacity={0.4}
                      />
                    )}
                    {/* Visible dot */}
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={isSelected ? 6.5 : 5}
                      fill={isSelected ? "rgb(217,119,6)" : "rgb(245,158,11)"}
                      stroke="white"
                      strokeWidth={2}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInsight({
                          kind: "event",
                          event: {
                            date: pt.date,
                            z_score: pt.eventZ,
                            price: pt.price,
                            direction: pt.eventZ > 0 ? "up" : "down",
                            magnitude: pt.eventMagnitude || "significant",
                          },
                        });
                      }}
                    />
                  </g>
                );
              }}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Click any region to inspect trend context. Click an amber dot for a
        trend shift event.
      </p>

      {/* ── Insight Deep-Dive Panel ─────────────────────────────────────── */}
      <div className="mt-4 border border-border/60 rounded-lg bg-muted/10 p-4">
        {!selectedInsight ? (
          <p className="text-sm text-muted-foreground">
            Click any point on the chart to inspect that trend window, or click
            an amber dot to inspect a trend shift event.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Event header */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {selectedInsight.kind === "event" ? (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Trend Shift Event
                  </span>
                  <span className="text-muted-foreground">
                    {fmtDate(selectedInsight.event.date)}
                  </span>
                  <span className="tabular-nums">
                    {fmtPrice(selectedInsight.event.price)}
                  </span>
                  <span
                    className={`font-semibold ${
                      selectedInsight.event.direction === "up"
                        ? "text-primary"
                        : "text-red-500"
                    }`}
                  >
                    z-score: {selectedInsight.event.z_score > 0 ? "+" : ""}{selectedInsight.event.z_score}
                  </span>
                  {selectedInsight.event.magnitude === "extreme" && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 text-[10px] font-semibold">
                      EXTREME
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <span
                      className="w-3 h-2 rounded-sm"
                      style={{
                        background:
                          REGIME_FILL[selectedInsight.band.regime] ||
                          REGIME_FILL.neutral,
                      }}
                    />
                    {REGIME_LABEL[selectedInsight.band.regime] ||
                      selectedInsight.band.regime}{" "}
                    Trend Window
                  </span>
                  <span className="text-muted-foreground">
                    {fmtDate(selectedInsight.band.start)} →{" "}
                    {fmtDate(selectedInsight.band.end)}
                  </span>
                </>
              )}
            </div>

            {/* Z-score context card for events */}
            {selectedInsight.kind === "event" && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2 text-xs">
                <p className="text-foreground/80">
                  <strong>Why this qualifies:</strong>{" "}
                  A z-score of {selectedInsight.event.z_score > 0 ? "+" : ""}{selectedInsight.event.z_score}{" "}
                  means the stock&apos;s daily return was{" "}
                  <strong>{Math.abs(selectedInsight.event.z_score).toFixed(1)}×</strong>{" "}
                  its normal standard deviation.{" "}
                  {Math.abs(selectedInsight.event.z_score) >= 3
                    ? "This is an extreme move (top 0.3% of trading days)."
                    : "This is a statistically significant move (top 5% of trading days)."}
                </p>
              </div>
            )}

            {/* Content: loading / summary+articles / empty */}
            {insightLoading || pipelineRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {pipelineRunning
                  ? "Scraping articles & generating analysis…"
                  : "Loading insight…"}
              </div>
            ) : insight?.summary &&
              insight.summary !==
                "No news articles found for this event." ? (
              <>
                {/* AI Summary */}
                <div className="bg-background/70 border border-border/40 rounded-md p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      AI Summary
                    </p>
                    <button
                      onClick={handleRunPipeline}
                      disabled={pipelineRunning}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      title="Re-analyze this event"
                    >
                      ↻ Refresh
                    </button>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {insight.summary}
                  </p>
                </div>

                {/* Ranked Articles */}
                {insight.articles.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Top Sources ({insight.articles.length})
                    </p>
                    <div className="space-y-2">
                      {insight.articles.map((a, i) => (
                        <div
                          key={i}
                          className="border border-border/40 rounded-md p-2.5 bg-background/50"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-foreground hover:text-primary transition-colors leading-snug flex items-start gap-1"
                              >
                                <span className="line-clamp-2">
                                  {a.title}
                                </span>
                                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
                              </a>
                              {a.snippet && (
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                                  {a.snippet}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground/70">
                                  {a.publisher}
                                  {a.article_date &&
                                    ` · ${fmtDate(a.article_date)}`}
                                </span>
                                {a.relevance_score != null && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    {Math.round(a.relevance_score * 100)}%
                                    match
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <Newspaper className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground text-center">
                  Could not find relevant articles for this event.
                  <br />
                  Try clicking a different event or regime band.
                </p>
                <button
                  onClick={handleRunPipeline}
                  disabled={pipelineRunning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-card border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Retry Analysis
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ambient AI Popover */}
      {ambientCtx && (
        <AmbientAIPopover
          context={ambientCtx.context}
          position={ambientCtx.position}
          onClose={() => setAmbientCtx(null)}
        />
      )}
    </div>
  );
}

/* ── Financial Table (improved) ──────────────────────────────────────────── */

function FinancialTable({ statement, ticker }: { statement: Statement | null; ticker: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ambientCtx, setAmbientCtx] = useState<{
    context: AmbientContext;
    position: { x: number; y: number };
  } | null>(null);

  if (!statement || !statement.rows.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No data. Alpha Vantage statement data has not been cached for this company yet.
      </div>
    );
  }

  const summaryMetrics = new Set([
    "Revenue",
    "GrossProfit",
    "OperatingIncome",
    "CurrentAssets",
    "NoncurrentAssets",
    "TotalAssets",
    "CurrentLiabilities",
    "NoncurrentLiabilities",
    "TotalLiabilities",
    "TotalEquity",
    "OperatingCashFlow",
    "InvestingCashFlow",
    "FinancingCashFlow",
    "EndingCashPosition",
    "FreeCashFlow",
  ]);

  const subtotalHeaderMetrics = new Set([
    "OperatingIncome",
    "EBITDA",
    "EBIT",
    "PreTaxIncome",
    "NetIncomeContinuingOperations",
    "NetIncome",
  ]);

  // Cost metrics — get a subtle tint
  const costMetrics = new Set([
    "CostOfRevenue",
    "OperatingExpenses",
    "TotalExpenses",
    "ResearchAndDevelopment",
    "SellingGeneralAdmin",
    "IncomeTaxExpense",
    "InterestExpense",
    "InterestExpenseNet",
    "CapitalExpenditures",
    "DividendsPaid",
    "ShareRepurchases",
    "ShortTermDebtRepayments",
    "PaymentsForOperatingActivities",
  ]);

  // Margin metrics (computed inline)
  const marginMetrics: Record<string, string> = {
    GrossProfit: "Gross Margin",
    OperatingIncome: "Operating Margin",
    EBITDA: "EBITDA Margin",
    EBIT: "EBIT Margin",
    NetIncome: "Net Margin",
  };

  const dividerBeforeMetrics = new Set([
    "EBITDA",
    "PreTaxIncome",
    "NetIncome",
    "InvestingCashFlow",
    "FinancingCashFlow",
    "EndingCashPosition",
    "FreeCashFlow",
    "TotalAssets",
    "CurrentLiabilities",
    "TotalEquity",
  ]);

  const balanceRollupMetrics = new Set([
    "CurrentAssets",
    "NoncurrentAssets",
    "TotalAssets",
    "CurrentLiabilities",
    "NoncurrentLiabilities",
    "TotalLiabilities",
    "TotalEquity",
  ]);

  const downwardChevronMetrics = new Set([
    "EBITDA",
    "EBIT",
    "PreTaxIncome",
  ]);

  const periods = statement.periods;

  const revenueRow = statement.rows.find((r) => r.metric === "Revenue");
  const groupedRows = buildStatementGroups(statement);

  function toggleExpand(metric: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  }

  function openStatementPopover(
    event: React.MouseEvent<HTMLElement>,
    row: StatementRow,
    type: AmbientContext["type"] = "metric",
  ) {
    const valuesStr = periods
      .map((p) => `${fmtPeriodHead(p)}: ${row.formatted[p] || "—"}`)
      .join(", ");

    setAmbientCtx({
      context: {
        type,
        ticker,
        description: `${ticker} ${row.label} across periods: ${valuesStr}`,
        data: {
          metric: row.metric,
          label: row.label,
          statement: statement?.statement,
          values: row.values,
          formatted: row.formatted,
          periods,
        },
      },
      position: { x: event.clientX, y: event.clientY },
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2.5 text-xs font-medium tracking-tight text-muted-foreground/80 sticky left-0 bg-card min-w-[200px] z-10">
              Metric
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className="text-right px-3 py-2.5 text-xs font-medium tracking-tight text-muted-foreground/80 min-w-[100px]"
              >
                {fmtPeriodHead(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedRows.map(({ summary: row, leadingDetails, trailingDetails }, index) => {
            const isCost = costMetrics.has(row.metric);
            const isSummary = summaryMetrics.has(row.metric);
            const isSubtotalHeader = subtotalHeaderMetrics.has(row.metric);
            const hasDetails = leadingDetails.length > 0 || trailingDetails.length > 0;
            const isExpanded = expanded.has(row.metric);
            const marginLabel = marginMetrics[row.metric];
            const hasDividerBefore = index > 0 && dividerBeforeMetrics.has(row.metric);
            const usesDownwardChevron = downwardChevronMetrics.has(row.metric);
            const isBalanceRollup = statement.statement === "balance" && balanceRollupMetrics.has(row.metric);

            const renderDetailRow = (detail: StatementRow, placement: "leading" | "trailing") => {
              const detIsCost = costMetrics.has(detail.metric);
              return (
                <tr
                  key={`${row.metric}_${placement}_${detail.metric}`}
                  onClick={(event) =>
                    openStatementPopover(event, detail, "statement_cell")
                  }
                  className="border-b border-border/20 bg-muted/5 cursor-pointer hover:bg-primary/5"
                >
                  <td className="px-3 py-1.5 sticky left-0 bg-muted/5 z-10 text-xs text-muted-foreground pl-9">
                    {detail.label}
                  </td>
                  {periods.map((p) => {
                    const val = detail.values[p];
                    const fmt = detail.formatted[p];
                    const isNeg = val !== undefined && val < 0;
                    return (
                      <td
                        key={p}
                        className={`text-right px-3 py-1.5 text-xs tabular-nums ${
                          isNeg
                            ? "text-red-500"
                            : detIsCost
                              ? "text-foreground/60"
                              : "text-foreground/80"
                        }`}
                      >
                        {fmt || "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            };

            return (
              <Fragment key={row.metric}>
                {hasDividerBefore && (
                  <tr aria-hidden="true" className="pointer-events-none">
                    <td
                      colSpan={periods.length + 1}
                      className="h-3 border-b border-border/40 bg-transparent px-0 py-0"
                    />
                  </tr>
                )}

                {isExpanded && leadingDetails.map((detail) => renderDetailRow(detail, "leading"))}

                {/* Summary row */}
                <tr
                  onClick={(event) =>
                    openStatementPopover(
                      event,
                      row,
                      summaryMetrics.has(row.metric) ? "metric" : "statement_cell",
                    )
                  }
                  className={`group border-b border-border/30 hover:bg-muted/10 ${
                    isSummary ? "bg-muted/5" : ""
                  }`}
                >
                  <td
                    className={`px-3 py-2 sticky left-0 z-10 text-sm ${
                      isBalanceRollup ? "border-t border-border/40 " : ""
                    }${
                      isSummary || isSubtotalHeader
                        ? "font-semibold text-foreground bg-muted/5"
                        : isCost
                          ? "text-foreground/80 bg-card"
                          : "text-muted-foreground bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {hasDetails && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpand(row.metric);
                          }}
                          className="p-0.5 hover:bg-muted/50 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className={`w-3 h-3 ${usesDownwardChevron ? "" : "rotate-180"}`} />
                          ) : (
                            <ChevronRight className={`w-3 h-3 ${usesDownwardChevron ? "rotate-90" : ""}`} />
                          )}
                        </button>
                      )}
                      {!hasDetails && <span className="w-4" />}
                      {row.label}
                      {isSummary && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatementPopover(e, row, "metric");
                          }}
                          className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-primary transition-all"
                          title={`Ask AI about ${row.label}`}
                        >
                          <Sparkles className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  {periods.map((p) => {
                    const val = row.values[p];
                    const fmt = row.formatted[p];
                    const isNeg = val !== undefined && val < 0;
                    return (
                      <td
                        key={p}
                        className={`text-right px-3 py-2 text-[13px] tabular-nums font-medium ${
                          isBalanceRollup ? "border-t border-border/40 " : ""
                        }${
                          isNeg
                            ? "text-red-500"
                            : isCost
                              ? "text-foreground/70"
                              : isSummary || isSubtotalHeader
                                ? "font-semibold"
                                : "text-foreground"
                        }`}
                      >
                        {fmt || "—"}
                      </td>
                    );
                  })}
                </tr>

                {/* Margin row (computed) */}
                {marginLabel && revenueRow && (
                  <tr
                    key={`${row.metric}_margin`}
                    className="border-b border-border/20 group cursor-pointer hover:bg-primary/5"
                    onClick={(e) => {
                      const marginValues = periods.reduce(
                        (acc, p) => {
                          const rev = revenueRow.values[p];
                          const val = row.values[p];
                          if (rev && val) acc[fmtPeriodHead(p)] = `${((val / rev) * 100).toFixed(1)}%`;
                          return acc;
                        },
                        {} as Record<string, string>,
                      );
                      setAmbientCtx({
                        context: {
                          type: "margin",
                          ticker,
                          description: `${ticker} ${marginLabel}: ${Object.entries(marginValues).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
                          data: {
                            margin_type: marginLabel,
                            metric: row.metric,
                            values: marginValues,
                            periods,
                          },
                        },
                        position: { x: e.clientX, y: e.clientY },
                      });
                    }}
                  >
                    <td className="px-3 py-1.5 sticky left-0 bg-card z-10 text-xs text-primary pl-9">
                      <span className="flex items-center gap-1">
                        {marginLabel}
                        <Sparkles className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </td>
                    {periods.map((p) => {
                      const rev = revenueRow.values[p];
                      const val = row.values[p];
                      if (!rev || !val)
                        return (
                          <td
                            key={p}
                            className="text-right px-3 py-1.5 text-xs text-muted-foreground"
                          >
                            —
                          </td>
                        );
                      const margin = (val / rev) * 100;
                      return (
                        <td
                          key={p}
                          className="text-right px-3 py-1.5 text-xs tabular-nums text-primary"
                        >
                          {margin.toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* Expanded detail rows */}
                {isExpanded && trailingDetails.map((detail) => renderDetailRow(detail, "trailing"))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {ambientCtx && (
        <AmbientAIPopover
          context={ambientCtx.context}
          position={ambientCtx.position}
          onClose={() => setAmbientCtx(null)}
        />
      )}
    </div>
  );
}

/* ── Working Capital Tab ─────────────────────────────────────────────────── */

function WorkingCapitalTab({
  ratios,
}: {
  ratios: Record<string, Record<string, RatioItem>> | null;
}) {
  if (!ratios?.working_capital) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No working capital data available.
      </p>
    );
  }

  const wc = ratios.working_capital;
  const items = Object.entries(wc).filter(
    ([, v]) => v.value !== null && v.value !== undefined,
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-muted-foreground border-b border-border/50 pb-4">
        Working capital efficiency — how fast cash cycles through the business.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map(([key, item]) => (
          <div key={key} className="py-2 border-b border-border/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{item.label}</p>
            <p className="text-2xl font-bold text-foreground">
              {item.formatted
                ? item.formatted
                : typeof item.value === "number"
                  ? item.value.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })
                  : "—"}
              {!item.formatted && item.label.includes("Days") ? " days" : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shareholders Tab ────────────────────────────────────────────────────── */

const SHAREHOLDER_BREAKDOWN_FALLBACKS = [
  {
    label: "Insider ownership",
    detail: "All insiders as a share of total shares outstanding",
    isPercent: true,
  },
  {
    label: "Institutional ownership",
    detail: "Institutions with a currently disclosed stake",
    isPercent: true,
  },
  {
    label: "Institutional float",
    detail: "Public float currently held by institutions",
    isPercent: true,
  },
  {
    label: "Reporting institutions",
    detail: "Funds and institutions captured in the latest filing set",
    isPercent: false,
  },
] as const;

type ShareholderMetricCard = {
  id: string;
  label: string;
  detail: string;
  valueText: string;
  barValue: number | null;
};

type InstitutionalHolderRow = {
  id: string;
  holder: string;
  shares: number | null;
  value: number | null;
  pctHeld: number | null;
  pctChange: number | null;
  reportedDate: string | null;
  reportedAt: number | null;
};

type InsiderTransactionRow = {
  id: string;
  insider: string;
  position: string;
  shares: number | null;
  value: number | null;
  note: string;
  ownership: string;
  transaction: string;
  startDate: string | null;
  reportedAt: number | null;
};

type ShareholdersResponse = {
  major_holders: Array<Record<string, unknown>>;
  institutional_holders: Array<Record<string, unknown>>;
  insider_holders: Array<Record<string, unknown>>;
};

function getShareholderField(
  entry: Record<string, unknown>,
  keys: string[],
  fallbackIndex = 0,
) {
  for (const key of keys) {
    const value = entry[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return Object.values(entry)[fallbackIndex];
}

function parseShareholderNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[,$%]/g, "").trim();
  if (!normalized || normalized.toLowerCase() === "nan") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatShareholderPercent(value: number | null, digits = 2) {
  if (value === null) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

function formatShareholderCompactNumber(value: number | null, currency = false) {
  if (value === null) return "—";

  const prefix = currency ? "$" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return currency ? `${prefix}${Math.round(value).toLocaleString()}` : Math.round(value).toLocaleString();
  if (currency) return `${prefix}${value.toFixed(value < 10 ? 2 : 0)}`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatShareholderDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, options);
}

function ShareholdersTab({ ticker }: { ticker: string }) {
  const [data, setData] = useState<ShareholdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeShareholderSection, setActiveShareholderSection] = useState<"institutions" | "insiders" | null>(null);
  const [institutionSort, setInstitutionSort] = useState<"stake" | "reported">("stake");
  const [showAllInstitutions, setShowAllInstitutions] = useState(false);
  const [expandedInstitutionId, setExpandedInstitutionId] = useState<string | null>(null);
  const [showAllInsiders, setShowAllInsiders] = useState(false);
  const [expandedInsiderId, setExpandedInsiderId] = useState<string | null>(null);
  const [shareholderAmbientCtx, setShareholderAmbientCtx] = useState<{
    context: AmbientContext;
    position: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API}/api/equities/v2/shareholders/${ticker}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setData)
      .catch((error: { name?: string }) => {
        if (error?.name !== "AbortError") {
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [ticker]);

  const breakdownMetrics = useMemo<ShareholderMetricCard[]>(() => {
    if (!data?.major_holders?.length) return [];

    return data.major_holders
      .map((entry: Record<string, unknown>, index: number): ShareholderMetricCard | null => {
        const fallback = SHAREHOLDER_BREAKDOWN_FALLBACKS[index];
        if (!fallback) return null;

        const rawValue = getShareholderField(entry, ["value", "0"], 0);
        const rawLabel = getShareholderField(entry, ["description", "1"], 1);
        const numericValue = parseShareholderNumber(rawValue);
        const label = String(rawLabel || fallback.label).trim() || fallback.label;

        return {
          id: `${label}-${index}`,
          label,
          detail: fallback.detail,
          valueText: fallback.isPercent
            ? formatShareholderPercent(numericValue)
            : formatShareholderCompactNumber(numericValue),
          barValue:
            fallback.isPercent && numericValue !== null
              ? Math.max(0, Math.min(100, (Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue)))
              : null,
        };
      })
      .filter((metric: ShareholderMetricCard | null): metric is ShareholderMetricCard => Boolean(metric));
  }, [data]);

  const institutionalBase = useMemo<InstitutionalHolderRow[]>(() => {
    if (!data?.institutional_holders?.length) return [];

    return data.institutional_holders
      .map((entry: Record<string, unknown>, index: number) => {
        const holder = String(getShareholderField(entry, ["Holder", "holder"], 0) || "Unnamed holder");
        const reportedDate = String(
          getShareholderField(entry, ["Date Reported", "dateReported", "reportedDate"], 0) || "",
        ).trim() || null;
        const reportedAt = reportedDate ? new Date(reportedDate).getTime() : NaN;

        return {
          id: `${holder}-${reportedDate || "undated"}-${index}`,
          holder,
          shares: parseShareholderNumber(getShareholderField(entry, ["Shares", "shares"], 1)),
          value: parseShareholderNumber(getShareholderField(entry, ["Value", "value"], 2)),
          pctHeld: parseShareholderNumber(getShareholderField(entry, ["pctHeld", "% Out"], 3)),
          pctChange: parseShareholderNumber(getShareholderField(entry, ["pctChange", "% Change"], 4)),
          reportedDate,
          reportedAt: Number.isFinite(reportedAt) ? reportedAt : null,
        };
      })
      .filter((entry: InstitutionalHolderRow) => entry.holder);
  }, [data]);

  const institutionalHolders = useMemo(() => {
    const rows = [...institutionalBase];
    rows.sort((left, right) => {
      if (institutionSort === "reported") {
        const dateDelta = (right.reportedAt ?? -Infinity) - (left.reportedAt ?? -Infinity);
        if (dateDelta !== 0) return dateDelta;
      }

      const pctDelta = (right.pctHeld ?? -Infinity) - (left.pctHeld ?? -Infinity);
      if (pctDelta !== 0) return pctDelta;

      const valueDelta = (right.value ?? -Infinity) - (left.value ?? -Infinity);
      if (valueDelta !== 0) return valueDelta;

      return left.holder.localeCompare(right.holder);
    });
    return rows;
  }, [institutionSort, institutionalBase]);

  const visibleInstitutions = useMemo(
    () => (showAllInstitutions ? institutionalHolders : institutionalHolders.slice(0, 8)),
    [institutionalHolders, showAllInstitutions],
  );

  const topInstitution = institutionalBase[0]
    ? [...institutionalBase].sort((left, right) => (right.pctHeld ?? -Infinity) - (left.pctHeld ?? -Infinity))[0]
    : null;

  const latestInstitutionDate = useMemo(() => {
    const latest = institutionalBase.reduce<number | null>((current, holder) => {
      if (holder.reportedAt === null) return current;
      if (current === null || holder.reportedAt > current) return holder.reportedAt;
      return current;
    }, null);

    return latest ? new Date(latest).toISOString() : null;
  }, [institutionalBase]);

  const trackedInstitutionalOwnership = useMemo(
    () => institutionalBase.reduce((sum, holder) => sum + (holder.pctHeld ?? 0), 0),
    [institutionalBase],
  );

  const insiderTransactions = useMemo<InsiderTransactionRow[]>(() => {
    if (!data?.insider_holders?.length) return [];

    return data.insider_holders
      .map((entry: Record<string, unknown>, index: number) => {
        const insider = String(getShareholderField(entry, ["Insider", "insider"], 0) || "Unnamed insider");
        const startDate = String(
          getShareholderField(entry, ["Start Date", "startDate", "date"], 0) || "",
        ).trim() || null;
        const reportedAt = startDate ? new Date(startDate).getTime() : NaN;

        return {
          id: `${insider}-${startDate || "undated"}-${index}`,
          insider,
          position: String(getShareholderField(entry, ["Position", "position"], 4) || "").trim(),
          shares: parseShareholderNumber(getShareholderField(entry, ["Shares", "shares"], 1)),
          value: parseShareholderNumber(getShareholderField(entry, ["Value", "value"], 6)),
          note: String(getShareholderField(entry, ["Text", "text"], 2) || "").trim(),
          ownership: String(getShareholderField(entry, ["Ownership", "ownership"], 5) || "").trim(),
          transaction: String(getShareholderField(entry, ["Transaction", "transaction"], 3) || "").trim(),
          startDate,
          reportedAt: Number.isFinite(reportedAt) ? reportedAt : null,
        };
      })
      .sort((left: InsiderTransactionRow, right: InsiderTransactionRow) => {
        const dateDelta = (right.reportedAt ?? -Infinity) - (left.reportedAt ?? -Infinity);
        if (dateDelta !== 0) return dateDelta;
        return (right.value ?? right.shares ?? -Infinity) - (left.value ?? left.shares ?? -Infinity);
      });
  }, [data]);

  const visibleInsiders = useMemo(
    () => (showAllInsiders ? insiderTransactions : insiderTransactions.slice(0, 8)),
    [insiderTransactions, showAllInsiders],
  );

  const latestInsiderDate = insiderTransactions[0]?.startDate ?? null;
  const hasShareholderData =
    breakdownMetrics.length > 0 || institutionalBase.length > 0 || insiderTransactions.length > 0;

  const institutionSectionContext: AmbientContext = {
    type: "metric",
    ticker,
    description: `${ticker} institutional holders snapshot`,
    data: {
      tracked_holders: institutionalBase.length,
      latest_report: formatShareholderDate(latestInstitutionDate, { month: "short", year: "numeric" }),
      tracked_ownership: formatShareholderPercent(trackedInstitutionalOwnership),
      top_holder: topInstitution?.holder ?? "—",
      top_stake: topInstitution ? formatShareholderPercent(topInstitution.pctHeld) : "—",
      sort_view: institutionSort === "stake" ? "largest first" : "latest reported",
    },
  };

  const insiderSectionContext: AmbientContext = {
    type: "metric",
    ticker,
    description: `${ticker} newest insider disclosures`,
    data: {
      latest_filing: formatShareholderDate(latestInsiderDate),
      recent_filings: insiderTransactions.length,
      lead_disclosure: insiderTransactions[0]?.insider ?? "—",
      lead_disclosure_shares: formatShareholderCompactNumber(insiderTransactions[0]?.shares ?? null),
    },
  };

  function openShareholderPopover(
    event: React.MouseEvent<HTMLElement>,
    context: AmbientContext,
  ) {
    event.stopPropagation();
    setShareholderAmbientCtx({
      context,
      position: { x: event.clientX, y: event.clientY },
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !hasShareholderData) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No shareholder data available for {ticker}.
      </p>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {breakdownMetrics.length > 0 && (
        <section className="rounded-[28px] border border-border/60 bg-background/95 p-5 shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Shareholding Pattern
              </p>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                  Ownership breakdown
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  High-level ownership mix stays visible here. The holder and insider detail lists stay tucked behind compact buttons until someone wants to open them.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Latest Report
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatShareholderDate(latestInstitutionDate, { month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Largest Stake
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {topInstitution ? formatShareholderPercent(topInstitution.pctHeld) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Tracked Holders
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {institutionalBase.length
                    ? `${institutionalBase.length} holders • ${formatShareholderPercent(trackedInstitutionalOwnership)}`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {breakdownMetrics.map((metric) => (
              <button
                type="button"
                key={metric.id}
                onClick={(event) =>
                  openShareholderPopover(event, {
                    type: "metric",
                    ticker,
                    description: `${metric.label} — ${metric.valueText}`,
                    data: {
                      label: metric.label,
                      detail: metric.detail,
                      value: metric.valueText,
                    },
                  })
                }
                className="rounded-[24px] border border-border/60 bg-card/80 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{metric.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      <Sparkles className="h-3 w-3" />
                      AI
                    </div>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                      {metric.valueText}
                    </p>
                  </div>
                </div>
                {metric.barValue !== null && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                      <div
                        className="h-full rounded-full bg-primary/75"
                        style={{ width: `${metric.barValue}%` }}
                      />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-border/50 pt-4">
            <div className="flex flex-wrap gap-3">
              {institutionalHolders.length > 0 && (
                <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveShareholderSection((current) =>
                        current === "institutions" ? null : "institutions",
                      )
                    }
                    className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
                        Most Relevant Holders
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {institutionalBase.length} tracked • Latest {formatShareholderDate(latestInstitutionDate, { month: "short", year: "numeric" })}
                      </p>
                    </div>
                    {activeShareholderSection === "institutions" ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => openShareholderPopover(event, institutionSectionContext)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-primary transition hover:bg-primary/5"
                    aria-label="Ask AI about institutional holders"
                    title="Ask AI"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {insiderTransactions.length > 0 && (
                <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveShareholderSection((current) =>
                        current === "insiders" ? null : "insiders",
                      )
                    }
                    className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
                        Newest Insider Disclosures
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {insiderTransactions.length} filings • Latest {formatShareholderDate(latestInsiderDate, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    {activeShareholderSection === "insiders" ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => openShareholderPopover(event, insiderSectionContext)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-primary transition hover:bg-primary/5"
                    aria-label="Ask AI about insider disclosures"
                    title="Ask AI"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {institutionalHolders.length > 0 && activeShareholderSection === "institutions" && (
        <section className="overflow-hidden rounded-[28px] border border-border/60 bg-background/95 shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Most Relevant Holders
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Ranked institutional holders
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Defaulted to largest disclosed stakes, with filing dates surfaced inline and more detail one click away.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(event) => openShareholderPopover(event, institutionSectionContext)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => setActiveShareholderSection(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/30"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Minimize
              </button>
              <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/25 p-1">
                <button
                  type="button"
                  onClick={() => setInstitutionSort("stake")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    institutionSort === "stake"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Largest first
                </button>
                <button
                  type="button"
                  onClick={() => setInstitutionSort("reported")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    institutionSort === "reported"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Latest reported
                </button>
              </div>

              {institutionalHolders.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllInstitutions((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/30"
                >
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  {showAllInstitutions ? "Show top 8" : `Expand all ${institutionalHolders.length}`}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border/50">
            {visibleInstitutions.map((holder, index) => {
              const isExpanded = expandedInstitutionId === holder.id;
              const changeTone =
                holder.pctChange === null
                  ? "text-muted-foreground"
                  : holder.pctChange >= 0
                    ? "text-emerald-600"
                    : "text-rose-600";

              return (
                <div key={holder.id} className="bg-background/70">
                  <button
                    type="button"
                    onClick={() => setExpandedInstitutionId((current) => (current === holder.id ? null : holder.id))}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-col gap-4 px-5 py-4 text-left transition hover:bg-muted/20 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {holder.holder}
                          </p>
                          <span className="rounded-full border border-border/60 bg-muted/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {formatShareholderDate(holder.reportedDate, { month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatShareholderCompactNumber(holder.shares)} shares • {formatShareholderCompactNumber(holder.value, true)} market value
                        </p>
                      </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-4">
                      <div className="text-right">
                        <p className="text-base font-semibold tabular-nums text-foreground">
                          {formatShareholderPercent(holder.pctHeld)}
                        </p>
                        <p className={`text-xs tabular-nums ${changeTone}`}>
                          {holder.pctChange === null
                            ? "Change unavailable"
                            : `${holder.pctChange >= 0 ? "+" : ""}${formatShareholderPercent(holder.pctChange)}`}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 sm:px-6">
                      <div className="grid gap-3 rounded-[22px] border border-border/60 bg-muted/15 p-4 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Reported On
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {formatShareholderDate(holder.reportedDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Shares Held
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">
                            {formatShareholderCompactNumber(holder.shares)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Market Value
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">
                            {formatShareholderCompactNumber(holder.value, true)}
                          </p>
                        </div>
                      </div>

                      {holder.pctHeld !== null && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            <span>Ownership intensity</span>
                            <span>{formatShareholderPercent(holder.pctHeld)}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/70">
                            <div
                              className="h-full rounded-full bg-primary/75"
                              style={{ width: `${Math.max(0, Math.min(100, holder.pctHeld <= 1 ? holder.pctHeld * 100 : holder.pctHeld))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={(event) =>
                            openShareholderPopover(event, {
                              type: "metric",
                              ticker,
                              description: `${holder.holder} institutional position`,
                              data: {
                                holder: holder.holder,
                                reported_on: formatShareholderDate(holder.reportedDate),
                                shares: formatShareholderCompactNumber(holder.shares),
                                market_value: formatShareholderCompactNumber(holder.value, true),
                                pct_out: formatShareholderPercent(holder.pctHeld),
                                pct_change:
                                  holder.pctChange === null
                                    ? "Change unavailable"
                                    : `${holder.pctChange >= 0 ? "+" : ""}${formatShareholderPercent(holder.pctChange)}`,
                              },
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Ask AI about holder
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {insiderTransactions.length > 0 && activeShareholderSection === "insiders" && (
        <section className="overflow-hidden rounded-[28px] border border-border/60 bg-background/95 shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Recent Insider Activity
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Newest insider disclosures first
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Date-led list with quick context up front and expandable filing notes when the transaction needs more explanation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(event) => openShareholderPopover(event, insiderSectionContext)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => setActiveShareholderSection(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/30"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Minimize
              </button>
              <div className="rounded-full border border-border/70 bg-muted/20 px-3 py-1.5 text-xs font-medium text-foreground">
                Latest filing {formatShareholderDate(latestInsiderDate, { month: "short", day: "numeric", year: "numeric" })}
              </div>
              {insiderTransactions.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllInsiders((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/30"
                >
                  {showAllInsiders ? "Show latest 8" : `Expand all ${insiderTransactions.length}`}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border/50">
            {visibleInsiders.map((transaction) => {
              const isExpanded = expandedInsiderId === transaction.id;
              const summaryText = transaction.transaction || transaction.note || "Disclosure filed";

              return (
                <div key={transaction.id} className="bg-background/70">
                  <button
                    type="button"
                    onClick={() => setExpandedInsiderId((current) => (current === transaction.id ? null : transaction.id))}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-col gap-4 px-5 py-4 text-left transition hover:bg-muted/20 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {transaction.insider}
                        </p>
                        {transaction.position && (
                          <span className="rounded-full border border-border/60 bg-muted/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {transaction.position}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summaryText}
                      </p>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {formatShareholderCompactNumber(transaction.shares)} shares
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatShareholderDate(transaction.startDate)}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 sm:px-6">
                      <div className="grid gap-3 rounded-[22px] border border-border/60 bg-muted/15 p-4 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Filed On
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {formatShareholderDate(transaction.startDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Shares
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">
                            {formatShareholderCompactNumber(transaction.shares)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Estimated Value
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">
                            {formatShareholderCompactNumber(transaction.value, true)}
                          </p>
                        </div>
                      </div>

                      {(transaction.note || transaction.ownership) && (
                        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                          {transaction.note && <p>{transaction.note}</p>}
                          {transaction.ownership && (
                            <p>
                              Ownership flag: <span className="font-medium text-foreground">{transaction.ownership}</span>
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={(event) =>
                            openShareholderPopover(event, {
                              type: "metric",
                              ticker,
                              description: `${transaction.insider} insider disclosure`,
                              data: {
                                insider: transaction.insider,
                                position: transaction.position || "—",
                                filed_on: formatShareholderDate(transaction.startDate),
                                shares: formatShareholderCompactNumber(transaction.shares),
                                estimated_value: formatShareholderCompactNumber(transaction.value, true),
                                note: transaction.note || transaction.transaction || "Disclosure filed",
                                ownership_flag: transaction.ownership || "—",
                              },
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Ask AI about disclosure
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {shareholderAmbientCtx && (
        <AmbientAIPopover
          context={shareholderAmbientCtx.context}
          position={shareholderAmbientCtx.position}
          onClose={() => setShareholderAmbientCtx(null)}
        />
      )}
    </div>
  );
}

/* ── Documents Tab ───────────────────────────────────────────────────────── */

function DocumentsTab({ ticker }: { ticker: string }) {
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDocTab, setActiveDocTab] = useState("annual_reports");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API}/api/equities/v2/documents/${ticker}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [ticker]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No SEC filings found for {ticker}.
      </p>
    );
  }

  const tabs = [
    {
      key: "annual_reports",
      label: "Annual Reports (10-K)",
      count: data.annual_reports?.length || 0,
    },
    {
      key: "quarterly_reports",
      label: "Quarterly (10-Q)",
      count: data.quarterly_reports?.length || 0,
    },
    {
      key: "announcements",
      label: "Announcements (8-K)",
      count: data.announcements?.length || 0,
    },
    { key: "other", label: "Other", count: data.other?.length || 0 },
  ];

  const filings = data[activeDocTab as keyof DocumentsResponse] as DocumentFiling[] || [];
  const visibleTabs = tabs.filter((tab) => tab.count > 0);
  const allFilings = visibleTabs.flatMap((tab) => (data[tab.key as keyof DocumentsResponse] as DocumentFiling[]) || []);
  const latestFiling = [...allFilings].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())[0] ?? null;
  const activeTabMeta = tabs.find((tab) => tab.key === activeDocTab) ?? tabs[0];
  const docSectionCopy: Record<string, string> = {
    annual_reports: "Long-form annual filings with audited financials, management commentary, and the cleanest year-end reference point.",
    quarterly_reports: "Quarterly filings for cadence checks, intra-year trend shifts, and management discussion between annual reports.",
    announcements: "Event-driven 8-K filings for launches, leadership updates, capital decisions, and other material disclosures.",
    other: "Proxy statements and miscellaneous filings that still matter when you want a fuller paper trail.",
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <section className="rounded-[28px] border border-border/60 bg-background/95 p-5 shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              SEC Filing Library
            </p>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                Cleaner access to the paper trail
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with the latest filing, then pivot by filing type without losing sight of timing or coverage.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Total Filings
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {data.total}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active Bucket
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {activeTabMeta.count} filings
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Latest Filing
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {latestFiling ? fmtLongDate(latestFiling.date) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveDocTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                activeDocTab === tab.key
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 bg-card/70 text-muted-foreground hover:bg-muted/25 hover:text-foreground"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
          <div className="space-y-3">
            {filings.map((filing, index) => (
              <a
                key={`${filing.url}-${filing.date}-${index}`}
                href={filing.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block rounded-[24px] border transition-all ${
                  index === 0
                    ? "border-primary/25 bg-primary/[0.04] p-5 hover:border-primary/40 hover:bg-primary/[0.06]"
                    : "border-border/60 bg-card/75 p-4 hover:border-border hover:bg-muted/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                    index === 0
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-border/60 bg-background/80 text-muted-foreground"
                  }`}>
                    <FileText className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {filing.type}
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Filed {fmtLongDate(filing.date)}
                      </span>
                    </div>

                    <h4 className="mt-3 text-base font-semibold tracking-tight text-foreground">
                      {filing.description || `${filing.type} filing`}
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {index === 0
                        ? "Latest filing in the current bucket, ready to open directly on the SEC site."
                        : "Open the filing directly on the SEC site for the full submission and exhibits."}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-full border border-border/60 bg-background/80 p-2 text-muted-foreground transition group-hover:border-primary/30 group-hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{activeTabMeta.label}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    Open filing
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </a>
            ))}
          </div>

          <aside className="rounded-[24px] border border-border/60 bg-card/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Active Bucket
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {activeTabMeta.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {docSectionCopy[activeDocTab]}
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  In This Bucket
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeTabMeta.count} filings
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Latest In Bucket
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {filings[0] ? fmtLongDate(filings[0].date) : "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Coverage Mix
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {visibleTabs.length} active filing buckets
                </p>
              </div>
            </div>

            {latestFiling && (
              <a
                href={latestFiling.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex w-full items-center justify-between rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/[0.08]"
              >
                <span>Open latest filing</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

const FINANCIAL_STATEMENT_SECTIONS = [
  {
    id: "income-statement",
    navLabel: "Income Statement",
    statementKey: "income",
    title: "Income Statement",
    description: "Revenue, margins, and profitability across reporting periods.",
    icon: DollarSign,
  },
  {
    id: "balance-sheet",
    navLabel: "Balance Sheet",
    statementKey: "balance",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity stacked in one scrollable table.",
    icon: BarChart3,
  },
  {
    id: "cash-flow",
    navLabel: "Cash Flow",
    statementKey: "cashflow",
    title: "Cash Flow",
    description: "Operating, investing, and financing cash movement over time.",
    icon: ArrowDownUp,
  },
] as const;

/* ━━ Financial Section Block ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FinancialStatementSectionBlock({
  statement,
  ticker,
  title,
  description,
  Icon,
  periodType,
  setPeriodType,
}: {
  statement: Statement | null;
  ticker: string;
  title: string;
  description: string;
  Icon: typeof DollarSign;
  periodType: string;
  setPeriodType: (p: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)]">
      <div className="flex flex-col gap-4 border-b border-border/50 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Financial Statements
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/20 p-1">
          <button
            onClick={() => setPeriodType("annual")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              periodType === "annual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
          </button>
          <button
            onClick={() => setPeriodType("quarterly")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              periodType === "quarterly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Quarterly
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <FinancialTable statement={statement} ticker={ticker} />
      </div>
    </div>
  );
}

/* ━━ Main Page ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Chart" },
  ...FINANCIAL_STATEMENT_SECTIONS.map(({ id, navLabel }) => ({ id, label: navLabel })),
  { id: "shareholders", label: "Shareholders" },
  { id: "documents", label: "Documents" },
] as const;

const PINNED_HEADER_RATIO_IDS = [
  "overview.market_cap",
  "overview.current_price",
  "overview.high_low_52w",
  "valuation.pe_ratio",
  "overview.book_value",
  "cashflow.dividend_yield",
  "profitability.roce",
  "profitability.roe",
  "overview.eps",
] as const;

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string)?.toUpperCase() || "";
  const stickyChromeRef = useRef<HTMLDivElement>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [overviewMeta, setOverviewMeta] = useState<OverviewMeta | null>(null);
  const [ratios, setRatios] = useState<Record<
    string,
    Record<string, RatioItem>
  > | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [statements, setStatements] = useState<Record<string, Statement>>({});
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingEdgar, setFetchingEdgar] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);
  const [period, setPeriod] = useState("1Y");
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [activePriceTab, setActivePriceTab] = useState<"price" | "signals">(
    "price",
  );
  const [descExpanded, setDescExpanded] = useState(false);
  const [selectedInsight, setSelectedInsight] =
    useState<InsightSelection | null>(null);
  const [periodType, setPeriodType] = useState<string>("annual");
  const [customRatioQuery, setCustomRatioQuery] = useState("");
  const [headerMetricIds, setHeaderMetricIds] = useState<string[]>(() => [...PINNED_HEADER_RATIO_IDS]);
  const [isEditingHeaderMetrics, setIsEditingHeaderMetrics] = useState(false);
  const [stickyChromeHeight, setStickyChromeHeight] = useState(112);
  const [ratioAmbientCtx, setRatioAmbientCtx] = useState<{
    context: AmbientContext;
    position: { x: number; y: number };
  } | null>(null);
  const customRatioInputRef = useRef<HTMLInputElement>(null);

  // Smooth scroll to section
  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) {
      const offset = stickyChromeHeight + 16;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }

  // Track the active section from scroll position so the sticky nav
  // stays accurate even when the overview block is short.
  useEffect(() => {
    function updateActiveSection() {
      const scrollPosition = window.scrollY + stickyChromeHeight + 24;
      let nextActive: string = SECTIONS[0].id;

      for (const { id } of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollPosition) {
          nextActive = id;
        }
      }

      setActiveSection(nextActive);
    }

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [loading, stickyChromeHeight]);

  const analysisYears = useMemo(() => {
    if (period === "10Y") return 10;
    if (period === "5Y") return 5;
    if (period === "3Y") return 3;
    return 1;
  }, [period]);

  // Load company + ratios + prices + statements on mount
  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/equities/v2/companies/${ticker}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API}/api/equities/v2/ratios/${ticker}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API}/api/equities/v2/prices/${ticker}?period=${PRICE_HISTORY_FETCH_PERIOD}`).then(
        (r) => (r.ok ? r.json() : null),
      ),
      fetch(
        `${API}/api/equities/v2/financials/${ticker}/all?period_type=${periodType}`,
      ).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([companyData, ratiosData, pricesData, statementsData]) => {
        if (companyData) {
          setCompany(companyData);
          if (companyData.overview_meta) setOverviewMeta(companyData.overview_meta);
        }
        if (ratiosData?.ratios) setRatios(ratiosData.ratios);
        if (pricesData?.data)
          setPriceHistory(
            pricesData.data.map((d: any) => mapHistoricalPricePoint(d)),
          );
        if (statementsData) setStatements(statementsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  // Reload statements when period type changes
  useEffect(() => {
    if (!ticker || loading) return;
    fetch(
      `${API}/api/equities/v2/financials/${ticker}/all?period_type=${periodType}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatements(d));
  }, [periodType]);

  // Load trend analysis on the same horizon as the displayed stock-price period.
  useEffect(() => {
    if (!ticker || activePriceTab !== "signals") return;
    setAnalysis(null);
    setSelectedInsight(null);

    fetch(`${API}/api/equities/v2/analysis/${ticker}?years=${analysisYears}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) {
          setAnalysis(d);
        }
      });
  }, [activePriceTab, analysisYears, ticker]);

  // Fetch EDGAR data
  async function handleFetchEdgar() {
    setFetchingEdgar(true);
    try {
      await fetch(`${API}/api/equities/v2/fetch-financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      // Reload all data
      const [ratiosData, statementsData] = await Promise.all([
        fetch(`${API}/api/equities/v2/ratios/${ticker}`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(
          `${API}/api/equities/v2/financials/${ticker}/all?period_type=${periodType}`,
        ).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (ratiosData?.ratios) setRatios(ratiosData.ratios);
      if (statementsData) setStatements(statementsData);
    } finally {
      setFetchingEdgar(false);
    }
  }

  // Fetch price data
  async function handleFetchPrices() {
    setFetchingPrices(true);
    try {
      await fetch(`${API}/api/equities/v2/fetch-prices/${ticker}?outputsize=full`, {
        method: "POST",
      });
      const [pricesData, ratiosData] = await Promise.all([
        fetch(`${API}/api/equities/v2/prices/${ticker}?period=${PRICE_HISTORY_FETCH_PERIOD}`).then(
          (r) => (r.ok ? r.json() : null),
        ),
        fetch(`${API}/api/equities/v2/ratios/${ticker}`).then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);
      if (pricesData?.data) {
        setPriceHistory(
          pricesData.data.map((d: any) => mapHistoricalPricePoint(d)),
        );
      }
      if (ratiosData?.ratios) setRatios(ratiosData.ratios);
      // Reset analysis so it reloads with new data
      setAnalysis(null);
      setSelectedInsight(null);
    } finally {
      setFetchingPrices(false);
    }
  }

  const displayedPrices = useMemo(
    () => slicePricesForPeriod(priceHistory, period),
    [period, priceHistory],
  );

  // Run the full pipeline for all detected events
  async function handleAnalyzeAll() {
    setFetchingNews(true);
    try {
      await fetch(`${API}/api/equities/v2/process-all-events/${ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: false }),
      });
    } finally {
      setFetchingNews(false);
    }
  }

  // Price stats
  const priceStats = useMemo(() => {
    return buildPriceStats(displayedPrices);
  }, [displayedPrices]);

  const currentPrice =
    priceHistory[priceHistory.length - 1]?.rawPrice ?? priceHistory[priceHistory.length - 1]?.price ?? priceStats?.current ?? ratios?.overview?.current_price?.value;

  useEffect(() => {
    function updateStickyChromeHeight() {
      const nextHeight = stickyChromeRef.current?.getBoundingClientRect().height;
      if (nextHeight) {
        setStickyChromeHeight(Math.ceil(nextHeight));
      }
    }

    updateStickyChromeHeight();
    window.addEventListener("resize", updateStickyChromeHeight);
    return () => window.removeEventListener("resize", updateStickyChromeHeight);
  }, [company?.name, currentPrice, overviewMeta?.exchange, overviewMeta?.official_site, priceStats?.changePct]);

  const ratioOptions = useMemo(() => {
    if (!ratios) return [] as HeaderRatioOption[];

    return Object.entries(ratios)
      .flatMap(([category, items]) =>
        Object.entries(items)
          .filter(([, item]) => item.value !== null && item.value !== undefined)
          .map(([key, item]) => ({
            id: `${category}.${key}`,
            item,
          })),
      )
      .filter((option) => !PINNED_HEADER_RATIO_IDS.includes(option.id as (typeof PINNED_HEADER_RATIO_IDS)[number]))
      .sort((left, right) => left.item.label.localeCompare(right.item.label));
  }, [ratios]);

  const sectionScrollStyle = useMemo(
    () => ({ scrollMarginTop: `${stickyChromeHeight + 16}px` }),
    [stickyChromeHeight],
  );

  const displayStatements = useMemo(() => {
    const incomeStatement = statements.income ?? null;
    const balanceStatement = statements.balance ?? null;
    const cashflowStatement = buildAugmentedCashflowStatement(
      statements.cashflow ?? null,
      balanceStatement,
    );

    return {
      ...statements,
      income: incomeStatement ?? undefined,
      balance: balanceStatement ?? undefined,
      cashflow: cashflowStatement ?? statements.cashflow,
    };
  }, [statements]);

  function openRatioPopover(item: RatioItem, key: string, e: React.MouseEvent) {
    setRatioAmbientCtx({
      context: {
        type: "metric",
        ticker,
        description: `${ticker} — ${item.label}: ${fmtRatioDisplay(item)}`,
        data: { metric: key, label: item.label, value: item.value, formatted: item.formatted },
      },
      position: { x: e.clientX, y: e.clientY },
    });
  }

  function addCustomRatio(rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) {
      customRatioInputRef.current?.focus();
      return;
    }

    const match =
      ratioOptions.find((option) => option.item.label.toLowerCase() === query) ??
      ratioOptions.find((option) => option.item.label.toLowerCase().includes(query));

    if (!match) {
      customRatioInputRef.current?.focus();
      return;
    }

    setHeaderMetricIds((prev) => {
      if (prev.includes(match.id)) return prev;
      return [...prev, match.id];
    });
    setCustomRatioQuery("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-muted-foreground">Company not found: {ticker}</p>
      </div>
    );
  }

  // Helper to format AV OVERVIEW numeric strings
  function fmtAV(val: string | undefined, isPercent = false, isCurrency = false, isBillions = false) {
    if (!val || val === "None" || val === "-" || val === "") return "—";
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    if (isBillions) {
      if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
      return `$${n.toFixed(2)}`;
    }
    if (isCurrency) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (isPercent) return `${(n * 100).toFixed(2)}%`;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  const marketCapValue =
    fmtAV(overviewMeta?.market_cap, false, false, true) ||
    ratios?.overview?.market_cap?.formatted || "—";
  const currentPriceValue = currentPrice != null ? fmtPrice(currentPrice) : "—";
  const highLowValue = overviewMeta?.high_52w && overviewMeta?.low_52w
    ? `${fmtAV(overviewMeta.high_52w, false, true)} / ${fmtAV(overviewMeta.low_52w, false, true)}`
    : ratios?.overview?.high_low_52w?.formatted || "—";
  const stockPeValue = overviewMeta?.pe_ratio && overviewMeta.pe_ratio !== "None"
    ? parseFloat(overviewMeta.pe_ratio).toFixed(1)
    : ratios?.valuation?.pe_ratio?.formatted || "—";
  const bookValueValue = overviewMeta?.book_value && overviewMeta.book_value !== "None"
    ? fmtAV(overviewMeta.book_value, false, true)
    : ratios?.overview?.book_value?.formatted || "—";
  const dividendYieldValue = overviewMeta?.dividend_yield && overviewMeta.dividend_yield !== "None"
    ? `${(parseFloat(overviewMeta.dividend_yield) * 100).toFixed(2)}%`
    : ratios?.cashflow?.dividend_yield?.formatted || "—";
  const roceValue = ratios?.profitability?.roce?.formatted ||
    (typeof ratios?.profitability?.roce?.value === "number"
      ? `${ratios.profitability.roce.value.toFixed(2)}%`
      : "—");
  const roeValue = overviewMeta?.roe && overviewMeta.roe !== "None"
    ? `${(parseFloat(overviewMeta.roe) * 100).toFixed(2)}%`
    : ratios?.profitability?.roe?.formatted || "—";
  const epsValue = overviewMeta?.eps && overviewMeta.eps !== "None"
    ? `EPS: ${fmtAV(overviewMeta.eps, false, true)}`
    : ratios?.overview?.eps?.formatted || "—";

  const baseHeaderMetrics = [
    buildOverviewMetric("overview.market_cap", "Market Cap", marketCapValue, ratios?.overview?.market_cap),
    buildOverviewMetric("overview.current_price", "Current Price", currentPriceValue, ratios?.overview?.current_price, currentPrice ?? null),
    buildOverviewMetric("overview.high_low_52w", "High / Low", highLowValue, ratios?.overview?.high_low_52w),
    buildOverviewMetric(
      "valuation.pe_ratio",
      "Stock P/E",
      stockPeValue,
      ratios?.valuation?.pe_ratio,
      overviewMeta?.pe_ratio && overviewMeta.pe_ratio !== "None" ? parseFloat(overviewMeta.pe_ratio) : null,
    ),
    buildOverviewMetric(
      "overview.book_value",
      "Book Value",
      bookValueValue,
      ratios?.overview?.book_value,
      overviewMeta?.book_value && overviewMeta.book_value !== "None" ? parseFloat(overviewMeta.book_value) : null,
    ),
    buildOverviewMetric(
      "cashflow.dividend_yield",
      "Dividend Yield",
      dividendYieldValue,
      ratios?.cashflow?.dividend_yield,
      overviewMeta?.dividend_yield && overviewMeta.dividend_yield !== "None"
        ? parseFloat(overviewMeta.dividend_yield) * 100
        : null,
    ),
    buildOverviewMetric("profitability.roce", "ROCE", roceValue, ratios?.profitability?.roce),
    buildOverviewMetric(
      "profitability.roe",
      "ROE",
      roeValue,
      ratios?.profitability?.roe,
      overviewMeta?.roe && overviewMeta.roe !== "None" ? parseFloat(overviewMeta.roe) * 100 : null,
    ),
    buildOverviewMetric(
      "overview.eps",
      "Face Value",
      epsValue,
      ratios?.overview?.eps,
      overviewMeta?.eps && overviewMeta.eps !== "None" ? parseFloat(overviewMeta.eps) : null,
    ),
  ] satisfies HeaderMetricTile[];

  const customMetricTiles = ratioOptions.map((option) => ({
    key: option.id,
    label: option.item.label,
    value: fmtRatioDisplay(option.item),
    item: option.item,
  } satisfies HeaderMetricTile));

  const headerMetricOptionMap = new Map(
    [...baseHeaderMetrics, ...customMetricTiles].map((metric) => [metric.key, metric]),
  );

  const headerMetrics = headerMetricIds
    .map((id) => headerMetricOptionMap.get(id))
    .filter((metric): metric is HeaderMetricTile => Boolean(metric));

  return (
    <div className="mx-auto w-full max-w-[1380px]">
      {/* Back */}
      <div className="px-4 pt-6 pb-4 sm:px-6">
        <button
          onClick={() => router.push("/dashboard/equities")}
          className="text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Search
        </button>
      </div>

      {/* ── Sticky Stock Header + Section Nav ─────────────────────────── */}
      <div
        ref={stickyChromeRef}
        className="sticky top-0 z-50 border-y border-border/50 bg-background/95 backdrop-blur-sm"
      >
        <div className="px-4 py-3 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="truncate text-[clamp(1.55rem,3vw,2.15rem)] font-semibold tracking-tight text-foreground leading-none">
                  {company.name}
                </p>
                {currentPrice != null && (
                  <span className="text-[14px] font-semibold text-foreground tabular-nums sm:text-[15px]">
                    {fmtPrice(currentPrice)}
                  </span>
                )}
                {priceStats && (
                  <span className={`text-[12px] font-medium ${priceStats.isUp ? "text-emerald-600" : "text-red-500"}`}>
                    {priceStats.isUp ? "▲" : "▼"} {Math.abs(priceStats.changePct).toFixed(2)}% · {period}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex flex-wrap items-center gap-4 text-[13px]">
                {overviewMeta?.official_site && (
                  <a
                    href={overviewMeta.official_site.startsWith("http") ? overviewMeta.official_site : `https://${overviewMeta.official_site}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {overviewMeta.official_site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
                {overviewMeta?.exchange && (
                  <span className="text-muted-foreground">
                    <span className="border border-border/60 rounded px-1.5 py-0.5 bg-muted/20 text-foreground mr-1.5">{overviewMeta.exchange}</span>: {ticker}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0 lg:justify-self-end">
              <EquityTickerSearch
                className="w-full lg:w-[320px]"
                label="Jump To Another Stock"
                placeholder="Search another stock..."
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/40">
          <div className="flex overflow-x-auto px-4 sm:px-6 scrollbar-hide">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className={`px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                  activeSection === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overview Header ───────────────────────────────────────────── */}
      <section id="overview" style={sectionScrollStyle} className="px-4 pb-6 pt-5 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start">

          {/* Left: Metrics Grid Box */}
          <div className="min-w-0 bg-card border border-border/40 rounded-xl p-5 shadow-sm sm:p-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 2xl:grid-cols-3 mb-8">
              {headerMetrics.map((m, index) => (
                <div
                  key={m.key}
                  onClick={(e) => {
                    if (!isEditingHeaderMetrics) {
                      openRatioPopover(m.item, m.key, e);
                    }
                  }}
                  className={`relative flex w-full items-center justify-between gap-4 rounded-md bg-muted/30 px-3 py-2 text-left transition-colors ${
                    isEditingHeaderMetrics
                      ? "min-h-[72px] pt-7"
                      : "cursor-pointer hover:bg-primary/5"
                  }`}
                >
                  {isEditingHeaderMetrics && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHeaderMetricIds((prev) => prev.filter((id) => id !== m.key));
                        }}
                        className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-200/70 bg-background/90 text-rose-500/70 transition hover:border-rose-300 hover:text-rose-600"
                        aria-label={`Remove ${m.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>

                      <div className="absolute right-2 top-2 flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeaderMetricIds((prev) => {
                              if (index === 0) return prev;
                              const next = [...prev];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              return next;
                            });
                          }}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          aria-label={`Move ${m.label} left`}
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === headerMetrics.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeaderMetricIds((prev) => {
                              if (index >= prev.length - 1) return prev;
                              const next = [...prev];
                              [next[index], next[index + 1]] = [next[index + 1], next[index]];
                              return next;
                            });
                          }}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          aria-label={`Move ${m.label} right`}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  )}
                  <span className="text-[13px] text-muted-foreground min-w-0">{m.label}</span>
                  <span className="text-[13px] font-medium text-foreground text-right tabular-nums shrink-0">{m.value}</span>
                </div>
              ))}
            </div>
            
            <div className="pt-5 border-t border-border/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <span className="text-[12px] font-bold tracking-tight text-foreground shrink-0">
                  Add ratio to table
                </span>
                <div className="w-full flex-1 min-w-0">
                  <div className="flex items-center gap-3 border border-border/60 rounded-lg px-3 py-2.5">
                    <input
                      ref={customRatioInputRef}
                      list="header-ratio-options"
                      value={customRatioQuery}
                      onChange={(e) => setCustomRatioQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomRatio(customRatioQuery);
                        }
                      }}
                      placeholder="eg. FCF Yield %"
                      className="h-5 w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <button
                      type="button"
                      onClick={() => addCustomRatio(customRatioQuery)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-bold text-foreground transition hover:bg-muted/30"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingHeaderMetrics((prev) => !prev)}
                      className={`shrink-0 text-[11px] font-bold tracking-wider uppercase flex items-center gap-1 transition ${
                        isEditingHeaderMetrics ? "text-foreground" : "text-primary hover:underline"
                      }`}
                    >
                      <TrendingUp className="w-3 h-3" /> {isEditingHeaderMetrics ? "Done" : "Edit Ratios"}
                    </button>
                  </div>
                  <datalist id="header-ratio-options">
                    {ratioOptions.map((option) => (
                      <option key={option.id} value={option.item.label} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          {/* Right: About + Key Points Tile */}
          <div className="min-w-0 rounded-xl border border-border/40 bg-card p-5 shadow-sm">
            {overviewMeta?.description && (
              <div>
                <h4 className="text-[12px] font-bold tracking-widest uppercase text-foreground mb-3">About</h4>
                <p className={`text-[13.5px] text-muted-foreground leading-relaxed break-words ${!descExpanded ? "line-clamp-4" : ""}`}>
                  {overviewMeta.description}
                </p>
                <button
                  onClick={() => setDescExpanded((p) => !p)}
                  className="text-[12px] font-medium text-primary mt-2 flex items-center gap-1 hover:underline"
                >
                  {descExpanded ? "SHOW LESS" : "READ MORE"}
                </button>
              </div>
            )}

            <div className={overviewMeta?.description ? "mt-5 border-t border-border/20 pt-5" : ""}>
              <h4 className="text-[12px] font-bold tracking-widest uppercase text-foreground mb-3">Key Points</h4>
              <div className="grid gap-3">
                {[
                  ["Sector", company.sector],
                  ["Industry", company.industry],
                  ["Country", overviewMeta?.country],
                  ["Currency", overviewMeta?.currency],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-snug break-words">
                      {value}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {ratioAmbientCtx && (
          <AmbientAIPopover
            context={ratioAmbientCtx.context}
            position={ratioAmbientCtx.position}
            onClose={() => setRatioAmbientCtx(null)}
          />
        )}
      </section>

      {/* ── Scrollable Sections ────────────────────────────────────────── */}
      <div className="px-4 pb-8 space-y-8 sm:px-6">

        {/* ── Chart ─────────────────────────────────────────────────── */}
        <section id="chart" style={sectionScrollStyle}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/80">Chart</h2>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_24px_60px_-52px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-4 border-b border-border/50 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Interactive Chart
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {activePriceTab === "price"
                    ? "A cleaner stock-price view with stronger period focus and easier drag-to-compare feedback."
                    : "Regime overlays, trend-shift markers, and AI-assisted range analysis in one place."}
                </p>
              </div>

              <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/20 p-1">
                <button
                  onClick={() => setActivePriceTab("price")}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                    activePriceTab === "price"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Stock Price
                </button>
                <button
                  onClick={() => setActivePriceTab("signals")}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                    activePriceTab === "signals"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Trend Analysis
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {activePriceTab === "price" ? (
                <PlainPriceChart prices={displayedPrices} period={period} setPeriod={setPeriod} priceStats={priceStats} />
              ) : (
                <SignalsPriceChart
                  ticker={ticker}
                  prices={displayedPrices}
                  analysis={analysis}
                  period={period}
                  setPeriod={setPeriod}
                  priceStats={priceStats}
                  selectedInsight={selectedInsight}
                  onSelectInsight={setSelectedInsight}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Financial Statements ───────────────────────────────────── */}
        {FINANCIAL_STATEMENT_SECTIONS.map(({ id, statementKey, title, description, icon: Icon }) => (
          <section key={id} id={id} style={sectionScrollStyle}>
            <FinancialStatementSectionBlock
              statement={displayStatements[statementKey] || null}
              ticker={ticker}
              title={title}
              description={description}
              Icon={Icon}
              periodType={periodType}
              setPeriodType={setPeriodType}
            />
          </section>
        ))}

        {/* ── Shareholders ──────────────────────────────────────────── */}
        <section id="shareholders" style={sectionScrollStyle}>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/80">Shareholders</h2>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <ShareholdersTab key={ticker} ticker={ticker} />
          </div>
        </section>

        {/* ── Documents ─────────────────────────────────────────────── */}
        <section id="documents" style={sectionScrollStyle}>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/80">Documents</h2>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <DocumentsTab ticker={ticker} />
          </div>
        </section>

      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground/60 pb-6 text-center">
        Data sourced from Alpha Vantage and SEC EDGAR. For educational purposes only. Not investment advice.
      </p>
    </div>
  );
}
