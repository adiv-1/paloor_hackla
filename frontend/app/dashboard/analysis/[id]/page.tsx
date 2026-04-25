"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  BarChart3,
  Shield,
  Briefcase,
  Newspaper,
  LineChart,
  DollarSign,
  Scale,
  Search,
  Activity,
  Target,
  AlertTriangle,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { InfoPopover } from "@/components/InfoPopover";
import { HighlightAskProvider } from "@/components/HighlightAsk";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Report {
  id: string;
  agent_name: string;
  agent_group: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  report_content: string | null;
  report_data: unknown;
  error_message: string | null;
}

interface AgentBreakdown {
  name: string;
  label: string;
  group: string;
  status: string;
  signal: string | null;
  headline: string;
}

interface PMMetrics {
  entry?: string;
  target?: string;
  stop_loss?: string;
  time_horizon?: string;
  risk_rating?: string;
}

interface FullAnalysis {
  id: string;
  ticker: string;
  status: string;
  decision: string | null;
  confidence: string | null;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
  duration_secs: number | null;
  metadata: {
    charts?: unknown[];
    agent_breakdown?: AgentBreakdown[];
    pm_metrics?: PMMetrics;
  } | null;
  reports: Report[];
}

const AGENT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  market_analyst:       { label: "Market Analyst",       icon: BarChart3,  color: "text-blue-500",    bg: "bg-blue-500/10" },
  technical_analyst:    { label: "Technical Analyst",    icon: LineChart,  color: "text-purple-500",  bg: "bg-purple-500/10" },
  fundamentals_analyst: { label: "Fundamentals Analyst", icon: DollarSign, color: "text-green-500",   bg: "bg-green-500/10" },
  news_analyst:         { label: "News Analyst",         icon: Newspaper,  color: "text-orange-500",  bg: "bg-orange-500/10" },
  bull_researcher:      { label: "Bull/Bear Advocates",  icon: Scale,      color: "text-indigo-500",  bg: "bg-indigo-500/10" },
  research_evaluator:   { label: "Research Evaluator",   icon: Search,     color: "text-cyan-500",    bg: "bg-cyan-500/10" },
  trader:               { label: "Trader",               icon: Briefcase,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
  risk_analyst:         { label: "Risk Analyst",         icon: Shield,     color: "text-red-500",     bg: "bg-red-500/10" },
  portfolio_manager:    { label: "Portfolio Manager",    icon: User,       color: "text-amber-500",   bg: "bg-amber-500/10" },
};

const GROUP_ORDER = ["analyst", "research", "trading", "risk", "verdict"];
const GROUP_LABELS: Record<string, string> = {
  analyst:  "Phase 1 · Analysis",
  research: "Phase 2 · Research",
  trading:  "Phase 3 · Trading",
  risk:     "Phase 4 · Risk",
  verdict:  "Phase 5 · Verdict",
};
const GROUP_DESCRIPTIONS: Record<string, string> = {
  analyst:  "Four specialists pull market data, technicals, fundamentals, and news",
  research: "Bull/bear advocates debate while a senior evaluator scores conviction",
  trading:  "Senior trader drafts an actionable plan with entry, target, and sizing",
  risk:     "Risk team stress-tests volatility, liquidity, and event exposure",
  verdict:  "Portfolio manager renders the final transaction decision",
};

