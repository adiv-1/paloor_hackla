"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Mail, RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, token, refreshUser } = useAuth();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already verified
  useEffect(() => {
    if (user?.email_verified) {
      if (!user.profile_completed) {
        router.replace("/profile-setup");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, router]);

  // If no user, redirect to login
  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  const handleInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const next = [...code];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || "";
    }
    setCode(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, code: fullCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || "Invalid code");
        setSubmitting(false);
        return;
      }
      await refreshUser();
      router.push("/profile-setup");
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  };

  const handleResend = async () => {
    try {
      await fetch(`${API}/api/auth/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, code: "" }),
      });
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm p-6">
        <div className="inline-block mb-8">
          <span className="font-serif text-xl font-semibold tracking-wide">
            Paloor
          </span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-serif text-xl tracking-tight">
            Verify your email
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">{user?.email}</span>.
          Check your inbox and enter it below.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6 justify-center" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-13 text-center text-lg tabular-nums border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          ))}
        </div>

        <button
          onClick={handleVerify}
          disabled={submitting || code.join("").length !== 6}
          className="w-full py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-50"
        >
          {submitting ? "Verifying..." : "Verify Email"}
        </button>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={handleResend}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Resend code
          </button>
          {resent && <span className="text-xs text-primary">Sent!</span>}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/profile-setup")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}
