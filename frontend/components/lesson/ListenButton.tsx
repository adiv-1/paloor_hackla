"use client";

import { useEffect } from "react";
import { Volume2, Square } from "lucide-react";
import { useVoice } from "@/lib/useVoice";

interface Props {
  text: string;
  autoPlay?: boolean;
  className?: string;
  label?: string;
}

export function ListenButton({ text, autoPlay = false, className = "", label = "Listen" }: Props) {
  const { enabled, speak, stop, playing } = useVoice();

  useEffect(() => {
    if (autoPlay && enabled && text) {
      // Tiny delay so users don't get audio before the page settles.
      const t = setTimeout(() => speak(text), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, enabled, text]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => (playing ? stop() : speak(text))}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent ${className}`}
      title={playing ? "Stop" : label}
    >
      {playing ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      <span>{playing ? "Stop" : label}</span>
    </button>
  );
}
