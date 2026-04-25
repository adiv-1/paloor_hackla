"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/lib/admin-auth";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  UserCog,
  LogOut,
  Shield,
  Sun,
  Moon,
  ArrowLeft,
} from "lucide-react";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/dashboard/users", label: "Users & CRM", icon: Users },
  { href: "/admin/dashboard/revenue", label: "Revenue & Costs", icon: DollarSign },
  { href: "/admin/dashboard/employees", label: "Team", icon: UserCog },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdminAuth();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("paloor-theme", next ? "dark" : "light");
  }

  return (
    <aside className="fixed top-0 left-0 w-56 h-screen flex flex-col border-r border-border bg-card z-30">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-serif text-base font-semibold leading-tight">Paloor</h1>
            <span className="text-[10px] tracking-widest uppercase text-muted-foreground">Admin</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active =
            item.href === "/admin/dashboard"
              ? pathname === "/admin/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-border">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Back to App
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{admin?.email}</span>
          <button onClick={toggleTheme} className="p-1 rounded text-muted-foreground hover:text-foreground">
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {admin?.role === "super_admin" ? "Super Admin" : "Employee"}
          </span>
          <button
            onClick={() => { logout(); window.location.href = "/admin/login"; }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
