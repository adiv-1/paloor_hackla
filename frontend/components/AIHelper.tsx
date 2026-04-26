"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Mic,
  Square,
  X,
  Loader2,
  Volume2,
  VolumeX,
  Sparkles,
  Send,
  Camera,
  ImageIcon,
  Keyboard,
} from "lucide-react";
import { useVoice } from "@/lib/useVoice";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Turn {
  role: "user" | "ai";
  text: string;
  hasImage?: boolean;
}

type InputMode = "voice" | "text";

/**
 * Global AI Helper.
 * - Voice is the default input ("hold a thought, tap to talk").
 * - Switch to keyboard for typed questions.
 * - "Give context" snaps a screenshot of the current page and sends it
 *   along with the next message so the AI can ground its answer visually.
 */
export function AIHelper() {
  const voice = useVoice();
  const { token } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<InputMode>("voice");
  const [draft, setDraft] = useState("");
  const [pendingShot, setPendingShot] = useState<string | null>(null); // base64 png, no prefix
  const [snapping, setSnapping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const onDashboard = pathname?.startsWith("/dashboard");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, interim, thinking, pendingShot]);

  useEffect(() => {
    if (!open) voice.stop();
  }, [open, voice]);

  // If voice is unavailable, fall back to text mode automatically.
  useEffect(() => {
    if (voice.enabled === false && mode === "voice") setMode("text");
  }, [voice.enabled, mode]);

  if (!onDashboard) return null;

  const sectionContext = (() => {
    if (!pathname) return "general dashboard";
    if (pathname.includes("/dashboard/chat")) return "user is in the AI chat page";
    if (pathname.includes("/dashboard/analysis/")) {
      const id = pathname.split("/").pop();
      return `user is reading a deep analysis report (id ${id})`;
    }
    if (pathname.includes("/dashboard/equities/stocks/")) {
      const ticker = pathname.split("/").pop();
      return `user is on the ${ticker} stock detail page`;
    }
    if (pathname.includes("/dashboard/equities")) return "user is browsing equities / market data";
    if (pathname.includes("/dashboard/learn")) return "user is in the learning section";
    if (pathname.includes("/dashboard/portfolio")) return "user is on the portfolio page";
    return `user is on ${pathname}`;
  })();

  /* ---------- Screenshot ---------- */
  async function captureScreenshot() {
    setSnapping(true);
    try {
      // Hide our own dock first so it doesn't appear in the capture.
      const dock = document.getElementById("paloor-ai-helper-dock");
      const fab = document.getElementById("paloor-ai-helper-fab");
      const prevDock = dock?.style.visibility;
      const prevFab = fab?.style.visibility;
      if (dock) dock.style.visibility = "hidden";
      if (fab) fab.style.visibility = "hidden";

      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(document.body, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        logging: false,
        useCORS: true,
      });

      if (dock) dock.style.visibility = prevDock || "";
      if (fab) fab.style.visibility = prevFab || "";

      // Downscale if huge — Bedrock has limits, we want a reasonable image.
      const maxW = 1280;
      let target = canvas;
      if (canvas.width > maxW) {
        const ratio = maxW / canvas.width;
        const small = document.createElement("canvas");
        small.width = maxW;
        small.height = Math.round(canvas.height * ratio);
        const ctx = small.getContext("2d");
        ctx?.drawImage(canvas, 0, 0, small.width, small.height);
        target = small;
      }
      const dataUrl = target.toDataURL("image/png");
      const b64 = dataUrl.split(",")[1] || null;
      setPendingShot(b64);
    } catch (e) {
      console.warn("screenshot failed", e);
      setTurns((prev) => [
        ...prev,
        { role: "ai", text: "I couldn't capture the page just now. Try asking your question without a snapshot." },
      ]);
    }
    setSnapping(false);
  }

  /* ---------- Ask ---------- */
  async function handleAsk(question: string) {
    const q = question.trim();
    if (!q) return;
    const authToken = token || localStorage.getItem("paloor_token");
    if (!authToken) return;

    const imageB64 = pendingShot;
    setPendingShot(null);
    setTurns((prev) => [...prev, { role: "user", text: q, hasImage: !!imageB64 }]);
    setInterim("");
    setDraft("");
    setThinking(true);

    const history = turns
      .slice(-4)
      .map((t) => `${t.role === "user" ? "User" : "You"}: ${t.text}`)
      .join("\n");

    const isVoice = mode === "voice";
    const ctx = `${sectionContext}.${
      imageB64 ? " The user attached a screenshot of what they're looking at — reference it." : ""
    }${history ? `\n\nPrior conversation:\n${history}` : ""}\n\n${
      isVoice
        ? "This is a VOICE conversation — respond conversationally in 2-4 short sentences. No markdown, no headers, no bullets. Sound natural when read aloud."
        : "Respond clearly and concisely (under 180 words). Plain prose preferred; light markdown ok."
    }`;

    let full = "";
    try {
      const res = await fetch(`${API}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          question: q,
          context: ctx,
          image_b64: imageB64 || undefined,
          image_format: imageB64 ? "png" : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        setTurns((prev) => [...prev, { role: "ai", text: "Sorry, I couldn't reach the brain. Try again." }]);
        setThinking(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
            if (evt.type === "chunk") full += evt.text;
          } catch {}
        }
      }
    } catch {
      full = "I had trouble reaching the AI. Try again in a moment.";
    }

    const reply = (full || "").trim() || "I didn't catch that. Could you ask again?";
    setTurns((prev) => [...prev, { role: "ai", text: reply }]);
    setThinking(false);
    if (isVoice && !muted) voice.speak(reply);
  }

  /* ---------- Mic ---------- */
  async function toggleMic() {
    if (voice.recording) {
      const text = await voice.stopAndTranscribe();
      if (text) {
        await handleAsk(text);
      } else {
        setInterim("");
      }
    } else {
      voice.stop();
      setInterim("Listening…");
      await voice.startRecording();
    }
  }

  function submitText() {
    if (!draft.trim() || thinking) return;
    void handleAsk(draft);
  }

  /* ---------- Collapsed FAB ---------- */
  if (!open) {
    return (
      <button
        id="paloor-ai-helper-fab"
        onClick={() => setOpen(true)}
        title="AI Helper"
        className="fixed z-[9990] bottom-24 right-5 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  /* ---------- Expanded dock ---------- */
  return (
    <div
      id="paloor-ai-helper-dock"
      className="fixed z-[9990] bottom-24 right-5 w-[360px] max-w-[calc(100vw-1.5rem)] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ height: 520 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">AI Helper</div>
          <div className="text-[10px] text-muted-foreground truncate">{sectionContext}</div>
        </div>
        {mode === "voice" && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="p-1.5 rounded hover:bg-muted"
            title={muted ? "Unmute spoken replies" : "Mute spoken replies"}
          >
            {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
        <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-muted" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mode pill switcher */}
      <div className="px-3 pt-2.5 flex items-center justify-between">
        <div className="inline-flex bg-muted/60 rounded-full p-0.5 text-[11px] font-medium">
          <button
            onClick={() => setMode("voice")}
            disabled={voice.enabled === false}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors ${
              mode === "voice"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40"
            }`}
          >
            <Mic className="h-3 w-3" /> Voice
          </button>
          <button
            onClick={() => setMode("text")}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors ${
              mode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Keyboard className="h-3 w-3" /> Type
          </button>
        </div>
        <button
          onClick={captureScreenshot}
          disabled={snapping || thinking}
          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors ${
            pendingShot
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
          } disabled:opacity-50`}
          title="Snap the current page and attach it so the AI can see what you see"
        >
          {snapping ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : pendingShot ? (
            <ImageIcon className="h-3 w-3" />
          ) : (
            <Camera className="h-3 w-3" />
          )}
          {pendingShot ? "Page attached" : "Give context"}
        </button>
      </div>

      {pendingShot && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
          <ImageIcon className="h-3 w-3 text-emerald-600 shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 flex-1 truncate">
            Page snapshot will be sent with your next message
          </span>
          <button
            onClick={() => setPendingShot(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {turns.length === 0 && !interim && !thinking && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-2">
            <Sparkles className="h-7 w-7 text-muted-foreground/40" />
            <div className="text-sm font-medium">Ask anything about this page</div>
            <div className="text-[11px] text-muted-foreground leading-snug">
              {mode === "voice"
                ? "Tap the mic and speak naturally. Need to show me what you mean? Hit \u201cGive context\u201d first."
                : "Type your question. Need to show me what you see? Hit \u201cGive context\u201d to attach a snapshot."}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex gap-2 ${t.role === "user" ? "justify-end" : ""}`}>
            {t.role === "ai" && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {t.hasImage && (
                <div className="mb-1 flex items-center gap-1 text-[10px] opacity-80">
                  <ImageIcon className="h-2.5 w-2.5" /> with screenshot
                </div>
              )}
              {t.text}
            </div>
          </div>
        ))}

        {interim && (
          <div className="flex gap-2 justify-end">
            <div className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed bg-primary/40 text-primary-foreground italic">
              {interim}
            </div>
          </div>
        )}

        {thinking && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Loader2 className="h-3 w-3 text-primary animate-spin" />
            </div>
            <div className="text-[12px] text-muted-foreground py-1">Thinking…</div>
          </div>
        )}
      </div>

      {/* Input bar */}
      {mode === "voice" ? (
        <div className="px-3 py-3 border-t border-border bg-card flex items-center justify-between gap-2">
          <button
            onClick={toggleMic}
            disabled={thinking}
            className={`flex-1 h-11 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
              voice.recording
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            }`}
          >
            {voice.recording ? (
              <>
                <Square className="h-4 w-4" /> Stop & send
              </>
            ) : voice.playing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Speaking…
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Tap to talk
              </>
            )}
          </button>
          {voice.playing && (
            <button
              onClick={voice.stop}
              className="h-11 w-11 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center"
              title="Stop playback"
            >
              <Square className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="px-3 py-3 border-t border-border bg-card flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitText();
              }
            }}
            placeholder="Ask anything…"
            rows={1}
            disabled={thinking}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-snug max-h-28 focus:outline-none focus:border-primary/60 disabled:opacity-50"
          />
          <button
            onClick={submitText}
            disabled={thinking || !draft.trim()}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90"
          >
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}

      <div className="px-3 pb-2 text-[10px] text-muted-foreground/70">
        AWS Bedrock + ElevenLabs · context-aware to this page
      </div>
    </div>
  );
}
