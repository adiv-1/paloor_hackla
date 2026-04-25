"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  text: string;
  /** Curated terms to underline. Match is case-insensitive whole-word. */
  terms?: string[];
  className?: string;
}

interface Popover {
  term: string;
  context: string;
  x: number;
  y: number;
}

/**
 * Renders lesson text and lets the user:
 *   1. Click any underlined curated term  → AI explains it.
 *   2. Select any text                    → floating "Ask AI" button → AI explains.
 */
export function GlossaryText({ text, terms = [], className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [followup, setFollowup] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectionBtn, setSelectionBtn] = useState<{ x: number; y: number; sel: string } | null>(null);
  const { token } = useAuth();

  // Build chunks: alternate plain text and curated-term <button>.
  const chunks: Array<{ type: "text" | "term"; value: string }> = [];
  if (terms.length === 0) {
    chunks.push({ type: "text", value: text });
  } else {
    const escaped = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length);
    const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) chunks.push({ type: "text", value: text.slice(last, m.index) });
      chunks.push({ type: "term", value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) chunks.push({ type: "text", value: text.slice(last) });
  }

  function openPopover(term: string, anchor: DOMRect) {
    setExplanation(null);
    setFollowup("");
    const cRect = containerRef.current?.getBoundingClientRect();
    setPopover({
      term,
      context: text,
      x: cRect ? anchor.left - cRect.left + anchor.width / 2 : anchor.left + anchor.width / 2,
      y: cRect ? anchor.bottom - cRect.top + 6 : anchor.bottom + 6,
    });
    fetchExplain(term, text, "");
  }

  async function fetchExplain(term: string, ctx: string, q: string) {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/learn/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ term, context: ctx, question: q }),
      });
      const j = await res.json();
      setExplanation(j.explanation || "I couldn't reach the AI tutor right now.");
    } catch {
      setExplanation("I couldn't reach the AI tutor right now.");
    }
    setLoading(false);
  }

  // Selection-based "Ask AI" button.
  useEffect(() => {
    function onSelect() {
      const sel = window.getSelection();
      const txt = sel?.toString().trim() || "";
      if (!txt || !sel || sel.rangeCount === 0) {
        setSelectionBtn(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only react if selection lives inside our container.
      if (!containerRef.current?.contains(range.commonAncestorContainer)) {
        setSelectionBtn(null);
        return;
      }
      const r = range.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();
      setSelectionBtn({
        x: r.right - cRect.left,
        y: r.top - cRect.top - 6,
        sel: txt,
      });
    }
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <p className="text-base leading-relaxed text-foreground/80">
        {chunks.map((c, i) =>
          c.type === "term" ? (
            <button
              key={i}
              type="button"
              onClick={(e) => openPopover(c.value, (e.target as HTMLElement).getBoundingClientRect())}
              className="border-b border-dashed border-primary/60 text-foreground hover:bg-primary/10"
            >
              {c.value}
            </button>
          ) : (
            <span key={i}>{c.value}</span>
          ),
        )}
      </p>

      {selectionBtn && !popover && (
        <button
          type="button"
          onClick={() => {
            const sel = selectionBtn.sel;
            const cRect = containerRef.current!.getBoundingClientRect();
            setExplanation(null);
            setFollowup("");
            setPopover({ term: sel, context: text, x: selectionBtn.x, y: selectionBtn.y + 24 });
            setSelectionBtn(null);
            window.getSelection()?.removeAllRanges();
            fetchExplain(sel, text, "");
          }}
          style={{ left: selectionBtn.x, top: selectionBtn.y }}
          className="absolute z-10 -translate-x-full -translate-y-full inline-flex items-center gap-1 rounded-md border border-primary/40 bg-background px-2 py-1 text-xs text-primary shadow-md hover:bg-primary/10"
        >
          <Sparkles className="h-3 w-3" /> Ask AI
        </button>
      )}

      {popover && (
        <div
          style={{ left: popover.x, top: popover.y }}
          className="absolute z-20 w-80 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl"
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-primary">
              <Sparkles className="inline h-3 w-3 mr-1" />
              {popover.term.length > 40 ? popover.term.slice(0, 40) + "…" : popover.term}
            </div>
            <button
              type="button"
              onClick={() => setPopover(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="text-sm">
            {loading && !explanation ? (
              <span className="text-muted-foreground">Thinking…</span>
            ) : (
              <span>{explanation}</span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && followup.trim() && !loading) {
                  fetchExplain(popover.term, popover.context, followup.trim());
                  setFollowup("");
                }
              }}
              placeholder="Ask a follow-up…"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary/40 focus:outline-none"
            />
            <button
              type="button"
              disabled={!followup.trim() || loading}
              onClick={() => {
                fetchExplain(popover.term, popover.context, followup.trim());
                setFollowup("");
              }}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
