"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  BarChart3,
  User,
  Search,
  LogOut,
  Receipt,
  Shield,
  Landmark,
  Bitcoin,
  CreditCard,
  TrendingUp,
  Wallet,
  GraduationCap,
  Activity,
  Layers,
  Bot,
  UserCheck,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const NAV: { href: string; label: string; icon: typeof BarChart3 }[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/assets", label: "Assets", icon: FolderOpen },
  { href: "/dashboard/learning", label: "Learning", icon: GraduationCap },
  { href: "/dashboard/simulator", label: "Simulator", icon: Activity },
  { href: "/dashboard/equities", label: "Equities", icon: TrendingUp },
  { href: "/dashboard/analysis", label: "Analysis", icon: Activity },
  { href: "/dashboard/account", label: "Account", icon: User },
];

const COMING_SOON: { label: string; icon: typeof BarChart3; href?: string }[] = [
  { label: "Cohorts", icon: UserCheck, href: "/dashboard/cohort" },
  { label: "Portfolio", icon: BarChart3, href: "/dashboard/portfolio" },
  { label: "Spending", icon: Wallet, href: "/dashboard/spending" },
  { label: "Tax Planning", icon: Receipt },
  { label: "ETF Builder", icon: Layers },
  { label: "Paloor Invests", icon: Bot },
  { label: "Insurance", icon: Shield },
  { label: "Estate Planning", icon: Landmark },
  { label: "Crypto & Digital", icon: Bitcoin },
  { label: "Debt Management", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isAdmin] = useState(
    () => typeof window !== "undefined" && !!window.localStorage.getItem("paloor_admin_token"),
  );
  const [showComingSoon, setShowComingSoon] = useState(false);

  const photoUrl = user?.photo_url ? `${API}${user.photo_url}` : null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-border bg-background flex flex-col">
      {/* Brand + Profile */}
      <div className="p-4 border-b border-border">
        <Link href="/dashboard" className="inline-block mb-4">
          <span className="font-serif text-xl font-semibold tracking-wide">
            Paloor
          </span>
        </Link>
        {user && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                const inp = document.getElementById("sidebar-photo-input");
                if (inp) inp.click();
              }}
              className="w-8 h-8 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0 hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer group relative"
              title="Change profile photo"
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt=""
                  fill
                  sizes="32px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center">
                <User className="h-3 w-3 text-white" />
              </div>
            </button>
            <input
              id="sidebar-photo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = "";
                const formData = new FormData();
                formData.append("file", file);
                try {
                  const token = localStorage.getItem("token");
                  const res = await fetch(`${API}/api/auth/photo`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                  });
                  if (res.ok) window.location.reload();
                } catch (err) {
                  console.error(err);
                }
              }}
            />
            <Link
              href="/dashboard/account"
              className="min-w-0 hover:opacity-80 transition-opacity"
            >
              <p className="text-sm font-medium truncate leading-tight">
                {user.name || "User"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Welcome back
              </p>
            </Link>
          </div>
        )}
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            )
          }
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] border border-border px-1 py-0.5 rounded font-mono">
            &#8984;K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-border">
          <button
            type="button"
            onClick={() => setShowComingSoon((prev) => !prev)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            {showComingSoon ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="flex-1 text-left">Coming Soon</span>
          </button>

          {showComingSoon && (
            <div className="mt-1 space-y-1">
              {COMING_SOON.map(({ label, icon: Icon, href }) => {
                const canClick = isAdmin && href;
                const active = canClick && pathname.startsWith(href!);
                const className = `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-accent text-foreground font-medium"
                    : canClick
                      ? "text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 cursor-pointer"
                      : "text-muted-foreground/50 cursor-default"
                }`;
                if (canClick) {
                  return (
                    <Link key={label} href={href!} className={className}>
                      <Icon size={16} />
                      <span className="flex-1">{label}</span>
                    </Link>
                  );
                }
                return (
                  <div key={label} className={className}>
                    <Icon size={16} />
                    <span className="flex-1">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <p className="text-[11px] text-muted-foreground font-mono">v0.10.0</p>
        </div>
        {user && (
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <LogOut size={13} />
            <span>Sign out</span>
            <span className="ml-auto truncate max-w-[80px] text-[10px]">
              {user.name || user.email}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