function signalChip(signal: string | null | undefined, size: "sm" | "xs" = "sm") {
  if (!signal) return null;
  const s = signal.toUpperCase();
  let cls = "bg-muted text-muted-foreground border-border";
  if (s === "BULLISH" || s === "BUY" || s === "HIGH CONF")
    cls = "bg-green-500/10 text-green-600 border-green-500/30";
  else if (s === "BEARISH" || s === "SELL")
    cls = "bg-red-500/10 text-red-600 border-red-500/30";
  else if (s === "NEUTRAL" || s === "HOLD")
    cls = "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
  else if (s === "MEDIUM CONF" || s === "MODERATE")
    cls = "bg-blue-500/10 text-blue-600 border-blue-500/30";
  else if (s === "LOW" || s === "HIGH" || s === "VERY_HIGH" || s === "LOW CONF")
    cls = "bg-orange-500/10 text-orange-600 border-orange-500/30";
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center rounded font-semibold tracking-wide border ${pad} ${cls}`}>
      {s.replace("_", " ")}
    </span>
  );
}

function decisionBadge(d: string | null) {
  if (d === "BUY")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-500/15 text-green-600 border border-green-500/25">
        <TrendingUp className="h-4 w-4" /> BUY
      </span>
    );
  if (d === "SELL")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/15 text-red-600 border border-red-500/25">
        <TrendingDown className="h-4 w-4" /> SELL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/25">
      <Minus className="h-4 w-4" /> HOLD
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  ticker,
  decision,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "bad" | "warn";
  ticker?: string;
  decision?: string | null;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    good: "text-green-600",
    bad: "text-red-600",
    warn: "text-orange-600",
  };
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 min-w-[110px] relative group">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
        {ticker && (
          <span className="ml-auto opacity-60 group-hover:opacity-100 transition-opacity">
            <InfoPopover
              title={`${label} — ${ticker}`}
              description={`The ${label.toLowerCase()} level for the ${decision || "current"} recommendation on ${ticker} is ${value}.`}
              sectionContext={`Deep analysis ${decision || ""} verdict on ${ticker}. Metric: ${label} = ${value}. Explain how this level was chosen and how the user should interpret or act on it.`}
              size="sm"
            />
          </span>
        )}
      </div>
      <div className={`text-sm font-semibold mt-0.5 ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const analysisId = params.id as string;
  const router = useRouter();
  const { token, logout } = useAuth();

  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const hdrs = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  useEffect(() => {
    if (!token || !analysisId) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/analysis/${analysisId}`, { headers: hdrs() });
        if (res.status === 401) { logout(); return; }
        if (res.status === 404) { router.push("/dashboard/analysis"); return; }
        const data = await res.json();
        setAnalysis(data);
        const pm = data.reports?.find((r: Report) => r.agent_name === "portfolio_manager" && r.report_content);
        const first = data.reports?.find((r: Report) => r.report_content);
        setSelectedAgent((pm || first)?.agent_name || null);
      } catch (e) {
        console.error("Failed to load analysis:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, analysisId, hdrs, logout, router]);

  const signalByAgent = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const a of analysis?.metadata?.agent_breakdown || []) map[a.name] = a.signal;
    return map;
  }, [analysis]);

  const headlineByAgent = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of analysis?.metadata?.agent_breakdown || []) map[a.name] = a.headline;
    return map;
  }, [analysis]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground">
        <p>Analysis not found</p>
        <button onClick={() => router.push("/dashboard/analysis")} className="text-primary mt-2 text-sm">
          Back to analyses
        </button>
      </div>
    );
  }

  const selectedReport = analysis.reports.find((r) => r.agent_name === selectedAgent);
  const SelectedIcon = selectedReport ? AGENT_META[selectedReport.agent_name]?.icon : null;
  const selectedMeta = selectedReport ? AGENT_META[selectedReport.agent_name] : null;

  const groupedReports: Record<string, Report[]> = {};
  for (const r of analysis.reports) {
    (groupedReports[r.agent_group] ||= []).push(r);
  }

  const metrics = analysis.metadata?.pm_metrics || {};
  const agentBreakdown = analysis.metadata?.agent_breakdown || [];

  const sentimentTally = agentBreakdown
    .filter((a) => a.group === "analyst")
    .reduce<{ bull: number; bear: number; neut: number }>(
      (acc, a) => {
        const s = (a.signal || "").toUpperCase();
        if (s === "BULLISH") acc.bull++;
        else if (s === "BEARISH") acc.bear++;
        else if (s === "NEUTRAL") acc.neut++;
        return acc;
      },
      { bull: 0, bear: 0, neut: 0 },
    );

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-border/50 bg-card px-6 py-4 space-y-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard/analysis")}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{analysis.ticker} Analysis</h1>
              {decisionBadge(analysis.decision)}
              {analysis.confidence && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground">
                  {analysis.confidence} confidence
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  analysis.status === "completed"
                    ? "bg-green-500/10 text-green-600"
                    : analysis.status === "running"
                      ? "bg-blue-500/10 text-blue-600"
                      : "bg-red-500/10 text-red-600"
                }`}
              >
                {analysis.status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
              <span>{new Date(analysis.created_at).toLocaleString()}</span>
              {analysis.duration_secs ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {Math.round(analysis.duration_secs)}s · {analysis.reports.length} agents
                </span>
              ) : null}
              {(sentimentTally.bull + sentimentTally.bear + sentimentTally.neut) > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="text-green-600">{sentimentTally.bull} bull</span>
                  <span className="text-yellow-600">{sentimentTally.neut} neutral</span>
                  <span className="text-red-600">{sentimentTally.bear} bear</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {(metrics.entry || metrics.target || metrics.stop_loss || metrics.time_horizon || metrics.risk_rating) && (
          <div className="flex items-stretch gap-2 flex-wrap">
            {metrics.entry && <MetricCard label="Entry" value={`$${metrics.entry}`} icon={Target} ticker={analysis.ticker} decision={analysis.decision} />}
            {metrics.target && <MetricCard label="Target" value={`$${metrics.target}`} icon={TrendingUp} tone="good" ticker={analysis.ticker} decision={analysis.decision} />}
            {metrics.stop_loss && <MetricCard label="Stop Loss" value={`$${metrics.stop_loss}`} icon={Shield} tone="bad" ticker={analysis.ticker} decision={analysis.decision} />}
            {metrics.time_horizon && <MetricCard label="Horizon" value={metrics.time_horizon} icon={Clock} ticker={analysis.ticker} decision={analysis.decision} />}
            {metrics.risk_rating && <MetricCard label="Risk" value={metrics.risk_rating} icon={AlertTriangle} tone="warn" ticker={analysis.ticker} decision={analysis.decision} />}
          </div>
        )}

        {analysis.summary && (
          <p className="text-sm text-foreground/80 leading-relaxed">{analysis.summary}</p>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-border/50 bg-card/40 overflow-y-auto">
          <div className="p-3 space-y-3">
            {GROUP_ORDER.map((group) => {
              const reports = groupedReports[group];
              if (!reports) return null;
              const completed = reports.filter((r) => r.status === "completed").length;

              return (
                <div key={group}>
                  <div className="px-1 mb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {GROUP_LABELS[group] || group}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/70">
                          {completed}/{reports.length}
                        </span>
                        <InfoPopover
                          title={GROUP_LABELS[group] || group}
                          description={GROUP_DESCRIPTIONS[group]}
                          sectionContext={`User is reviewing the ${GROUP_LABELS[group]} of a multi-agent deep analysis on ${analysis.ticker}. The phase contains agents: ${reports.map((r) => AGENT_META[r.agent_name]?.label || r.agent_name).join(", ")}. Help them understand what this phase does, why it matters, and how to read its outputs.`}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 leading-tight">
                      {GROUP_DESCRIPTIONS[group]}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {reports.map((r) => {
                      const meta = AGENT_META[r.agent_name] || {
                        label: r.agent_name,
                        icon: User,
                        color: "text-muted-foreground",
                        bg: "bg-muted",
                      };
                      const Icon = meta.icon;
                      const isSelected = selectedAgent === r.agent_name;
                      const sig = signalByAgent[r.agent_name];

                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedAgent(r.agent_name)}
                          className={`flex items-start gap-2 w-full px-2.5 py-2 rounded-lg text-left transition-colors border ${
                            isSelected
                              ? "bg-primary/10 border-primary/30"
                              : "hover:bg-muted/50 border-transparent"
                          }`}
                        >
                          <div className={`p-1 rounded ${meta.bg} shrink-0`}>
                            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[12px] font-medium truncate ${isSelected ? "text-primary" : ""}`}>
                                {meta.label}
                              </span>
                              {signalChip(sig, "xs")}
                            </div>
                            {headlineByAgent[r.agent_name] && (
                              <div className="text-[10px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">
                                {headlineByAgent[r.agent_name]}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {r.status === "completed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : r.status === "running" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                            ) : r.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-full border border-border" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Report content */}
        <div className="flex-1 overflow-y-auto">
          {selectedReport?.report_content && selectedMeta && SelectedIcon ? (
            <div className="max-w-3xl mx-auto p-6">
              <div className={`rounded-xl border border-border/50 ${selectedMeta.bg} p-4 mb-5 flex items-start gap-4`}>
                <div className="p-2.5 rounded-lg bg-background/60">
                  <SelectedIcon className={`h-6 w-6 ${selectedMeta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold">{selectedMeta.label}</h2>
                    {signalChip(signalByAgent[selectedReport.agent_name])}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {GROUP_LABELS[selectedReport.agent_group]}
                    </span>
                    <div className="ml-auto">
                      <InfoPopover
                        title={`Ask AI about the ${selectedMeta.label} report`}
                        description={`This ${selectedMeta.label} report covers ${analysis.ticker}. Click to ask anything about its findings, methodology, or conclusions.`}
                        sectionContext={`User is reading the ${selectedMeta.label} report from a multi-agent deep analysis on ${analysis.ticker} (decision: ${analysis.decision}, confidence: ${analysis.confidence}). REPORT CONTENT:\n\n${(selectedReport.report_content || "").slice(0, 4000)}\n\nAnswer the user's question about THIS report. Reference specific numbers, signals, and reasoning from the report. Keep answers concise (under 150 words) and decision-useful.`}
                        size="md"
                      />
                    </div>
                  </div>
                  {headlineByAgent[selectedReport.agent_name] && (
                    <p className="text-xs text-foreground/70 mt-1 leading-snug">
                      {headlineByAgent[selectedReport.agent_name]}
                    </p>
                  )}
                  {selectedReport.completed_at && selectedReport.started_at && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5">
                      <Zap className="h-3 w-3" />
                      Generated in{" "}
                      {Math.max(
                        1,
                        Math.round(
                          (new Date(selectedReport.completed_at).getTime() -
                            new Date(selectedReport.started_at).getTime()) /
                            1000,
                        ),
                      )}
                      s
                    </div>
                  )}
                </div>
              </div>

              <HighlightAskProvider
                contextLabel={`${selectedMeta.label} report on ${analysis.ticker} (decision ${analysis.decision}, ${analysis.confidence} confidence)`}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5 prose-strong:text-foreground">
                  <ReactMarkdown>{selectedReport.report_content}</ReactMarkdown>
                </div>
              </HighlightAskProvider>
            </div>
          ) : selectedReport?.status === "running" ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p>Agent is analyzing...</p>
            </div>
          ) : selectedReport?.error_message ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
              <XCircle className="h-8 w-8 mb-3" />
              <p>Agent failed: {selectedReport.error_message}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Activity className="h-8 w-8 mb-3 opacity-30" />
              <p>Select an agent to view their report</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
