"use client";

import { useState, useEffect } from "react";
import { ArrowRight, FolderOpen, Shield, BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    icon: FolderOpen,
    title: "Organize every asset you own",
    body: "Vehicles, property, investments. Each one gets a structured checklist of the documents that matter. No more hunting through email or filing cabinets.",
  },
  {
    icon: Shield,
    title: "Upload once, link everywhere",
    body: "Your driver's license, passport, and government ID live in one place. When an asset needs them, they're already there.",
  },
  {
    icon: BarChart3,
    title: "See the full picture",
    body: "Portfolio analytics, net worth tracking, and tax intelligence — all built on top of your real documents, not manual inputs.",
  },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const done = localStorage.getItem("paloor_onboarded");
    if (!done) {
      setShow(true);
      requestAnimationFrame(() => setVisible(true));
    }
  }, []);

  const finish = () => {
    setVisible(false);
    setTimeout(() => {
      localStorage.setItem("paloor_onboarded", "1");
      setShow(false);
      router.push("/dashboard/assets");
    }, 300);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-8 pt-10 pb-6">
          <span className="font-serif text-lg font-semibold tracking-wide text-foreground">
            Paloor
          </span>
          <h2 className="font-serif text-xl tracking-tight mt-6 mb-2">
            Welcome to Paloor
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Let's walk through what you can do here.
          </p>

          <div className="flex items-start gap-4 min-h-[120px]">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Icon size={20} className="text-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">{current.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {current.body}
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-border flex items-center justify-between bg-muted/20">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all"
          >
            {step === STEPS.length - 1 ? "Get Started" : "Next"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
