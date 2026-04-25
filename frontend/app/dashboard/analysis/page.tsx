"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  BarChart3,
  Loader2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Analysis {
  id: string;
  ticker: string;
  status: string;
  decision: string | null;
  confidence: string | null;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
  duration_secs: number | null;
  conversation_id: string | null;
}

export default function AnalysisListPage() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  const hdrs = useCallback(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/analysis`, { headers: hdrs() });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        setAnalyses(data.analyses || []);
      } catch (e) {
        console.error("Failed to load analyses:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, hdrs, logout]);

  const decisionIcon = (d: string | null) => {
    if (d === "BUY") return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (d === "SELL") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-yellow-500" />;
  };

  const decisionColor = (d: string | null) => {
    if (d === "BUY") return "bg-green-500/10 text-green-600 border-green-500/20";
    if (d === "SELL") return "bg-red-500/10 text-red-600 border-red-500/20";
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Deep Analysis Reports</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Comprehensive multi-agent trading analyses powered by 8 specialized AI agents.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : analyses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No analyses yet</p>
          <p className="text-sm mt-1">
            Ask Paloor AI to analyze a stock — e.g. &quot;Should I buy AAPL?&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => (
            <button
              key={a.id}
              onClick={() => router.push(`/dashboard/analysis/${a.id}`)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{a.ticker}</span>
                  {a.decision && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${decisionColor(a.decision)}`}
                    >
                      {decisionIcon(a.decision)}
                      {a.decision}
                    </span>
                  )}
                  {a.confidence && (
                    <span className="text-xs text-muted-foreground">
                      {a.confidence} confidence
                    </span>
                  )}
                  {a.status === "running" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running
                    </span>
                  )}
                </div>
                {a.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{new Date(a.created_at).toLocaleDateString()}</span>
                  {a.duration_secs && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.round(a.duration_secs)}s
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
