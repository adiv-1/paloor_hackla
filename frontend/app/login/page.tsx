"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

function getNextRoute(user: any): string {
  if (user?.email !== "admin" && user?.email_verified === false) {
    return "/verify-email";
  }
  if (user?.profile_completed === false) {
    return "/profile-setup";
  }
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, register, user: authUser } = useAuth();
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
      // Read the user from localStorage since state may not have updated yet
      const savedUser = localStorage.getItem("paloor_user");
      const u = savedUser ? JSON.parse(savedUser) : null;
      router.push(getNextRoute(u));
    }
  };

  const handleDemo = async () => {
    setError(null);
    setSubmitting(true);
    const err = await login("admin", "admin");
    setSubmitting(false);
    if (err) setError(err);
    else router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
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
            ? "Enter your credentials or use demo mode."
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
              placeholder={mode === "register" ? "you@example.com" : "admin"}
              className="w-full px-3 py-2.5 text-sm border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "4+ characters" : "admin"}
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

        {mode === "login" && (
          <button
            onClick={handleDemo}
            disabled={submitting}
            className="w-full mt-3 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
          >
            Use Demo Mode
          </button>
        )}

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

        <div className="mt-8 pt-6 border-t border-border/50 text-center">
          <a
            href="/admin/login"
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Paloor staff? Admin portal →
          </a>
        </div>
      </div>
    </div>
  );
}
