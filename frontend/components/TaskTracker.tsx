"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  EyeOff,
  Trophy,
  Sparkles,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Task {
  id: string;
  title: string;
  description: string;
  href: string;
  category: string;
  check: (data: AppData) => boolean;
}

interface AppData {
  accountDocs: { key: string; status: string }[];
  vehicles: { id: string }[];
  // extend as needed
}

const TASKS: Task[] = [
  {
    id: "upload_dl",
    title: "Upload your Driver's License",
    description:
      "Your DL is used across vehicle and identity checklists. Upload once, linked everywhere.",
    href: "/dashboard/account",
    category: "Identity",
    check: (d) =>
      d.accountDocs.some(
        (x) => x.key === "drivers_license" && x.status === "uploaded",
      ),
  },
  {
    id: "upload_passport",
    title: "Upload your Passport",
    description:
      "International travel docs help complete your identity profile.",
    href: "/dashboard/account",
    category: "Identity",
    check: (d) =>
      d.accountDocs.some(
        (x) => x.key === "passport" && x.status === "uploaded",
      ),
  },
  {
    id: "upload_ssn",
    title: "Upload your SSN Card",
    description: "Needed for tax-related documents and financial accounts.",
    href: "/dashboard/account",
    category: "Identity",
    check: (d) =>
      d.accountDocs.some(
        (x) => x.key === "ssn_card" && x.status === "uploaded",
      ),
  },
  {
    id: "upload_govid",
    title: "Upload a Government ID",
    description: "State ID or other government-issued identification.",
    href: "/dashboard/account",
    category: "Identity",
    check: (d) =>
      d.accountDocs.some(
        (x) => x.key === "government_id" && x.status === "uploaded",
      ),
  },
  {
    id: "add_vehicle",
    title: "Add your first vehicle",
    description:
      "Track your vehicle's title, registration, insurance, and loan in one place.",
    href: "/dashboard/assets/vehicles",
    category: "Vehicles",
    check: (d) => d.vehicles.length > 0,
  },
  {
    id: "explore_portfolio",
    title: "Explore Portfolio Analysis",
    description:
      "See how your asset allocation compares to the efficient frontier.",
    href: "/dashboard/portfolio",
    category: "Insights",
    check: () => false, // manual/dismissible only
  },
];

const ENGAGEMENT = [
  {
    min: 0,
    message:
      "Let's get started — upload your first document to unlock insights.",
  },
  {
    min: 1,
    message:
      "Great start! Each document gives Paloor more context about your financial picture.",
  },
  { min: 3, message: "You're building a solid foundation. Keep going!" },
  {
    min: 5,
    message: "Almost there — you're ahead of most users at this stage.",
  },
];

function getMessage(completed: number): string {
  let msg = ENGAGEMENT[0].message;
  for (const e of ENGAGEMENT) {
    if (completed >= e.min) msg = e.message;
  }
  return msg;
}

export function TaskTracker() {
  const [data, setData] = useState<AppData | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("paloor_dismissed_tasks");
    if (stored) {
      try {
        setDismissed(new Set(JSON.parse(stored)));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, vehRes] = await Promise.all([
        fetch(`${API}/api/account/documents`),
        fetch(`${API}/api/assets?asset_class=vehicles`),
      ]);
      const accountDocs = accRes.ok ? await accRes.json() : [];
      const vehicles = vehRes.ok ? await vehRes.json() : [];
      setData({ accountDocs, vehicles });
    } catch {
      setData({ accountDocs: [], vehicles: [] });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dismiss = (taskId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      localStorage.setItem("paloor_dismissed_tasks", JSON.stringify([...next]));
      return next;
    });
  };

  if (!data) return null;

  const activeTasks = TASKS.filter((t) => !dismissed.has(t.id));
  const completedCount = activeTasks.filter((t) => t.check(data)).length;
  const totalActive = activeTasks.length;
  const allDone = totalActive === 0 || completedCount === totalActive;
  const progress = totalActive > 0 ? (completedCount / totalActive) * 100 : 100;

  if (allDone && totalActive === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {allDone ? (
              <Trophy size={16} className="text-amber-500" />
            ) : (
              <Sparkles size={16} className="text-primary" />
            )}
            <h2 className="text-sm font-semibold">
              {allDone ? "All caught up!" : "Get the most out of Paloor"}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {completedCount}/{totalActive}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {allDone
            ? "You've completed all onboarding tasks. Your vault is looking solid."
            : getMessage(completedCount)}
        </p>
      </div>

      {/* Task list */}
      <div className="divide-y divide-border">
        {activeTasks.map((task) => {
          const done = task.check(data);
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 px-5 py-3 group"
            >
              {done ? (
                <CheckCircle2 size={16} className="text-primary shrink-0" />
              ) : (
                <Circle
                  size={16}
                  className="text-muted-foreground/40 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}
                >
                  {task.title}
                </span>
                <p className="text-xs text-muted-foreground truncate">
                  {task.description}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {!done && (
                  <>
                    <button
                      onClick={() => dismiss(task.id)}
                      title="Don't have it"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                      <EyeOff size={13} />
                    </button>
                    <Link
                      href={task.href}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                      <ChevronRight size={13} />
                    </Link>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
