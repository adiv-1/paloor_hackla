"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Loader2,
  Filter,
  RotateCcw,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  Compass,
} from "lucide-react";
import { EquityTickerSearch } from "@/components/EquityTickerSearch";
import { InfoPopover } from "@/components/InfoPopover";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ABSTRACTION_LEVELS = [
  { value: "beginner", label: "Beginner", desc: "Plain language, no jargon" },
  { value: "retail", label: "Retail Investor", desc: "Practical and concise" },
  { value: "pro", label: "Professional", desc: "Finance terminology" },
  { value: "institutional", label: "Institutional", desc: "Deep quantitative" },
  { value: "cfa", label: "CFA / Advanced", desc: "Full rigor" },
] as const;

interface ScreenerItem {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number | null;
  market_cap: number | null;
  pe: number | null;
  price_to_book: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  roe: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;
  revenue: number | null;
  net_income: number | null;
  operating_cash_flow: number | null;
  free_cash_flow: number | null;
}

interface ScreenerResponse {
  items: ScreenerItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  sectors: string[];
  industries?: string[];
  price_coverage?: {
    with_price: number;
    total: number;
  };
}

interface ScreenerFieldResponse {
  fields: { field: string; label: string }[];
  operators: string[];
  examples: string[];
}

interface ScreenerFilters {
  search: string;
  expression: string;
  sector: string;
  industry: string;
  minPe: string;
  maxPe: string;
  minRoe: string;
  maxDebtToEquity: string;
  minCurrentRatio: string;
  minMarketCapB: string;
  minRevenueB: string;
  minOperatingCfB: string;
  minFreeCfB: string;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  search: "",
  expression: "",
  sector: "",
  industry: "",
  minPe: "",
  maxPe: "",
  minRoe: "",
  maxDebtToEquity: "",
  minCurrentRatio: "",
  minMarketCapB: "",
  minRevenueB: "",
  minOperatingCfB: "",
  minFreeCfB: "",
};

