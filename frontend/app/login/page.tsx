"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    let err: string | null;
    if (mode === "register") {
      err = await register(email, password, name);
    } else {
      err = await login(email, password);
    }

    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      router.push("/");
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

        <h1 className="font-serif text-xl tracking-tight mb-1">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "login"
            ? "Enter your credentials to continue."
            : "Set up your account to get started."}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 text-sm border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {mode === "register" ? "Email" : "Username or email"}
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "register" ? "you@example.com" : "you@example.com"}
              className="w-full px-3 py-2.5 text-sm border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "4+ characters" : "••••••••"}
              className="w-full px-3 py-2.5 text-sm border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-50"
          >
            {submitting
              ? "..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="text-foreground hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="text-foreground hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
