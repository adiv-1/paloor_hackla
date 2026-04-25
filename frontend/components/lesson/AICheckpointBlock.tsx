"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { CheckpointBlock } from "@/lib/modules/types";
import { useVoice } from "@/lib/useVoice";
import { ListenButton } from "./ListenButton";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  block: CheckpointBlock;
  moduleId: string;
  moduleTitle: string;
  onComplete: () => void;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
}

export function AICheckpointBlock({ block, moduleId, moduleTitle, onComplete }: Props) {
  const { token } = useAuth();
  const voice = useVoice();
  const [history, setHistory] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  async function send(text: string) {
    if (!text.trim() || loading || done) return;
    const next: Turn[] = [...history, { role: "user", text: text.trim() }];
    setHistory(next);
    setDraft("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/learn/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          module_id: moduleId,
          step_key: block.id,
          module_title: moduleTitle,
          concept: block.concept,
          key_ideas: block.keyIdeas,
          question: block.question,
          history: next,
        }),
      });
      const j = await res.json();
      const reply = j.reply || "Got it — let's keep going.";
      setHistory([...next, { role: "assistant", text: reply }]);
      if (j.done) setDone(true);
    } catch {
      setHistory([...next, { role: "assistant", text: "I lost connection — but you're on track. Continue when ready." }]);
      setDone(true);
    }
    setLoading(false);
  }

  async function toggleMic() {
    if (voice.recording) {
      setRecordingHint("Transcribing…");
      const text = await voice.stopAndTranscribe();
      setRecordingHint(null);
      if (text) {
        send(text);
      }
    } else {
      setRecordingHint("Listening… tap again to stop");
      voice.startRecording();
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-primary">Quick conversation</div>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{block.question}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No right answer. Talk it out — type or tap the mic. The tutor will let you know when we&apos;ve got it.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border bg-card p-3"
      >
        {history.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            Start by sharing what you think — even a rough guess is a great place to begin.
          </div>
        )}
        {history.map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                t.role === "user"
                  ? "bg-primary/10 text-foreground border border-primary/20"
                  : "bg-background text-foreground border border-border"
              }`}
            >
              <div>{t.text}</div>
              {t.role === "assistant" && voice.enabled && (
                <div className="mt-2">
                  <ListenButton text={t.text} autoPlay={i === history.length - 1} label="Listen" />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {recordingHint && <div className="text-xs text-primary">{recordingHint}</div>}

      {!done ? (
        <div className="flex items-end gap-2">
          {voice.enabled && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={loading}
              title={voice.recording ? "Stop and send" : "Speak"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                voice.recording
                  ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {voice.recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder={block.placeholder ?? "Type or speak your thoughts…"}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => send(draft)}
            disabled={!draft.trim() || loading}
            className="flex h-10 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Tutor wrapped up — you can keep chatting or move on.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDone(false)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              Keep chatting
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {!done && history.length >= 2 && (
        <button
          type="button"
          onClick={onComplete}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Skip ahead
        </button>
      )}
    </div>
  );
}
