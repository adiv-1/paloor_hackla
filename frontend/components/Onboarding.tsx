"use client";

import { useState, useEffect } from "react";
import {
  ArrowRight,
  FolderOpen,
  Shield,
  BarChart3,
  Sparkles,
  Brain,
} from "lucide-react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type StepKind = "info" | "ai-level" | "assessment";

interface InfoStep {
  kind: "info";
  icon: typeof FolderOpen;
  title: string;
  body: string;
}

const INFO_STEPS: InfoStep[] = [
  {
    kind: "info",
    icon: FolderOpen,
    title: "Organize every asset you own",
    body: "Vehicles, property, investments. Each one gets a structured checklist of the documents that matter. No more hunting through email or filing cabinets.",
  },
  {
    kind: "info",
    icon: Shield,
    title: "Upload once, link everywhere",
    body: "Your driver's license, passport, and government ID live in one place. When an asset needs them, they're already there.",
  },
  {
    kind: "info",
    icon: BarChart3,
    title: "See the full picture",
    body: "Portfolio analytics, net worth tracking, and tax intelligence — all built on top of your real documents, not manual inputs.",
  },
];

const AI_LEVELS = [
  {
    value: "beginner",
    label: "Beginner",
    desc: "Plain language, no jargon. Walk me through everything.",
  },
  {
    value: "retail",
    label: "Retail Investor",
    desc: "Practical and concise. Some terms are okay.",
  },
  {
    value: "pro",
    label: "Professional",
    desc: "Use full finance terminology. Be direct.",
  },
  {
    value: "institutional",
    label: "Institutional",
    desc: "Deep, quantitative. Show me the numbers.",
  },
  {
    value: "cfa",
    label: "CFA / Advanced",
    desc: "Full rigor. No simplification.",
  },
] as const;

// Order: 3 info steps → AI level → assessment CTA
const STEP_KINDS: StepKind[] = [
  ...INFO_STEPS.map(() => "info" as StepKind),
  "ai-level",
  "assessment",
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);
  const [aiLevel, setAiLevel] = useState<string>("retail");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const done = localStorage.getItem("paloor_onboarded");
    if (!done) {
      setShow(true);
      requestAnimationFrame(() => setVisible(true));
    }
  }, []);

  const close = (destination: string) => {
    setVisible(false);
    setTimeout(() => {
      localStorage.setItem("paloor_onboarded", "1");
      setShow(false);
      router.push(destination);
    }, 300);
  };

  const persistAiLevel = async () => {
    const token = localStorage.getItem("paloor_token");
    if (!token) return;
    try {
      await fetch(`${API}/api/chat/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ abstraction_level: aiLevel }),
      });
    } catch {
      /* non-blocking */
    }
  };

  const next = async () => {
    const kind = STEP_KINDS[step];
    if (kind === "ai-level") {
      setSaving(true);
      await persistAiLevel();
      setSaving(false);
    }
    if (step < STEP_KINDS.length - 1) {
      setStep(step + 1);
    } else {
      close("/dashboard");
    }
  };

  const skipStep = () => {
    if (step < STEP_KINDS.length - 1) {
      setStep(step + 1);
    } else {
      close("/dashboard");
    }
  };

  const skipAll = () => close("/dashboard");

  if (!show) return null;

  const kind = STEP_KINDS[step];
  const total = STEP_KINDS.length;

  let title = "";
  let subtitle = "";
  let body: React.ReactNode = null;

  if (kind === "info") {
    const idx = step; // info steps are first
    const s = INFO_STEPS[idx];
    const Icon = s.icon;
    title = "Welcome to Paloor";
    subtitle = "Your learning platform and onboarding hub for becoming a smarter investor.";
    body = (
      <div className="flex items-start gap-4 min-h-[120px]">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={20} className="text-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-1">{s.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
        </div>
      </div>
    );
  } else if (kind === "ai-level") {
    title = "How should the AI talk to you?";
    subtitle = "Pick the level that fits you. You can change this anytime in Account → Preferences.";
    body = (
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
        {AI_LEVELS.map((lvl) => {
          const selected = aiLevel === lvl.value;
          return (
            <button
              key={lvl.value}
              type="button"
              onClick={() => setAiLevel(lvl.value)}
              className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/30"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                  selected ? "bg-primary/15" : "bg-muted"
                }`}
              >
                <Sparkles
                  size={14}
                  className={selected ? "text-primary" : "text-muted-foreground"}
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{lvl.label}</div>
                <div className="text-[11px] text-muted-foreground leading-snug">{lvl.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  } else if (kind === "assessment") {
    title = "One last thing — meet yourself";
    subtitle =
      "A short personality assessment so the AI can tailor its tone, examples, and recommendations to how you think about money.";
    body = (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Brain size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Financial Personality Assessment</h3>
            <p className="text-[11px] text-muted-foreground">~5 minutes · 10 questions · No wrong answers</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Not a finance quiz — a personality test about money, risk, and decisions. You can skip and take it later from Account → Risk Assessment.
        </p>
      </div>
    );
  }

  const isLast = step === total - 1;
  const primaryLabel = (() => {
    if (kind === "assessment") return saving ? "Saving…" : "Take assessment";
    if (isLast) return saving ? "Saving…" : "Get Started";
    return saving ? "Saving…" : "Next";
  })();

  const handlePrimary = async () => {
    if (kind === "assessment") {
      // Mark onboarded and route into assessment tab
      close("/dashboard/account?tab=assessment");
      return;
    }
    await next();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-8 pt-8 pb-6">
          <div className="flex items-center justify-between mb-6">
            <span className="font-serif text-lg font-semibold tracking-wide text-foreground">
              Paloor
            </span>
            <button
              type="button"
              onClick={skipAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip onboarding
            </button>
          </div>

          <h2 className="font-serif text-xl tracking-tight mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>

          {body}
        </div>

        <div className="px-8 py-5 border-t border-border flex items-center justify-between bg-muted/20">
          <div className="flex gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skipStep}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Skip
            </button>
            <button
              onClick={handlePrimary}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow disabled:opacity-60 transition-all"
            >
              {primaryLabel}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
