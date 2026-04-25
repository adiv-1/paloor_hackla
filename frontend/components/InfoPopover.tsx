"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, X, Send, Bot, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface InfoPopoverProps {
  title: string;
  description: string;
  tips?: string[];
  sectionContext?: string;
  size?: "sm" | "md";
  className?: string;
}

interface ChatMsg {
  role: "user" | "ai";
  text: string;
}

export function InfoPopover({
  title,
  description,
  tips,
  sectionContext,
  size = "sm",
  className = "",
}: InfoPopoverProps) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, above: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Refs to always have current values — avoids stale closure issues
  const inputValueRef = useRef(input);
  const streamingRef = useRef(streaming);
  inputValueRef.current = input;
  streamingRef.current = streaming;

  // SSR guard
  useEffect(() => {
    setMounted(true);
  }, []);

  // Position: fixed coords from getBoundingClientRect (NO scrollY/scrollX)
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const reposition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const popW = chatMode ? 384 : 320;
      const popEstH = chatMode ? 420 : 280;

      // Horizontal: right-align to trigger, clamp to viewport
      let left = rect.right - popW;
      if (left < 8) left = 8;
      if (left + popW > window.innerWidth - 8)
        left = window.innerWidth - popW - 8;

      // Vertical: prefer below trigger, flip above if no room
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top: number;
      let above = false;

      if (spaceBelow >= popEstH + 8 || spaceBelow >= spaceAbove) {
        top = rect.bottom + 6;
      } else {
        above = true;
        top = rect.top - 6;
      }

      setPos({ top, left, above });
    };

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, chatMode]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  // Focus input when chat mode opens
  useEffect(() => {
    if (chatMode && open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatMode, open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setChatMode(false);
        setMessages([]);
        setInput("");
        setStreaming(false);
        setStreamText("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Send message: reads from refs to guarantee fresh values
  async function doSend() {
    const q = inputValueRef.current.trim();
    if (!q) return;
    if (streamingRef.current) return;

    const authToken = token || localStorage.getItem("paloor_token");
    if (!authToken) {
      console.error("[InfoPopover] No auth token found");
      return;
    }

    // Update UI optimistically
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    inputValueRef.current = "";
    setStreaming(true);
    streamingRef.current = true;
    setStreamText("");

    let finished = false;

    try {
      const res = await fetch(`${API}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ question: q, context: sectionContext || title }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: "Sorry, I couldn't connect right now. Try again.",
          },
        ]);
        setStreaming(false);
        streamingRef.current = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

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
              fullText += evt.text;
              setStreamText(fullText);
            } else if (evt.type === "done") {
              finished = true;
              setMessages((prev) => [...prev, { role: "ai", text: fullText }]);
              setStreamText("");
              setStreaming(false);
              streamingRef.current = false;
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      if (!finished) {
        if (fullText) {
          setMessages((prev) => [...prev, { role: "ai", text: fullText }]);
        }
        setStreamText("");
        setStreaming(false);
        streamingRef.current = false;
      }
    } catch (err) {
      console.error("[InfoPopover] fetch error", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Connection error. Please try again." },
      ]);
      setStreaming(false);
      streamingRef.current = false;
      setStreamText("");
    }
  }

  const iconSize = size === "sm" ? 13 : 15;

  const popover =
    open && mounted ? (
      <div
        ref={popoverRef}
        className={`fixed rounded-xl border border-border bg-background shadow-xl ${
          chatMode ? "w-96" : "w-80"
        }`}
        style={{
          zIndex: 9999,
          left: pos.left,
          ...(pos.above
            ? { bottom: window.innerHeight - pos.top, maxHeight: pos.top - 16 }
            : { top: pos.top, maxHeight: window.innerHeight - pos.top - 16 }),
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background rounded-t-xl z-10">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Description */}
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
          {tips && tips.length > 0 && (
            <ul className="mt-2 space-y-1">
              {tips.map((tip, i) => (
                <li
                  key={i}
                  className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                >
                  <span className="text-primary mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chat messages */}
        {chatMode && messages.length + (streaming ? 1 : 0) > 0 && (
          <div className="border-t border-border">
            <div className="max-h-60 overflow-y-auto px-4 py-3 space-y-2.5">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "ai" && (
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={10} className="text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-foreground"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {streaming && streamText && (
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={10} className="text-primary" />
                  </div>
                  <div className="rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed bg-primary/10 text-foreground max-w-[85%]">
                    {streamText}
                  </div>
                </div>
              )}
              {streaming && !streamText && (
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot size={10} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1.5">
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                    <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* Bottom bar: Ask AI / chat input */}
        <div className="border-t border-border px-3 py-2.5 sticky bottom-0 bg-background rounded-b-xl">
          {!chatMode ? (
            <button
              type="button"
              onClick={() => setChatMode(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <Bot size={13} className="text-primary" />
              <span>Have a question? Ask AI...</span>
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    inputValueRef.current = e.target.value;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      doSend();
                    }
                  }}
                  placeholder="Ask about this section..."
                  className="flex-1 text-xs px-2.5 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={streaming}
                />
                <button
                  type="button"
                  onClick={() => doSend()}
                  disabled={!input.trim() || streaming}
                  className="p-2 rounded-lg bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-30 transition-colors shrink-0"
                >
                  {streaming ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-1.5 text-center">
                Quick help · These chats are not saved
              </p>
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-all ${
          size === "sm" ? "w-5 h-5" : "w-6 h-6"
        } ${className}`}
        title={`About ${title}`}
        aria-label={`Info about ${title}`}
      >
        <Info size={iconSize} />
      </button>
      {mounted && createPortal(popover, document.body)}
    </>
  );
}
