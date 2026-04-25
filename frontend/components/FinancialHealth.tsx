"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Activity,
  TrendingUp,
  Shield,
  Target,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { InfoPopover } from "@/components/InfoPopover";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Breakdown {
  label: string;
  score: number;
  max: number;
  tip: string;
}

interface HealthData {
  score: number;
  grade: string;
  color: string;
  breakdown: Breakdown[];
  insights: string[];
  stats: {
    documents_uploaded: number;
    total_documents: number;
    asset_classes_used: number;
    total_asset_classes: number;
    total_assets: number;
  };
}

const BREAKDOWN_ICONS: Record<string, React.ReactNode> = {
  Documents: <Shield className="h-4 w-4" />,
  Diversification: <TrendingUp className="h-4 w-4" />,
  Profile: <Activity className="h-4 w-4" />,
  "Goals & Planning": <Target className="h-4 w-4" />,
};

export function FinancialHealth() {
  const { token } = useAuth();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();
  }, [token]);

  if (loading) {
    return (
      <div className="p-6 rounded-xl border border-border animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  if (!data) return null;

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (data.score / 100) * circumference;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Financial Health</h2>
          <InfoPopover
            title="Financial Health"
            description="Your financial health score measures how well-organized your finances are in Paloor. It goes up as you upload documents, diversify assets, complete your profile, and set goals."
            tips={[
              "Upload documents like W-2s and tax returns to boost your score",
              "Add assets across different classes for diversification points",
              "Complete your profile and set financial goals for the full 100",
            ]}
            sectionContext="Financial Health"
            size="sm"
          />
        </div>
        <button
          onClick={fetchHealth}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Score ring + grade */}
      <div className="px-5 py-6 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128">
            {/* Background ring */}
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            {/* Score ring */}
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke={data.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 64 64)"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums">
              {data.score}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              / 100
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-2"
            style={{
              backgroundColor: data.color + "18",
              color: data.color,
            }}
          >
            {data.grade}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {data.stats.documents_uploaded}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Docs
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {data.stats.total_assets}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Assets
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {data.stats.asset_classes_used}/{data.stats.total_asset_classes}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Classes
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="px-5 pb-4 space-y-3">
        {data.breakdown.map((b) => {
          const pct = Math.round((b.score / b.max) * 100);
          return (
            <div key={b.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {BREAKDOWN_ICONS[b.label] || null}
                  </span>
                  <span className="text-xs font-medium">{b.label}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {b.score}/{b.max}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor:
                      pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {b.tip}
              </p>
            </div>
          );
        })}
      </div>

      {/* Insights */}
      {data.insights.length > 0 && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium">Insights</span>
          </div>
          <ul className="space-y-1.5">
            {data.insights.map((ins, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground pl-5 relative before:content-['•'] before:absolute before:left-1.5 before:text-amber-400"
              >
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
