"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  User,
  Briefcase,
  DollarSign,
  Target,
  ChevronRight,
  ChevronLeft,
  SkipForward,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface StepConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  fields: FieldConfig[];
}

interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multi-select";
  placeholder?: string;
  options?: string[];
}

const STEPS: StepConfig[] = [
  {
    id: "personal",
    title: "About You",
    subtitle: "Help us personalize your experience",
    icon: <User className="h-5 w-5" />,
    fields: [
      { key: "age", label: "Age", type: "number", placeholder: "28" },
      {
        key: "gender",
        label: "Gender",
        type: "select",
        options: ["Male", "Female", "Non-binary", "Prefer not to say"],
      },
      {
        key: "state",
        label: "State / Region",
        type: "text",
        placeholder: "California",
      },
    ],
  },
  {
    id: "career",
    title: "Career & Income",
    subtitle: "This helps us calibrate financial benchmarks",
    icon: <Briefcase className="h-5 w-5" />,
    fields: [
      {
        key: "occupation",
        label: "Occupation",
        type: "text",
        placeholder: "Software Engineer",
      },
      {
        key: "annual_income",
        label: "Annual Income Range",
        type: "select",
        options: [
          "Under $25k",
          "$25k – $50k",
          "$50k – $100k",
          "$100k – $250k",
          "$250k – $500k",
          "$500k+",
        ],
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Snapshot",
    subtitle: "A rough picture of where you stand",
    icon: <DollarSign className="h-5 w-5" />,
    fields: [
      {
        key: "net_worth_estimate",
        label: "Estimated Net Worth",
        type: "select",
        options: [
          "Under $10k",
          "$10k – $50k",
          "$50k – $250k",
          "$250k – $1M",
          "$1M – $5M",
          "$5M+",
        ],
      },
      {
        key: "dependents",
        label: "Number of Dependents",
        type: "number",
        placeholder: "0",
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & Risk",
    subtitle: "What are you working toward?",
    icon: <Target className="h-5 w-5" />,
    fields: [
      {
        key: "financial_goals",
        label: "Financial Goals",
        type: "multi-select",
        options: [
          "Build emergency fund",
          "Pay off debt",
          "Save for a home",
          "Invest for retirement",
          "Grow net worth",
          "Start a business",
          "Financial independence",
          "Education fund",
        ],
      },
      {
        key: "risk_tolerance",
        label: "Risk Tolerance",
        type: "select",
        options: ["Conservative", "Moderate", "Aggressive"],
      },
    ],
  },
];

export default function ProfileSetupPage() {
  const router = useRouter();
  const { user, token, setUser } = useAuth();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  // If profile already completed, go to dashboard
  useEffect(() => {
    if (user?.profile_completed) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const currentStep = STEPS[step];

  const updateField = (key: string, value: any) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleGoal = (goal: string) => {
    const current: string[] = values.financial_goals || [];
    if (current.includes(goal)) {
      updateField(
        "financial_goals",
        current.filter((g) => g !== goal),
      );
    } else {
      updateField("financial_goals", [...current, goal]);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {};
      if (values.age) payload.age = Number(values.age);
      if (values.gender) payload.gender = values.gender;
      if (values.state) payload.state = values.state;
      if (values.occupation) payload.occupation = values.occupation;
      if (values.annual_income) payload.annual_income = values.annual_income;
      if (values.net_worth_estimate)
        payload.net_worth_estimate = values.net_worth_estimate;
      if (values.dependents !== undefined)
        payload.dependents = Number(values.dependents);
      if (values.financial_goals?.length)
        payload.financial_goals = values.financial_goals;
      if (values.risk_tolerance) payload.risk_tolerance = values.risk_tolerance;

      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setUser({ ...user!, ...updated, profile_completed: true });
      }
    } catch {
      /* continue anyway */
    }
    setSubmitting(false);
    router.push("/dashboard");
  };

  const handleSkip = async () => {
    // Mark profile as completed with empty data so they aren't asked again
    try {
      await fetch(`${API}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (user) setUser({ ...user, profile_completed: true });
    } catch {
      /* */
    }
    router.push("/dashboard");
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="inline-block mb-8">
            <span className="font-serif text-xl font-semibold tracking-wide">
              Paloor
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip all
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1.5 mb-6">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Step content */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            {currentStep.icon}
          </div>
          <div>
            <h1 className="font-serif text-lg tracking-tight">
              {currentStep.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentStep.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {currentStep.fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm font-medium mb-1.5 block">
                {field.label}
              </label>

              {field.type === "text" && (
                <input
                  type="text"
                  value={values[field.key] || ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}

              {field.type === "number" && (
                <input
                  type="number"
                  value={values[field.key] ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}

              {field.type === "select" && (
                <div className="grid grid-cols-2 gap-2">
                  {field.options?.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => updateField(field.key, opt)}
                      className={`px-3 py-2 text-sm rounded-md border transition-colors text-left ${
                        values[field.key] === opt
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {field.type === "multi-select" && (
                <div className="grid grid-cols-2 gap-2">
                  {field.options?.map((opt) => {
                    const selected = (values[field.key] || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => toggleGoal(opt)}
                        className={`px-3 py-2 text-sm rounded-md border transition-colors text-left ${
                          selected
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={submitting}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-50"
          >
            {submitting
              ? "Saving..."
              : step === STEPS.length - 1
                ? "Finish"
                : "Continue"}
            {!submitting && step < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
