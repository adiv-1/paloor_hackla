"use client";

import React, { useState } from "react";
import {
  BarChart3,
  LineChart,
  DollarSign,
  Newspaper,
  Scale,
  Search,
  Briefcase,
  Shield,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Target,
  Activity,
  Clock,
  ArrowRight,
} from "lucide-react";

export interface AgentSummary {
  name: string;
  label: string;
  group: string;
  status: string;
  signal: string | null;
  headline: string;
}

export interface PMMetrics {
  entry?: string;
  target?: string;
  stop_loss?: string;
  time_horizon?: string;
  risk_rating?: string;
}

export interface AnalysisMeta {
  analysis_id: string;
  ticker: string;
  decision: string;
  confidence: string;
  agents?: AgentSummary[];
  metrics?: PMMetrics;
  duration_seconds?: number;
}

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  market_analyst: BarChart3,
  technical_analyst: LineChart,
  fundamentals_analyst: DollarSign,
  news_analyst: Newspaper,
  bull_researcher: Scale,
  research_evaluator: Search,
  trader: Briefcase,
  risk_analyst: Shield,
  portfolio_manager: User,
};

const AGENT_COLORS: Record<string, string> = {
  market_analyst: "text-blue-500",
  technical_analyst: "text-purple-500",
  fundamentals_analyst: "text-green-500",
  news_analyst: "text-orange-500",
  bull_researcher: "text-indigo-500",
  research_evaluator: "text-cyan-500",
  trader: "text-emerald-500",
  risk_analyst: "text-red-500",
  portfolio_manager: "text-amber-500",
};

const GROUP_LABELS: Record<string, string> = {
  analyst: "Phase 1 · Analysis",
  research: "Phase 2 · Research",
  trading: "Phase 3 · Trading",
  risk: "Phase 4 · Risk",
  verdict: "Phase 5 · Verdict",
};
const GROUP_ORDER = ["analyst", "research", "trading", "risk", "verdict"];

function signalBadge(signal: string | null): React.ReactNode {
  if (!signal) return null;
  const s = signal.toUpperCase();
  let cls = "bg-muted text-muted-foreground border-border";
  if (s === "BULLISH" || s === "BUY" || s.endsWith("HIGH CONF") || s === "HIGH CONF")
    cls = "bg-green-500/10 text-green-600 border-green-500/25";
  else if (s === "BEARISH" || s === "SELL")
    cls = "bg-red-500/10 text-red-600 border-red-500/25";
  else if (s === "NEUTRAL" || s === "HOLD")
    cls = "bg-yellow-500/10 text-yellow-600 border-yellow-500/25";
  else if (s === "LOW" || s === "VERY_HIGH" || s === "HIGH")
    cls = "bg-orange-500/10 text-orange-600 border-orange-500/25";
  else if (s === "MODERATE") cls = "bg-blue-500/10 text-blue-600 border-blue-500/25";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border ${cls}`}>
      {s.replace("_", " ")}
    </span>
  );
}

function decisionPill(decision: string): React.ReactNode {
  const up = decision.toUpperCase();
  if (up === "BUY")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-600 border border-green-500/25">
        <TrendingUp className="h-3 w-3" /> BUY
      </span>
    );
  if (up === "SELL")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 border border-red-500/25">
        <TrendingDown className="h-3 w-3" /> SELL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/25">
      <Minus className="h-3 w-3" /> HOLD
    </span>
  );
}

export default function AnalysisBreakdown({ analysis }: { analysis: AnalysisMeta }) {
  const [expanded, setExpanded] = useState(true);
  const agents = analysis.agents || [];
  const metrics = analysis.metrics || {};

  // Group by phase
  const grouped: Record<string, AgentSummary[]> = {};
  for (const a of agents) (grouped[a.group] ||= []).push(a);

  const completedCount = agents.filter((a) => a.status === "completed").length;

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-card/60 overflow-hidden text-sm">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/50 bg-muted/30 flex items-center gap-2 flex-wrap">
        <Activity className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold">{analysis.ticker} Multi-Agent Verdict</span>
        {decisionPill(analysis.decision)}
        <span className="text-[11px] text-muted-foreground">
          {analysis.confidence} confidence
        </span>
        {analysis.duration_seconds ? (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {Math.round(analysis.duration_seconds)}s
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {completedCount}/{agents.length} agents
        </span>
      </div>

      {/* Key metrics row */}
      {(metrics.entry || metrics.target || metrics.stop_loss || metrics.time_horizon || metrics.risk_rating) && (
        <div className="px-3 py-2 border-b border-border/50 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
          {metrics.entry && (
            <div>
              <div className="text-muted-foreground">Entry</div>
              <div className="font-semibold">${metrics.entry}</div>
            </div>
          )}
          {metrics.target && (
            <div>
              <div className="text-muted-foreground">Target</div>
              <div className="font-semibold text-green-600">${metrics.target}</div>
            </div>
          )}
          {metrics.stop_loss && (
            <div>
              <div className="text-muted-foreground">Stop</div>
              <div className="font-semibold text-red-600">${metrics.stop_loss}</div>
            </div>
          )}
          {metrics.time_horizon && (
            <div>
              <div className="text-muted-foreground">Horizon</div>
              <div className="font-semibold">{metrics.time_horizon}</div>
            </div>
          )}
          {metrics.risk_rating && (
            <div>
              <div className="text-muted-foreground">Risk</div>
              <div className="font-semibold">{metrics.risk_rating}</div>
            </div>
          )}
        </div>
      )}

      {/* Toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1 border-b border-border/40"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? "Hide" : "Show"} agent-by-agent breakdown
      </button>

      {/* Agents */}
      {expanded && (
        <div className="p-2 space-y-2.5">
          {GROUP_ORDER.map((g) => {
            const list = grouped[g];
            if (!list?.length) return null;
            return (
              <div key={g}>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {GROUP_LABELS[g]}
                </div>
                <div className="space-y-1">
                  {list.map((a) => {
                    const Icon = AGENT_ICONS[a.name] || User;
                    const color = AGENT_COLORS[a.name] || "text-muted-foreground";
                    return (
                      <div
                        key={a.name}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-background/60 border border-border/40"
                      >
                        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-xs">{a.label}</span>
                            {signalBadge(a.signal)}
                            {a.status === "failed" && (
                              <XCircle className="h-3 w-3 text-red-500" />
                            )}
                            {a.status === "completed" && (
                              <CheckCircle2 className="h-3 w-3 text-green-500/70" />
                            )}
                          </div>
                          {a.headline && (
                            <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                              {a.headline}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link to full report */}
      <a
        href={`/dashboard/analysis/${analysis.analysis_id}`}
        className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors text-xs font-medium text-primary"
      >
        <span className="inline-flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Open full {analysis.ticker} report with all agent details
        </span>
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