function fmtCurrency(v: number | null, decimals = 2) {
  if (v == null) return "—";
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtCompact(v: number | null) {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPercent(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

function hasActiveFilters(f: ScreenerFilters): boolean {
  return !!(
    f.expression.trim() ||
    f.search.trim() ||
    f.sector ||
    f.industry ||
    f.minPe ||
    f.maxPe ||
    f.minRoe ||
    f.maxDebtToEquity ||
    f.minCurrentRatio ||
    f.minMarketCapB ||
    f.minRevenueB ||
    f.minOperatingCfB ||
    f.minFreeCfB
  );
}

/* ── Expression Input with autocomplete ──────────────────────────────────── */

function ExpressionInput({
  value,
  onChange,
  onSubmit,
  fields,
  examples,
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  fields: { field: string; label: string }[];
  examples: string[];
}) {
  const [suggestions, setSuggestions] = useState<{ field: string; label: string }[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract the current word being typed (after last space or AND)
  function getCurrentToken(text: string): string {
    // Find the last AND or start of string
    const parts = text.split(/\s+AND\s+/i);
    const lastPart = parts[parts.length - 1].trim();
    // Get the first word (field name portion)
    const words = lastPart.split(/\s+/);
    return words[0] || "";
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    onChange(newVal);

    const token = getCurrentToken(newVal).toLowerCase();
    if (token.length > 0) {
      const matches = fields.filter(
        (f) =>
          f.field.toLowerCase().includes(token) ||
          f.label.toLowerCase().includes(token),
      );
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedSuggestion(0);
    } else {
      setShowSuggestions(false);
    }
  }

  function applySuggestion(fieldName: string) {
    // Replace the current token with the selected field
    const parts = value.split(/(\s+AND\s+)/i);
    const lastPart = parts[parts.length - 1].trim();
    const words = lastPart.split(/\s+/);
    words[0] = fieldName;
    // If only the field name, add operator placeholder
    if (words.length === 1) {
      words.push(">", "");
    }
    parts[parts.length - 1] = " " + words.join(" ");
    onChange(parts.join("").trimStart());
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && suggestions.length > 0 && getCurrentToken(value).length > 0)) {
        // Only consume Enter for autocomplete if there's partial text matching
        const token = getCurrentToken(value).toLowerCase();
        const exactMatch = fields.find((f) => f.field.toLowerCase() === token);
        if (e.key === "Tab" || !exactMatch) {
          e.preventDefault();
          applySuggestion(suggestions[selectedSuggestion].field);
          return;
        }
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setShowSuggestions(false);
      onSubmit();
    }
  }

  return (
    <div className="relative">
      <label className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1.5">
        Expression filter
      </label>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        onFocus={() => {
          const token = getCurrentToken(value).toLowerCase();
          if (token.length > 0) {
            const matches = fields.filter(
              (f) =>
                f.field.toLowerCase().includes(token) ||
                f.label.toLowerCase().includes(token),
            );
            if (matches.length > 0) {
              setSuggestions(matches);
              setShowSuggestions(true);
            }
          }
        }}
        placeholder={
          examples.length > 0
            ? `e.g. ${examples[0]}`
            : "gross_margin > 40 AND pe < 15 AND roe > 12"
        }
        rows={2}
        className="w-full px-4 py-3 text-sm border border-border rounded-lg bg-background font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
      />
      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.field}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s.field);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/50 transition-colors ${
                i === selectedSuggestion ? "bg-muted/50" : ""
              }`}
            >
              <span className="font-mono font-medium text-foreground">{s.field}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">Fields:</span>
        {fields.slice(0, 8).map((f) => (
          <button
            key={f.field}
            type="button"
            onClick={() => {
              onChange(
                value
                  ? `${value} AND ${f.field} > `
                  : `${f.field} > `,
              );
              textareaRef.current?.focus();
            }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground transition-colors"
          >
            {f.field}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function EquitiesPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [screener, setScreener] = useState<ScreenerResponse | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [screenerPage, setScreenerPage] = useState(1);
  const [sortBy, setSortBy] = useState("market_cap");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [screenerFields, setScreenerFields] = useState<
    { field: string; label: string }[]
  >([]);
  const [screenerExamples, setScreenerExamples] = useState<string[]>([]);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [abstractionLevel, setAbstractionLevel] = useState("retail");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendResult, setRecommendResult] = useState<{
    explanation: string;
    risk_note: string;
    sectors_to_consider: string[];
  } | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sectors, setSectors] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);

  // Load AI preferences (abstraction level) + sectors list
  useEffect(() => {
    const authToken = token || localStorage.getItem("paloor_token");
    if (authToken) {
      fetch(`${API}/api/chat/preferences`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.abstraction_level) setAbstractionLevel(d.abstraction_level);
        })
        .catch(() => {});
    }
    // Fetch screener fields + sectors (lightweight, no full screener load)
    fetch(`${API}/api/equities/v2/screener/fields`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScreenerFieldResponse | null) => {
        if (!d) return;
        setScreenerFields(d.fields || []);
        setScreenerExamples(d.examples || []);
      })
      .catch(() => {});
    // Fetch sectors only
    fetch(`${API}/api/equities/v2/screener?per_page=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScreenerResponse | null) => {
        if (d?.sectors) setSectors(d.sectors);
        if (d?.industries) setIndustries(d.industries);
      })
      .catch(() => {});
  }, [token]);

  function persistAbstractionLevel(level: string) {
    setAbstractionLevel(level);
    const authToken = token || localStorage.getItem("paloor_token");
    if (!authToken) return;
    fetch(`${API}/api/chat/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ abstraction_level: level }),
    }).catch(() => {});
  }

  async function recommendStocksForMe() {
    setRecommendLoading(true);
    setRecommendResult(null);
    setAssistantNote(null);
    try {
      const authToken = token || localStorage.getItem("paloor_token") || "";
      const res = await fetch(`${API}/api/chat/assistant/recommend-stocks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: assistantPrompt.trim() || "What stocks are best for my portfolio?",
          abstraction_level: abstractionLevel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssistantNote(data?.detail || "Could not generate recommendations.");
        return;
      }
      if (typeof data?.expression === "string" && data.expression.trim()) {
        const newFilters = { ...filters, expression: data.expression.trim() };
        // Auto-set sector/industry if AI suggested one
        if (data.sector) {
          newFilters.sector = data.sector;
        } else if (data.sectors_to_consider?.length === 1) {
          newFilters.sector = data.sectors_to_consider[0];
        }
        if (data.industry) {
          newFilters.industry = data.industry;
        }
        setFilters((f) => ({ ...f, ...newFilters }));
        // Auto-run the screener with the recommended expression
        setTimeout(() => runScreener(1, newFilters), 0);
      }
      setRecommendResult({
        explanation: data?.explanation || "Personalized screen applied.",
        risk_note: data?.risk_note || "",
        sectors_to_consider: data?.sectors_to_consider || [],
      });
    } catch {
      setAssistantNote("Could not generate recommendations.");
    } finally {
      setRecommendLoading(false);
    }
  }

  async function runScreener(page = screenerPage, overrideFilters?: ScreenerFilters) {
    const f = overrideFilters || filters;
    setScreenerLoading(true);
    setScreenerError(null);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (f.search.trim()) params.set("search", f.search.trim());
      if (f.expression.trim())
        params.set("expression", f.expression.trim());
      if (f.sector) params.set("sector", f.sector);
      if (f.industry) params.set("industry", f.industry);
      if (f.minPe) params.set("min_pe", f.minPe);
      if (f.maxPe) params.set("max_pe", f.maxPe);
      if (f.minRoe) params.set("min_roe", f.minRoe);
      if (f.maxDebtToEquity)
        params.set("max_debt_to_equity", f.maxDebtToEquity);
      if (f.minCurrentRatio)
        params.set("min_current_ratio", f.minCurrentRatio);
      if (f.minMarketCapB)
        params.set(
          "min_market_cap",
          String(Number(f.minMarketCapB) * 1_000_000_000),
        );
      if (f.minRevenueB)
        params.set(
          "min_revenue",
          String(Number(f.minRevenueB) * 1_000_000_000),
        );
      if (f.minOperatingCfB)
        params.set(
          "min_operating_cf",
          String(Number(f.minOperatingCfB) * 1_000_000_000),
        );
      if (f.minFreeCfB)
        params.set(
          "min_free_cf",
          String(Number(f.minFreeCfB) * 1_000_000_000),
        );
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
      params.set("page", String(page));
      params.set("per_page", "40");

      const res = await fetch(
        `${API}/api/equities/v2/screener?${params.toString()}`,
      );
      if (res.ok) {
        const data = (await res.json()) as ScreenerResponse;
        setScreener(data);
        if (data.sectors?.length) setSectors(data.sectors);
        if (data.industries?.length) setIndustries(data.industries);
      } else {
        const err = await res.json().catch(() => ({}));
        setScreenerError(err?.detail || "Unable to run screener query.");
      }
    } catch {
      setScreenerError("Unable to run screener query.");
    } finally {
      setScreenerLoading(false);
    }
  }

  async function generateExpressionFromPrompt() {
    const prompt = assistantPrompt.trim();
    if (!prompt) return;
    setAssistantLoading(true);
    setAssistantNote(null);
    try {
      const authToken = token || localStorage.getItem("paloor_token") || "";
      const res = await fetch(`${API}/api/chat/assistant/screener-expression`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ prompt, abstraction_level: abstractionLevel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssistantNote(data?.detail || "Could not generate expression.");
        return;
      }
      if (typeof data?.expression === "string" && data.expression.trim()) {
        const newFilters = { ...filters, expression: data.expression.trim() };
        if (data.sector) newFilters.sector = data.sector;
        if (data.industry) newFilters.industry = data.industry;
        setFilters((f) => ({ ...f, ...newFilters }));
        // Auto-run the screener
        setTimeout(() => runScreener(1, newFilters), 0);
      }
      setAssistantNote(data?.explanation || "Expression generated.");
    } catch {
      setAssistantNote("Could not generate expression.");
    } finally {
      setAssistantLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center min-h-[80vh] px-6 pt-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Compass className="w-7 h-7 text-primary" />
          <h1 className="font-serif text-3xl text-foreground">Equity Discovery</h1>
          <InfoPopover
            title="Equity Discovery"
            description="Search for individual stocks or use the screener to filter S&P 500 companies by financial metrics. Write expressions like 'pe < 15 AND roe > 12', or ask the AI to generate one from natural language."
            tips={[
              "Type an expression and press Enter to screen instantly",
              "Use 'Recommend for me' for AI-personalized stock criteria based on your profile",
              "Click any ticker to dive into full company details",
              "Change your AI level to adjust explanation depth",
            ]}
            sectionContext="Equity Discovery"
            size="sm"
          />
        </div>
        <p className="text-muted-foreground text-sm max-w-lg">
          Search any S&P 500 company, or screen by financial metrics and
          AI-powered criteria.
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-4 w-full max-w-[42rem]">
        <EquityTickerSearch
          autoFocus
          className="w-full"
          placeholder="Search by ticker or company name..."
          variant="hero"
        />
      </div>

      {/* Browse link */}
      <button
        onClick={() => router.push("/dashboard/equities/stocks")}
        className="mb-10 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        or browse all S&P 500 companies →
      </button>

      {/* Discovery / Screener Panel */}
      <div className="w-full max-w-6xl border border-border/60 rounded-2xl bg-card shadow-sm overflow-hidden">
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/90">
              Screen &amp; Filter
            </h2>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* ── AI Assistant (primary) ───────────────────────────────── */}
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={assistantPrompt}
              onChange={(e) => setAssistantPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && assistantPrompt.trim()) {
                  e.preventDefault();
                  generateExpressionFromPrompt();
                }
              }}
              placeholder="Describe what you're looking for: e.g. top semiconductor companies with high revenue growth..."
              className="flex-1 px-4 py-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={generateExpressionFromPrompt}
                disabled={assistantLoading || !assistantPrompt.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-xs rounded-lg border border-border bg-background hover:bg-muted/30 disabled:opacity-50 transition-colors"
              >
                {assistantLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Generate
              </button>
              <InfoPopover
                title="Generate Filter"
                description="Translates your natural language query into a screener expression. The AI picks the best financial metrics and thresholds to match your intent, and automatically sets the sector filter if applicable."
                tips={[
                  "Mention sectors like 'semiconductor' or 'healthcare' for automatic filtering",
                  "Be specific: 'profitable tech companies with low debt' works better than 'good stocks'",
                  "The generated expression uses real metrics like P/E, ROE, revenue growth, etc.",
                ]}
                sectionContext="AI Screener"
                size="sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={recommendStocksForMe}
                disabled={recommendLoading}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 text-xs rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
              >
                {recommendLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Brain className="w-3.5 h-3.5" />
                )}
                Recommend for me
              </button>
              <InfoPopover
                title="Recommend for Me"
                description="Uses your full financial profile — risk tolerance, goals, existing portfolio, income, and uploaded documents — to design a personalized screener expression tailored to your situation."
                tips={[
                  "Works best after completing your profile and uploading financial documents",
                  "Add context in the prompt: 'I want dividend income' or 'growth-focused'",
                  "Suggested sectors appear as clickable buttons to further narrow results",
                ]}
                sectionContext="AI Recommendations"
                size="sm"
              />
            </div>
          </div>

          {/* AI Level Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              AI Level:
            </span>
            <div className="flex gap-1">
              {ABSTRACTION_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => persistAbstractionLevel(lvl.value)}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                    abstractionLevel === lvl.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:bg-muted/20"
                  }`}
                  title={lvl.desc}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {assistantNote && (
            <div className="text-[11px] text-muted-foreground bg-muted/20 px-3 py-2 rounded-md">
              {assistantNote}
            </div>
          )}

          {recommendResult && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
              <p className="text-xs text-foreground leading-relaxed">
                {recommendResult.explanation}
              </p>
              {recommendResult.risk_note && (
                <p className="text-[11px] text-muted-foreground italic">
                  {recommendResult.risk_note}
                </p>
              )}
              {recommendResult.sectors_to_consider.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Suggested sectors:
                  </span>
                  {recommendResult.sectors_to_consider.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setFilters((f) => ({ ...f, sector: s }))
                      }
                      className="text-[10px] px-2 py-0.5 rounded-full border border-primary/20 bg-background text-primary hover:bg-primary/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground/60">
                This is educational — not financial advice. Always do your own research.
              </p>
            </div>
          )}

          {/* ── Expression filter (secondary) ────────────────────────── */}
          <ExpressionInput
            value={filters.expression}
            onChange={(val) => setFilters((f) => ({ ...f, expression: val }))}
            onSubmit={() => { setScreenerPage(1); runScreener(1); }}
            fields={screenerFields}
            examples={screenerExamples}
          />

          {/* Advanced Filters (collapsible) */}
          <div className="border border-border/40 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium hover:bg-muted/20 transition-colors"
            >
              {showAdvancedFilters ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Advanced filters
            </button>
            {showAdvancedFilters && (
              <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                <input
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  placeholder="Ticker / company"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <select
                  value={filters.sector}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, sector: e.target.value }))
                  }
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                >
                  <option value="">All sectors</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.industry}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, industry: e.target.value }))
                  }
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                >
                  <option value="">All industries</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
                <input
                  value={filters.minPe}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minPe: e.target.value }))
                  }
                  placeholder="Min P/E"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.maxPe}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, maxPe: e.target.value }))
                  }
                  placeholder="Max P/E"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minRoe}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minRoe: e.target.value }))
                  }
                  placeholder="Min ROE %"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.maxDebtToEquity}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, maxDebtToEquity: e.target.value }))
                  }
                  placeholder="Max Debt/Equity"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minCurrentRatio}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minCurrentRatio: e.target.value }))
                  }
                  placeholder="Min Current Ratio"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minMarketCapB}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minMarketCapB: e.target.value }))
                  }
                  placeholder="Min Market Cap (B)"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minRevenueB}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minRevenueB: e.target.value }))
                  }
                  placeholder="Min Revenue (B)"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minOperatingCfB}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minOperatingCfB: e.target.value }))
                  }
                  placeholder="Min Op Cash Flow (B)"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={filters.minFreeCfB}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minFreeCfB: e.target.value }))
                  }
                  placeholder="Min Free Cash Flow (B)"
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                >
                  <option value="market_cap">Sort: Market Cap</option>
                  <option value="pe">Sort: P/E</option>
                  <option value="roe">Sort: ROE</option>
                  <option value="revenue">Sort: Revenue</option>
                  <option value="free_cash_flow">Sort: Free Cash Flow</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                  className="px-3 py-2 text-xs border border-border rounded-md bg-background"
                >
                  <option value="desc">Sort: Desc</option>
                  <option value="asc">Sort: Asc</option>
                </select>
              </div>
            )}
          </div>

          {screenerError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {screenerError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setScreenerPage(1);
                runScreener(1);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" /> Run Screen
            </button>
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setSortBy("market_cap");
                setSortOrder("desc");
                setScreenerPage(1);
                setScreener(null);
                setHasSearched(false);
                setRecommendResult(null);
                setAssistantNote(null);
                setAssistantPrompt("");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-border bg-background hover:bg-muted/20 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={async () => {
                setSyncingPrices(true);
                setSyncMessage(null);
                try {
                  const res = await fetch(
                    `${API}/api/equities/v2/fetch-prices-batch?missing_only=true&background=true`,
                    { method: "POST" },
                  );
                  const data = await res.json().catch(() => ({}));
                  if (res.ok) {
                    setSyncMessage(
                      data?.message || "Price sync started in background.",
                    );
                  } else {
                    setSyncMessage(
                      data?.detail || "Could not start price sync.",
                    );
                  }
                } catch {
                  setSyncMessage("Could not start price sync.");
                } finally {
                  setSyncingPrices(false);
                }
              }}
              disabled={syncingPrices}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-border bg-background disabled:opacity-50 hover:bg-muted/20 transition-colors"
            >
              {syncingPrices ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5" />
              )}
              Sync Prices
            </button>
            {hasSearched && screener && (
              <span className="ml-auto text-xs text-muted-foreground">
                {screener.total} matches
                {screener.price_coverage
                  ? ` · ${screener.price_coverage.with_price} with prices`
                  : ""}
              </span>
            )}
          </div>

          {syncMessage && (
            <div className="text-[11px] text-muted-foreground">
              {syncMessage}
            </div>
          )}

          {/* Results — only show after user runs a screen */}
          {!hasSearched ? (
            <div className="text-center py-12 text-muted-foreground">
              <Compass className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Write an expression or set filters, then press <strong>Run Screen</strong></p>
              <p className="text-xs mt-1 opacity-60">
                Or ask the AI to build a screen for you
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-border/50 rounded-lg">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      <th className="text-left px-3 py-2">Ticker</th>
                      <th className="text-left px-3 py-2">Company</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">P/E</th>
                      <th className="text-right px-3 py-2">ROE</th>
                      <th className="text-right px-3 py-2">Current Ratio</th>
                      <th className="text-right px-3 py-2">Debt/Equity</th>
                      <th className="text-right px-3 py-2">Revenue</th>
                      <th className="text-right px-3 py-2">Op CF</th>
                      <th className="text-right px-3 py-2">Free CF</th>
                      <th className="text-right px-3 py-2">Mkt Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenerLoading ? (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />{" "}
                          Screening...
                        </td>
                      </tr>
                    ) : (screener?.items || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          No stocks match these criteria.
                        </td>
                      </tr>
                    ) : (
                      (screener?.items || []).map((s) => (
                        <tr
                          key={s.ticker}
                          className="border-b border-border/30 hover:bg-muted/20 cursor-pointer"
                          onClick={() => router.push(`/dashboard/equities/stocks/${s.ticker}`)}
                        >
                          <td className="px-3 py-2 font-semibold tabular-nums text-primary">
                            {s.ticker}
                          </td>
                          <td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2 text-right">
                            {fmtCurrency(s.price)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {s.pe?.toFixed(2) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtPercent(s.roe)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {s.current_ratio?.toFixed(2) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {s.debt_to_equity?.toFixed(2) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtCompact(s.revenue)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtCompact(s.operating_cash_flow)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtCompact(s.free_cash_flow)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtCompact(s.market_cap)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {screener && screener.pages > 1 && (
                <div className="flex items-center justify-between">
                  <button
                    disabled={screener.page <= 1 || screenerLoading}
                    onClick={() => {
                      const next = Math.max(1, screener.page - 1);
                      setScreenerPage(next);
                      runScreener(next);
                    }}
                    className="px-3 py-1.5 text-xs rounded-md border border-border disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {screener.page} of {screener.pages}
                  </span>
                  <button
                    disabled={screener.page >= screener.pages || screenerLoading}
                    onClick={() => {
                      const next = Math.min(screener.pages, screener.page + 1);
                      setScreenerPage(next);
                      runScreener(next);
                    }}
                    className="px-3 py-1.5 text-xs rounded-md border border-border disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
