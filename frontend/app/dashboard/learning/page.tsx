"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LessonEngine } from "@/components/lesson/LessonEngine";
import { RETURNS_MODULE } from "@/lib/modules/returns";
import { DIVERSIFICATION_MODULE } from "@/lib/modules/diversification";
import type { LessonModule } from "@/lib/modules/types";
import { Lock, CheckCircle2, Clock, Flame, Sparkles } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const MODULES: LessonModule[] = [RETURNS_MODULE, DIVERSIFICATION_MODULE];

interface ProgressItem {
  module_id: string;
  current_step: number;
  completed_at: string | null;
  credits_earned: number;
  streak_days: number;
}

export default function LearningPage() {
  const { token } = useAuth();
  const [active, setActive] = useState<LessonModule | null>(null);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [credits, setCredits] = useState(0);
  const [justEarned, setJustEarned] = useState<{ awarded: number; multiplier: number } | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/learn/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setProgress(json.items || []);
      setCredits(json.total_credits || 0);
    } catch {}
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function getProgressFor(moduleId: string): ProgressItem | undefined {
    return progress.find((p) => p.module_id === moduleId);
  }

  function isLocked(m: LessonModule): boolean {
    if (!m.requires) return false;
    const req = getProgressFor(m.requires);
    return !req?.completed_at;
  }

  if (active) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <LessonEngine
          module={active}
          onExit={() => {
            setActive(null);
            refresh();
          }}
          onComplete={(awarded, multiplier) => {
            setJustEarned({ awarded, multiplier });
            setActive(null);
            refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <div className="text-[10px] uppercase tracking-wider text-primary">Learning</div>
          <h1 className="mt-1 text-3xl font-semibold">Core Loop</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Short blocks. Real interactions. A tutor that talks like a friend.
            Finish a module to unlock product features and earn AI time you can use anywhere on Paloor.
          </p>
        </header>

        <CompoundClock credits={credits} progress={progress} />

        {justEarned && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            <span>
              You earned <strong>+{justEarned.awarded} days</strong> of AI credit
              {justEarned.multiplier > 1 ? ` (${justEarned.multiplier.toFixed(1)}x streak bonus)` : ""}.
            </span>
            <button
              onClick={() => setJustEarned(null)}
              className="ml-auto text-xs text-primary/70 hover:text-primary"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {MODULES.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              progress={getProgressFor(m.id)}
              locked={isLocked(m)}
              onStart={() => setActive(m)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CompoundClock({ credits, progress }: { credits: number; progress: ProgressItem[] }) {
  const completed = progress.filter((p) => p.completed_at).length;
  const streak = progress.reduce((max, p) => Math.max(max, p.streak_days || 0), 0);
  return (
    <div className="mb-8 grid grid-cols-3 gap-3">
      <Tile icon={<Clock className="h-4 w-4 text-primary" />} label="AI credit" value={`${credits} days`} />
      <Tile icon={<CheckCircle2 className="h-4 w-4 text-primary" />} label="Modules done" value={`${completed} / ${MODULES.length}`} />
      <Tile icon={<Flame className="h-4 w-4 text-amber-500" />} label="Streak" value={streak > 1 ? `${streak} in a row` : "—"} />
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-lg font-medium text-foreground">{value}</div>
    </div>
  );
}

function ModuleCard({
  module,
  progress,
  locked,
  onStart,
}: {
  module: LessonModule;
  progress?: ProgressItem;
  locked: boolean;
  onStart: () => void;
}) {
  const completed = !!progress?.completed_at;
  const inProgress = !completed && (progress?.current_step ?? 0) > 0;
  const stepCount = module.blocks.length;

  return (
    <div
      className={`rounded-xl border p-5 transition ${
        locked
          ? "border-border/50 bg-card/50 opacity-60"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{module.level}</div>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{module.title}</h3>
        </div>
        {completed && <CheckCircle2 className="h-5 w-5 text-primary" />}
        {locked && <Lock className="h-5 w-5 text-muted-foreground" />}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{module.subtitle}</p>

      <div className="mt-4 text-xs text-muted-foreground">
        {stepCount} blocks · ~{module.estimatedMinutes} min
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{
            width: completed ? "100%" : `${((progress?.current_step ?? 0) / stepCount) * 100}%`,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {locked
            ? `Unlock by completing ${module.requires}`
            : completed
            ? `Earned ${progress?.credits_earned ?? 0} days`
            : inProgress
            ? `Resume at step ${progress?.current_step ?? 0}`
            : "Not started"}
        </span>
      </div>

      <button
        onClick={onStart}
        disabled={locked}
        className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {completed ? "Review" : inProgress ? "Continue" : "Start"}
      </button>
    </div>
  );
}
