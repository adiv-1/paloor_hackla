"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("paloor-theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className={`w-8 h-8 ${className}`} />;

  return (
    <button
      onClick={toggle}
      className={`w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className}`}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
