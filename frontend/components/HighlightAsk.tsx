"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Send, Bot, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HighlightAskProviderProps {
  children: React.ReactNode;
  /** Extra context appended to the prompt (e.g. "Deep analysis on AAPL — Market Analyst report") */
  contextLabel?: string;
}

/**
 * Wrap any content area with this to enable "highlight to ask AI".
 * When the user selects text inside the children, a small floating
 * "Ask AI" pill appears next to the selection.
 */
export function HighlightAskProvider({ children, contextLabel = "" }: HighlightAskProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pillPos, setPillPos] = useState<{ top: number; left: number } | null>(null);
  const [selection, setSelection] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setPillPos(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 4 || text.length > 600) {
      setPillPos(null);
      return;
    }
    // Make sure selection is inside our container
    if (!containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setPillPos(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPillPos(null);
      return;
    }
    setSelection(text);
    setPillPos({
      top: Math.max(8, rect.top - 38),
      left: Math.max(8, rect.left + rect.width / 2 - 60),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
    };
  }, [handleSelection]);

  const launchModal = () => {
    setOpen(true);
    setPillPos(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      <div ref={containerRef}>{children}</div>

      {mounted &&
        pillPos &&
        createPortal(
          <button
            onClick={launchModal}
            className="fixed z-[10000] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:scale-105 transition-transform"
            style={{ top: pillPos.top, left: pillPos.left }}
          >
            <Sparkles className="h-3 w-3" /> Ask AI about this
          </button>,
          document.body,
        )}

      {mounted && open && (
        <HighlightAskModal
          excerpt={selection}
          contextLabel={contextLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ───────── Modal ───────── */

interface ChatMsg {
  role: "user" | "ai";
  text: string;
}

function HighlightAskModal({
  excerpt,
  contextLabel,
  onClose,
}: {
  excerpt: string;
  contextLabel: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    const authToken = token || localStorage.getItem("paloor_token");
    if (!authToken) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    const sectionContext = `User selected this excerpt and is asking about it.\n\nEXCERPT:\n"""${excerpt}"""\n\nCONTEXT: ${contextLabel || "Investment analysis report"}\n\nAnswer concisely (under 150 words). Reference specifics from the excerpt.`;

    try {
      const res = await fetch(`${API}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ question: q, context: sectionContext }),
      });
      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "ai", text: "Couldn't reach AI. Try again." }]);
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "chunk") {
              full += evt.text;
              setStreamText(full);
            } else if (evt.type === "done") {
              setMessages((prev) => [...prev, { role: "ai", text: full }]);
              setStreamText("");
              setStreaming(false);
            }
          } catch {}
        }
      }
      if (streaming && full) {
        setMessages((prev) => [...prev, { role: "ai", text: full }]);
        setStreamText("");
        setStreaming(false);
      }
    } catch {
      setStreaming(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Ask about this excerpt</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border/60 bg-muted/15">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Selected</div>
          <div className="text-xs text-foreground/80 italic line-clamp-4 leading-snug">"{excerpt}"</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !streamText && (
            <div className="text-xs text-muted-foreground text-center py-6">
              Ask anything about the highlighted text — definitions, implications, follow-up questions.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "ai" && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {streamText && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed bg-muted text-foreground">
                {streamText}
                <span className="inline-block w-1 h-3 bg-primary/60 ml-0.5 animate-pulse" />
              </div>
            </div>
          )}
          {streaming && !streamText && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
              </div>
              <div className="text-xs text-muted-foreground py-1">Thinking…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="px-3 py-2.5 border-t border-border/60 bg-card flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={streaming}
            className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
