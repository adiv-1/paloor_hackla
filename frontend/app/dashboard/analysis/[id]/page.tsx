"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  ChevronDown,
  ChevronRight,
  User,
  BarChart3,
  Shield,
  Briefcase,
  Newspaper,
  LineChart,
  DollarSign,
  Scale,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Report {
  id: string;
  agent_name: string;
  agent_group: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  report_content: string | null;
  report_data: any;
  error_message: string | null;
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
  metadata: any;
  reports: Report[];
}

const AGENT_META: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  market_analyst: { label: "Market Analyst", icon: BarChart3, color: "text-blue-500" },
  technical_analyst: { label: "Technical Analyst", icon: LineChart, color: "text-purple-500" },
  fundamentals_analyst: { label: "Fundamentals Analyst", icon: DollarSign, color: "text-green-500" },
  news_analyst: { label: "News Analyst", icon: Newspaper, color: "text-orange-500" },
  bull_researcher: { label: "Bull/Bear Advocates", icon: Scale, color: "text-indigo-500" },
  research_evaluator: { label: "Research Evaluator", icon: Search, color: "text-cyan-500" },
  trader: { label: "Trader", icon: Briefcase, color: "text-emerald-500" },
  risk_analyst: { label: "Risk Analyst", icon: Shield, color: "text-red-500" },
  portfolio_manager: { label: "Portfolio Manager", icon: User, color: "text-amber-500" },
};

const GROUP_ORDER = ["analyst", "research", "trading", "risk", "verdict"];
const GROUP_LABELS: Record<string, string> = {
  analyst: "Phase 1: Analysis",
  research: "Phase 2: Research",
  trading: "Phase 3: Trading",
  risk: "Phase 4: Risk",
  verdict: "Phase 5: Verdict",
};

export default function AnalysisDetailPage() {
  const params = useParams();
  const analysisId = params.id as string;
  const router = useRouter();
  const { token, logout } = useAuth();

  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(GROUP_ORDER));

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
        // Auto-select portfolio manager or first completed report
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

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

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

  // Group reports by phase
  const groupedReports: Record<string, Report[]> = {};
  for (const r of analysis.reports) {
    if (!groupedReports[r.agent_group]) groupedReports[r.agent_group] = [];
    groupedReports[r.agent_group].push(r);
  }

  const decisionBadge = (d: string | null) => {
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
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-border/50 bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard/analysis")}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{analysis.ticker} Analysis</h1>
              {decisionBadge(analysis.decision)}
              {analysis.confidence && (
                <span className="text-sm text-muted-foreground">
                  {analysis.confidence} confidence
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{new Date(analysis.created_at).toLocaleString()}</span>
              {analysis.duration_secs && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {Math.round(analysis.duration_secs)}s
                </span>
              )}
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
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
          </div>
        </div>
        {analysis.summary && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
        )}
      </div>

      {/* Main content: sidebar + report */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent sidebar */}
        <div className="w-64 border-r border-border/50 bg-card/50 overflow-y-auto">
          <div className="p-3 space-y-1">
            {GROUP_ORDER.map((group) => {
              const reports = groupedReports[group];
              if (!reports) return null;
              const expanded = expandedGroups.has(group);

              return (
                <div key={group}>
                  <button
                    onClick={() => toggleGroup(group)}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {GROUP_LABELS[group] || group}
                  </button>

                  {expanded &&
                    reports.map((r) => {
                      const meta = AGENT_META[r.agent_name] || {
                        label: r.agent_name,
                        icon: User,
                        color: "text-muted-foreground",
                      };
                      const Icon = meta.icon;
                      const isSelected = selectedAgent === r.agent_name;

                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedAgent(r.agent_name)}
                          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted/50 text-foreground/80"
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                          <span className="truncate">{meta.label}</span>
                          <span className="ml-auto shrink-0">
                            {r.status === "completed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : r.status === "running" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                            ) : r.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-full border border-border" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Report content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedReport?.report_content ? (
            <div className="max-w-3xl mx-auto prose prose-sm dark:prose-invert">
              <div className="flex items-center gap-2 mb-4 not-prose">
                {(() => {
                  const meta = AGENT_META[selectedReport.agent_name] || {
                    label: selectedReport.agent_name,
                    icon: User,
                    color: "text-muted-foreground",
                  };
                  const Icon = meta.icon;
                  return (
                    <>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                      <h2 className="text-lg font-semibold">{meta.label} Report</h2>
                    </>
                  );
                })()}
              </div>
              <ReactMarkdown>{selectedReport.report_content}</ReactMarkdown>
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
              <BarChart3 className="h-8 w-8 mb-3 opacity-30" />
              <p>Select an agent to view their report</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
