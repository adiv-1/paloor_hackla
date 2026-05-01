"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Search,
  Users,
  Sparkles,
  Briefcase,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MarketplaceWM {
  id: string;
  user_id: string;
  user_name: string;
  firm_name: string | null;
  license_number: string | null;
  specializations: string[];
  bio: string | null;
  avatar_url: string | null;
  user_photo_url: string | null;
  is_verified: boolean;
  open_cohorts: number;
  created_at: string;
}

/** Prefer the user's uploaded photo over a seeded avatar URL. */
function resolveAvatar(wm: MarketplaceWM): string | null {
  if (wm.user_photo_url) {
    return wm.user_photo_url.startsWith("http")
      ? wm.user_photo_url
      : `${API}${wm.user_photo_url}`;
  }
  return wm.avatar_url || null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export default function MarketplacePage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [wms, setWms] = useState<MarketplaceWM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeSpec, setActiveSpec] = useState<string | null>(null);
  const [isCurrentUserWM, setIsCurrentUserWM] = useState(false);

  /* ── load marketplace listings ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/api/cohort/marketplace`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MarketplaceWM[] = await res.json();
        if (!cancelled) setWms(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load marketplace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── check if logged-in user is also a WM ── */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/cohort/wm/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setIsCurrentUserWM(Boolean(data.is_wealth_manager));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ── derive specialization filter pills ── */
  const allSpecs = useMemo(() => {
    const set = new Set<string>();
    for (const wm of wms) {
      for (const s of wm.specializations ?? []) set.add(s);
    }
    return Array.from(set).sort();
  }, [wms]);

  /* ── apply search + spec filter ── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wms.filter((wm) => {
      if (activeSpec && !wm.specializations?.includes(activeSpec)) return false;
      if (!q) return true;
      const haystack = [
        wm.user_name,
        wm.firm_name ?? "",
        wm.bio ?? "",
        ...(wm.specializations ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [wms, query, activeSpec]);

  const handleConnect = useCallback(
    (wm: MarketplaceWM) => {
      if (wm.open_cohorts > 0) {
        router.push("/dashboard/cohort");
      } else {
        // No open session — soft toast via alert (keeps deps minimal)
        alert(
          `${wm.user_name} doesn't have an open cohort session right now. Check back soon or browse other advisors.`,
        );
      }
    },
    [router],
  );

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Wealth Manager Marketplace
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse vetted advisors and join a cohort that fits your life stage.
          Sessions are anonymized — other members never see your name.
        </p>
      </div>

      {/* "You're listed" banner */}
      {isCurrentUserWM && (
        <div className="mb-6 p-3 rounded-lg border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm">
            <span className="font-medium">You&apos;re listed here.</span>{" "}
            Members of the Paloor community can find your profile in this
            marketplace.
          </p>
        </div>
      )}

      {/* CTA for non-WM users */}
      {!isCurrentUserWM && user && (
        <div className="mb-6 p-3 rounded-lg border border-border bg-accent/30 flex items-center justify-between gap-3">
          <p className="text-sm">
            Are you a financial advisor?{" "}
            <span className="text-muted-foreground">
              Register as a wealth manager and you&apos;ll be added to this
              marketplace.
            </span>
          </p>
          <button
            onClick={() => router.push("/dashboard/cohort")}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
          >
            Become a WM
          </button>
        </div>
      )}

      {/* Search + filter row */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, firm, or specialty…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Specialization pills */}
      {allSpecs.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveSpec(null)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              activeSpec === null
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-accent"
            }`}
          >
            All
          </button>
          {allSpecs.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSpec(s === activeSpec ? null : s)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                activeSpec === s
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading advisors…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 py-8">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No wealth managers match your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((wm) => {
            const isMe = user?.id === wm.user_id;
            return (
              <div
                key={wm.id}
                className={`rounded-xl border p-4 flex flex-col bg-card transition-shadow hover:shadow-md ${
                  isMe ? "border-emerald-400 ring-2 ring-emerald-200" : "border-border"
                }`}
              >
                {/* Avatar + name */}
                <div className="flex items-start gap-3">
                  {resolveAvatar(wm) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAvatar(wm) as string}
                      alt={wm.user_name}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {initials(wm.user_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-medium truncate">{wm.user_name}</h3>
                      {wm.is_verified && (
                        <ShieldCheck
                          className="h-4 w-4 text-emerald-600 shrink-0"
                          aria-label="Verified"
                        />
                      )}
                    </div>
                    {wm.firm_name && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {wm.firm_name}
                      </p>
                    )}
                    {wm.license_number && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {wm.license_number}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {wm.bio && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-3">
                    {wm.bio}
                  </p>
                )}

                {/* Specializations */}
                {wm.specializations && wm.specializations.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {wm.specializations.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-foreground/80"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer: open sessions + connect */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {wm.open_cohorts > 0
                      ? `${wm.open_cohorts} open session${wm.open_cohorts > 1 ? "s" : ""}`
                      : "No open sessions"}
                  </span>
                  <button
                    onClick={() => handleConnect(wm)}
                    disabled={isMe}
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isMe ? "That's you" : "Connect"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
