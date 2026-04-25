"use client";

import { useEffect, useState } from "react";
import { useAdminAuth, adminFetch } from "@/lib/admin-auth";
import { AdminInfoPopover } from "@/components/AdminInfoPopover";
import {
  Users,
  MessageSquare,
  Brain,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Landmark,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Analytics {
  users: { total: number; verified: number; profile_completed: number };
  engagement: { total_conversations: number; total_messages: number; ai_messages: number; user_messages: number };
  memory: { total_memories: number; total_document_chunks: number };
  aum: { total_aum: number; by_type: Record<string, number> };
  revenue: { total_revenue: number; total_cost: number; net: number; by_category: Record<string, { revenue: number; cost: number }> };
}

const COLORS = ["#1a6b55", "#c27a3e", "#5b6abf", "#c25b7e", "#7b9e6b", "#8b5cf6", "#06b6d4"];

const STATE_COORDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -152.5], AZ: [34.0, -111.1], AR: [35.2, -91.8],
  CA: [36.8, -119.4], CO: [39.1, -105.4], CT: [41.6, -72.7], DE: [38.9, -75.5],
  FL: [27.6, -81.5], GA: [32.2, -83.6], HI: [19.9, -155.6], ID: [44.1, -114.7],
  IL: [40.3, -89.0], IN: [40.3, -86.1], IA: [42.0, -93.2], KS: [38.5, -98.8],
  KY: [37.7, -84.3], LA: [31.2, -92.1], ME: [45.3, -69.4], MD: [39.0, -76.6],
  MA: [42.4, -71.4], MI: [44.3, -85.6], MN: [46.7, -94.7], MS: [32.7, -89.5],
  MO: [38.6, -91.8], MT: [46.8, -110.4], NE: [41.1, -99.8], NV: [38.8, -116.4],
  NH: [43.2, -71.6], NJ: [40.1, -74.5], NM: [34.5, -105.9], NY: [40.7, -74.0],
  NC: [35.8, -79.0], ND: [47.5, -100.5], OH: [40.4, -82.9], OK: [35.0, -97.1],
  OR: [43.8, -120.6], PA: [41.2, -77.2], RI: [41.6, -71.5], SC: [34.0, -81.0],
  SD: [43.9, -99.4], TN: [35.5, -86.6], TX: [31.9, -99.9], UT: [39.3, -111.1],
  VT: [44.6, -72.6], VA: [37.4, -78.7], WA: [47.8, -120.7], WV: [38.9, -80.2],
  WI: [43.8, -88.8], WY: [43.1, -107.6], DC: [38.9, -77.0],
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function AdminDashboard() {
  const { token } = useAdminAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [demographics, setDemographics] = useState<any>(null);
  const [userMap, setUserMap] = useState<{ state: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      adminFetch(token, "/api/admin/analytics").then((r) => r.json()),
      adminFetch(token, "/api/admin/analytics/demographics").then((r) => r.json()),
      adminFetch(token, "/api/admin/analytics/map").then((r) => r.json()),
    ])
      .then(([a, d, m]) => {
        setAnalytics(a);
        setDemographics(d);
        setUserMap(m);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const users = analytics.users ?? { total: 0, verified: 0, profile_completed: 0 };
  const engagement = analytics.engagement ?? { total_conversations: 0, total_messages: 0, ai_messages: 0, user_messages: 0 };
  const memory = analytics.memory ?? { total_memories: 0, total_document_chunks: 0 };
  const aum = analytics.aum ?? { total_aum: 0, by_type: {} };
  const revenue = analytics.revenue ?? { total_revenue: 0, total_cost: 0, net: 0, by_category: {} };

  const riskData = demographics?.risk_distribution || [];
  const incomeData = demographics?.income_distribution || [];
  const ageData = demographics?.age_distribution || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform overview and key metrics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={Users}
          label="Total Users"
          value={users.total.toString()}
          sub={`${users.verified} verified, ${users.profile_completed} profiled`}
          info={{ title: "User Metrics", description: "Total registered users on the platform. Verified means email confirmed. Profiled means they completed their financial profile." }}
        />
        <KPICard
          icon={MessageSquare}
          label="Conversations"
          value={engagement.total_conversations.toString()}
          sub={`${engagement.total_messages} messages (${engagement.ai_messages} AI)`}
          info={{ title: "Chat Engagement", description: "Total AI chat conversations and messages. Higher AI message count indicates users are actively using the AI advisor." }}
        />
        <KPICard
          icon={Brain}
          label="AI Memories"
          value={memory.total_memories.toString()}
          sub={`${memory.total_document_chunks} doc chunks indexed`}
          info={{ title: "Memory System", description: "Facts the AI has learned about users from conversations and document uploads. More memories = more personalized AI advice." }}
        />
        <KPICard
          icon={Landmark}
          label="Total AUM"
          value={fmt(aum.total_aum)}
          sub={`${Object.keys(aum.by_type).length} account types`}
          info={{ title: "Assets Under Management", description: "Sum of all linked account balances across all users. This is self-reported or bank-synced data." }}
        />
      </div>

      {/* Revenue Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4 text-primary" /> Revenue
          </div>
          <p className="text-2xl font-semibold font-serif">{fmt(revenue.total_revenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingDown className="w-4 h-4 text-destructive" /> Costs
          </div>
          <p className="text-2xl font-semibold font-serif">{fmt(revenue.total_cost)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4" /> Net
          </div>
          <p className={`text-2xl font-semibold font-serif ${revenue.net >= 0 ? "text-primary" : "text-destructive"}`}>
            {fmt(revenue.net)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {riskData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-medium">Risk Tolerance Distribution</h3>
              <AdminInfoPopover title="Risk Tolerance" description="How users self-reported their risk tolerance during profile setup." />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskData} dataKey="count" nameKey="risk_tolerance" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
                  {riskData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {incomeData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-medium">Income Distribution</h3>
              <AdminInfoPopover title="Annual Income" description="Self-reported annual income ranges from user profiles." />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={incomeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="annual_income" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* User Map */}
      {userMap.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">User Locations</h3>
            <AdminInfoPopover title="User Map" description="Geographic distribution of users based on the state they provided in their profile." />
          </div>
          <div className="relative bg-muted rounded-lg overflow-hidden" style={{ height: 300 }}>
            <svg viewBox="0 0 960 600" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              <rect x="0" y="0" width="960" height="600" fill="transparent" />
              {userMap.map((s) => {
                const coords = STATE_COORDS[s.state];
                if (!coords) return null;
                const x = ((coords[1] + 130) / 65) * 900 + 30;
                const y = ((50 - coords[0]) / 30) * 500 + 50;
                const r = Math.min(Math.max(s.count * 5, 6), 30);
                return (
                  <g key={s.state}>
                    <circle cx={x} cy={y} r={r} fill="var(--chart-1)" opacity={0.6} />
                    <circle cx={x} cy={y} r={3} fill="var(--chart-1)" />
                    <text x={x} y={y - r - 4} textAnchor="middle" fontSize={10} fill="currentColor">
                      {s.state} ({s.count})
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Age Distribution */}
      {ageData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-medium">Age Distribution</h3>
            <AdminInfoPopover title="User Ages" description="Age breakdown of users. Helps understand which demographic is using the platform most." />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="age_group" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  info,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  info: { title: string; description: string };
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <AdminInfoPopover title={info.title} description={info.description} />
      </div>
      <p className="text-2xl font-semibold font-serif">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
