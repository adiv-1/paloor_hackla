"use client";

import { useEffect, useState } from "react";
import { useAdminAuth, adminFetch } from "@/lib/admin-auth";
import { AdminInfoPopover } from "@/components/AdminInfoPopover";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
} from "lucide-react";
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
} from "recharts";

interface RevenueEntry {
  id: string;
  entry_type: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  created_by: string;
  created_by_name: string;
  created_at: number;
}

interface RevenueSummary {
  total_revenue: number;
  total_cost: number;
  net: number;
  by_category: Record<string, number>;
  by_month?: { month: string; revenue: number; costs: number }[];
}

const COLORS = ["#1a6b55", "#2d8a6e", "#3da987", "#6bc4a6", "#a0dcc5", "#c7e8db", "#d4544a", "#e87c73", "#f5a39c"];

export default function RevenuePage() {
  const { token } = useAdminAuth();
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    entry_type: string;
    category: string;
    amount: string;
    description: string;
    date: string;
  }>({
    entry_type: "revenue",
    category: "",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (!token) return;
    Promise.all([
      adminFetch(token, "/api/admin/revenue").then((r) => r.json()),
      adminFetch(token, "/api/admin/revenue/summary").then((r) => r.json()),
    ]).then(([ent, sum]) => {
      setEntries(ent);
      setSummary(sum);
      setLoading(false);
    });
  }, [token]);

  async function addEntry() {
    if (!token || !form.category || !form.amount) return;
    const res = await adminFetch(token, "/api/admin/revenue", {
      method: "POST",
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev: RevenueEntry[]) => [entry as RevenueEntry, ...prev]);
      setShowForm(false);
      setForm({ entry_type: "revenue", category: "", amount: "", description: "", date: new Date().toISOString().split("T")[0] });
      adminFetch(token, "/api/admin/revenue/summary")
        .then((r) => r.json())
        .then(setSummary);
    }
  }

  const fmt = (n: number | undefined | null) => {
    if (n == null || isNaN(n)) return "$0";
    return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
  };

  const categoryData = summary
    ? Object.entries(summary.by_category).map(([name, value]) => ({ name, value: Math.abs(value as number) }))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Revenue & Costs</h1>
          <p className="text-sm text-muted-foreground mt-1">Track inflows, outflows, and financial health</p>
        </div>
        <div className="flex items-center gap-3">
          <AdminInfoPopover
            title="Revenue Tracking"
            description="Log all revenue and costs manually. Categories help segment your P&L."
            tips={["Categories: subscriptions, services, ads, hosting, apis, salary, marketing, etc.", "Only super admins can add entries"]}
          />
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SummaryCard icon={TrendingUp} label="Total Revenue" value={fmt(summary.total_revenue)} color="text-primary" bgColor="bg-primary/10" />
          <SummaryCard icon={TrendingDown} label="Total Costs" value={fmt(summary.total_cost)} color="text-destructive" bgColor="bg-destructive/10" />
          <SummaryCard icon={DollarSign} label="Net" value={fmt(summary.net)} color={summary.net >= 0 ? "text-primary" : "text-destructive"} bgColor={summary.net >= 0 ? "bg-primary/10" : "bg-destructive/10"} />
        </div>
      )}

      {/* Add Entry Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-medium mb-3">New Entry</h3>
          <div className="grid grid-cols-5 gap-3">
            <select value={form.entry_type} onChange={(e) => setForm((f) => ({ ...f, entry_type: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-sm">
              <option value="revenue">Revenue</option>
              <option value="cost">Cost</option>
            </select>
            <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Category" className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount" className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted">Cancel</button>
            <button onClick={addEntry} disabled={!form.category || !form.amount} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {/* Charts Row */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Monthly Trends</h3>
            {(summary.by_month ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={summary.by_month ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(v: any) => [`$${typeof v === 'number' ? v.toLocaleString() : ''}`, ""]}
                  />
                  <Bar dataKey="revenue" fill="#1a6b55" radius={[3, 3, 0, 0]} name="Revenue" />
                  <Bar dataKey="costs" fill="#d4544a" radius={[3, 3, 0, 0]} name="Costs" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data yet</div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">By Category</h3>
            {categoryData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: any) => [`$${typeof v === 'number' ? v.toLocaleString() : ''}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {categoryData.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground capitalize">{c.name}</span>
                      </div>
                      <span className="font-mono">${c.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data yet</div>
            )}
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-medium">All Entries</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Category</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Description</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Amount</th>
              <th className="text-right px-5 py-2.5 font-medium text-muted-foreground text-xs">By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e: RevenueEntry) => (
              <tr key={e.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="px-5 py-2.5 text-muted-foreground">{e.date}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${e.entry_type === "revenue" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {e.entry_type}
                  </span>
                </td>
                <td className="px-3 py-2.5 capitalize">{e.category}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{e.description || "—"}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${e.entry_type === "revenue" ? "text-primary" : "text-destructive"}`}>
                  {e.entry_type === "revenue" ? "+" : "−"}${e.amount.toLocaleString()}
                </td>
                <td className="px-5 py-2.5 text-right text-muted-foreground text-xs">{e.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No entries yet — click &ldquo;Add Entry&rdquo; to start tracking
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color, bgColor }: { icon: any; label: string; value: string; color: string; bgColor: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold font-serif">{value}</p>
      </div>
    </div>
  );
}
