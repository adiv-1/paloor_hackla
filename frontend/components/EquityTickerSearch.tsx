"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
}

type EquityTickerSearchProps = {
  autoFocus?: boolean;
  className?: string;
  label?: string;
  limit?: number;
  placeholder?: string;
  variant?: "hero" | "compact";
};

export function EquityTickerSearch({
  autoFocus = false,
  className,
  label,
  limit = 12,
  placeholder = "Search by ticker or company name...",
  variant = "compact",
}: EquityTickerSearchProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIdx(-1);
      setShowDropdown(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API}/api/equities/v2/symbol-search?keywords=${encodeURIComponent(query.trim())}&limit=${limit}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const items: SearchResult[] = data.results || [];
        setResults(items);
        setShowDropdown(items.length > 0);
        setSelectedIdx(-1);
      } catch {
        if (!cancelled) {
          setResults([]);
          setShowDropdown(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [limit, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function navigateToTicker(rawTicker: string) {
    const nextTicker = rawTicker.trim().toUpperCase();
    if (!nextTicker) return;
    setShowDropdown(false);
    setQuery(nextTicker);
    router.push(`/dashboard/equities/stocks/${nextTicker}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || !results.length) {
      if (event.key === "Enter" && query.trim()) {
        navigateToTicker(query);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIdx((index) => Math.min(index + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIdx((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedIdx >= 0) {
        navigateToTicker(results[selectedIdx].symbol);
      } else if (results[0]) {
        navigateToTicker(results[0].symbol);
      }
      return;
    }

    if (event.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const isHero = variant === "hero";

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      {label ? (
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </label>
      ) : null}

      <div className="relative">
        <Search
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground",
            isHero ? "h-5 w-5" : "h-4 w-4",
          )}
        />
        <input
          type="text"
          aria-label={label || placeholder}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className={cn(
            "w-full border border-border/60 bg-card text-foreground transition-all focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/35",
            isHero
              ? "h-16 rounded-[1.15rem] pl-12 pr-12 text-base shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)]"
              : "h-11 rounded-xl pl-10 pr-10 text-sm shadow-sm",
          )}
        />
        {loading ? (
          <Loader2
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground",
              isHero ? "h-5 w-5" : "h-4 w-4",
            )}
          />
        ) : null}
      </div>

      {showDropdown && results.length > 0 ? (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 overflow-hidden border border-border/60 bg-card/95 backdrop-blur-sm",
            isHero
              ? "mt-3 rounded-[1.15rem] shadow-[0_24px_65px_-35px_rgba(15,23,42,0.5)]"
              : "mt-2 rounded-xl shadow-lg",
          )}
        >
          {results.map((result, index) => (
            <button
              key={`${result.symbol}-${result.region}`}
              type="button"
              onClick={() => navigateToTicker(result.symbol)}
              className={cn(
                "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
                index === selectedIdx ? "bg-muted/50" : "",
                index !== results.length - 1 ? "border-b border-border/40" : "",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)]">
                  <span
                    title={result.symbol}
                    className="min-w-0 truncate text-sm font-semibold tabular-nums text-foreground"
                  >
                    {result.symbol}
                  </span>
                  <span
                    title={result.name}
                    className="min-w-0 truncate text-sm text-foreground/90"
                  >
                    {result.name}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {result.type && result.type !== "Equity" ? (
                    <span className="hidden max-w-[8rem] truncate rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline-block">
                      {result.type}
                    </span>
                  ) : null}
                  {result.region ? (
                    <span
                      title={result.region}
                      className="max-w-[8rem] truncate rounded-full bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {result.region}
                    </span>
                  ) : null}
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}