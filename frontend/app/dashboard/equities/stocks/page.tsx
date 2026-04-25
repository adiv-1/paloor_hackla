"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  ArrowUpDown,
  TrendingUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Company {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  industry: string;
  market_cap: number | null;
  last_price_update: string | null;
  last_filing_update: string | null;
}

interface Stats {
  companies: number;
  companies_with_cik: number;
  financial_facts: number;
  companies_with_financials: number;
  price_data_rows: number;
  companies_with_prices: number;
}

type SortField = "ticker" | "name" | "sector";
type SortDir = "asc" | "desc";

export default function StocksPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [seeding, setSeeding] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchProgress, setFetchProgress] = useState("");
  const perPage = 50;

  // Load companies and stats
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [companiesRes, sectorsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/equities/v2/companies?per_page=1000`),
        fetch(`${API}/api/equities/v2/sectors`),
        fetch(`${API}/api/equities/v2/stats`),
      ]);
      const companiesData = await companiesRes.json();
      const sectorsData = await sectorsRes.json();
      const statsData = await statsRes.json();

      setCompanies(companiesData.companies || []);
      setSectors(sectorsData.sectors || []);
      setStats(statsData);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  // Seed companies
  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch(`${API}/api/equities/v2/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      await res.json();
      await loadData();
    } finally {
      setSeeding(false);
    }
  }

  // Fetch all financials
  async function handleFetchAll() {
    setFetchingAll(true);
    setFetchProgress("Starting batch fetch...");
    try {
      const res = await fetch(`${API}/api/equities/v2/fetch-financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: true }),
      });
      const data = await res.json();
      if (data.job_id) {
        // Poll for progress
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(
              `${API}/api/equities/v2/job-status/${data.job_id}`,
            );
            const status = await statusRes.json();
            if (status.status === "complete") {
              clearInterval(interval);
              setFetchingAll(false);
              setFetchProgress(
                `Done! ${status.success} succeeded, ${status.failed} failed`,
              );
              await loadData();
            } else {
              setFetchProgress(status.progress || "Processing...");
            }
          } catch {
            clearInterval(interval);
            setFetchingAll(false);
          }
        }, 2000);
      }
    } catch {
      setFetchingAll(false);
      setFetchProgress("Failed to start");
    }
  }

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...companies];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.ticker.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q),
      );
    }

    if (sectorFilter) {
      result = result.filter((c) => c.sector === sectorFilter);
    }

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [companies, search, sectorFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-foreground">
          S&P 500 Companies
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Financial statements from SEC EDGAR • Last 10 years
        </p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="w-3.5 h-3.5" />
              Companies
            </div>
            <p className="text-lg font-semibold">{stats.companies}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Database className="w-3.5 h-3.5" />
              Financial Facts
            </div>
            <p className="text-lg font-semibold">
              {stats.financial_facts.toLocaleString()}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              With Financials
            </div>
            <p className="text-lg font-semibold">
              {stats.companies_with_financials}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              With Prices
            </div>
            <p className="text-lg font-semibold">
              {stats.companies_with_prices}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-50"
        >
          {seeding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {seeding ? "Seeding..." : "Seed Companies"}
        </button>
        <button
          onClick={handleFetchAll}
          disabled={fetchingAll}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {fetchingAll ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Database className="w-3.5 h-3.5" />
          )}
          {fetchingAll ? "Fetching..." : "Fetch All Financials (EDGAR)"}
        </button>
        {fetchProgress && (
          <span className="inline-flex items-center text-xs text-muted-foreground">
            {fetchProgress}
          </span>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ticker or company name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => {
            setSectorFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-2">
        Showing {paged.length} of {filtered.length} companies
      </p>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th
                className="text-left px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("ticker")}
              >
                <div className="flex items-center gap-1">
                  Ticker
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Company
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground hidden md:table-cell"
                onClick={() => toggleSort("sector")}
              >
                <div className="flex items-center gap-1">
                  Sector
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                Data
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((company) => (
              <tr
                key={company.ticker}
                onClick={() =>
                  router.push(`/dashboard/equities/stocks/${company.ticker}`)
                }
                className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="tabular-nums font-semibold text-sm text-foreground">
                    {company.ticker}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground">
                    {company.name}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted/50 rounded-full">
                    {company.sector}
                  </span>
                </td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">
                  <div className="flex items-center justify-center gap-2">
                    {company.last_filing_update ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-card border border-border hover:bg-muted/50 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-card border border-border hover:bg-muted/50 disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
