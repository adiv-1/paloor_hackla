"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import {
  Bot,
  Send,
  Plus,
  MessageSquare,
  Users,
  Hash,
  Archive,
  FolderPlus,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Search,
  Paperclip,
  MoreVertical,
  Sparkles,
  Globe,
  Briefcase,
  GraduationCap,
  Building,
  TrendingUp,
  Shield,
  Landmark,
  Bitcoin,
  DollarSign,
  Loader2,
  X,
  ArrowLeft,
  Trash2,
  GripVertical,
  Mic,
  MicOff,
  Volume2,
  Square,
  Image as ImageIcon,
  Pencil,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVoice } from "@/lib/useVoice";
import ChatChart, { ChartCarousel } from "@/components/ChatChart";
import type { ChartData } from "@/components/ChatChart";
import AnalysisBreakdown from "@/components/AnalysisBreakdown";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = `${API.replace(/^http/, "ws")}/ws/chat`;

/* ─────────────── types ─────────────── */
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_ai_generated: number;
  is_private_nudge: number;
  created_at: number | string;
  attachments: any[];
  metadata: any;
  charts?: import("@/components/ChatChart").ChartData[];
}
interface Conversation {
  id: string;
  type: "ai_private" | "group";
  name: string;
  description: string;
  category: string;
  created_by: string;
  created_at: number | string;
  is_archived: number;
  last_message_at: number | string;
  member_count?: number;
  last_message?: {
    content: string;
    sender_name: string;
    is_ai_generated: number;
  } | null;
}
interface GroupCategory {
  key: string;
  label: string;
  description: string;
}

/* ─────────────── helpers ─────────────── */
const CATEGORY_ICONS: Record<string, any> = {
  equities: TrendingUp,
  bonds: Landmark,
  real_estate: Building,
  crypto: Bitcoin,
  tax: DollarSign,
  retirement: Shield,
  school: GraduationCap,
  company: Briefcase,
  city: Globe,
  general: Hash,
};

function toUnixTs(ts: number | string): number {
  if (typeof ts === "string") return new Date(ts).getTime() / 1000;
  return ts;
}

function timeAgo(ts: number | string): string {
  const seconds = Math.floor(Date.now() / 1000 - toUnixTs(ts));
  if (isNaN(seconds) || seconds < 0) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTime(ts: number | string): string {
  const d = new Date(typeof ts === "string" ? ts : ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function formatDateSeparator(ts: number | string): string {
  const d = new Date(typeof ts === "string" ? ts : ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/* ── Rich markdown renderer for AI messages ── */
function MarkdownMessage({ content, isAI }: { content: string; isAI: boolean }) {
  if (!isAI) {
    // User messages: simple text with line breaks
    return (
      <div className="whitespace-pre-wrap break-words">{content}</div>
    );
  }

  return (
    <div className="markdown-body prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
        components={{
          // Headings
          h1: ({ children }) => <h3 className="text-base font-bold mt-4 mb-2 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h5>,
          // Paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          // Inline code
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${className} text-xs`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Code blocks
          pre: ({ children }) => (
            <pre className="bg-[#1e1e1e] dark:bg-[#0d0d0d] text-[#d4d4d4] rounded-lg p-3 my-2 overflow-x-auto text-xs leading-relaxed last:mb-0">
              {children}
            </pre>
          ),
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border/50 px-2 py-1.5 bg-muted/50 font-semibold text-left">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border/50 px-2 py-1.5">{children}</td>
          ),
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
          ),
          // Strong / emphasis
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          // Links
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">{children}</a>
          ),
          // Horizontal rule
          hr: () => <hr className="my-3 border-border/50" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* MAIN PAGE                                              */
/* ═══════════════════════════════════════════════════════ */

export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatuses, setToolStatuses] = useState<string[]>([]);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [chartDataList, setChartDataList] = useState<import("@/components/ChatChart").ChartData[]>([]);
  const [sidebarView, setSidebarView] = useState<"chats" | "groups" | "browse">(
    "chats",
  );
  const [groups, setGroups] = useState<Conversation[]>([]);
  const [browseGroups, setBrowseGroups] = useState<Conversation[]>([]);
  const [categories, setCategories] = useState<GroupCategory[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string }[]>([]);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hdrs = useCallback(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );

  /* ── API helper — checks response, handles 401 ── */
  const apiFetch = useCallback(
    async (url: string, opts?: RequestInit) => {
      const res = await fetch(url, {
        ...opts,
        headers: { ...hdrs(), ...opts?.headers },
      });
      if (res.status === 401) {
        logout();
        return null;
      }
      if (!res.ok) return null;
      return res;
    },
    [hdrs, logout],
  );

  /* ── Fetch conversations ── */
  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const [aiRes, groupRes] = await Promise.all([
        apiFetch(`${API}/api/chat/conversations?type=ai_private`),
        apiFetch(`${API}/api/chat/conversations?type=group`),
      ]);
      const aiData = aiRes ? await aiRes.json() : [];
      const groupData = groupRes ? await groupRes.json() : [];
      setConversations(Array.isArray(aiData) ? aiData : []);
      setGroups(Array.isArray(groupData) ? groupData : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch]);

  /* ── Fetch messages for active conv ── */
  const loadMessages = useCallback(
    async (convId: string) => {
      if (!token) return;
      try {
        const res = await apiFetch(
          `${API}/api/chat/conversations/${convId}/messages?limit=100`,
        );
        const data = res ? await res.json() : [];
        setMessages(Array.isArray(data) ? data : []);
      } catch {
        setMessages([]);
      }
    },
    [token, apiFetch],
  );

  /* ── Browse groups ── */
  const loadBrowseGroups = useCallback(async () => {
    if (!token) return;
    try {
      const [gRes, cRes] = await Promise.all([
        apiFetch(`${API}/api/chat/groups/browse`),
        apiFetch(`${API}/api/chat/groups/categories`),
      ]);
      if (gRes) setBrowseGroups(await gRes.json());
      if (cRes) setCategories(await cRes.json());
    } catch {
      /* ignore */
    }
  }, [token, apiFetch]);

  /* ── WebSocket (optional — for group broadcasts & typing) ── */
  const connectWs = useCallback(() => {
    if (!token) return;
    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WS connected");
        if (activeConv) {
          ws.send(
            JSON.stringify({
              type: "join_room",
              conversation_id: activeConv.id,
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "message":
              // De-duplicate: only add if we don't already have this message
              setMessages((prev) => {
                if (prev.some((m) => m.id === data.message.id)) return prev;
                return [...prev, data.message];
              });
              loadConversations();
              break;
            case "ai_nudge":
              setNudge(data.content);
              setTimeout(() => setNudge(null), 10000);
              break;
            case "typing":
              break;
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        console.log("WS disconnected, reconnecting in 5s...");
        wsRef.current = null;
        setTimeout(connectWs, 5000);
      };
      ws.onerror = () => {
        console.warn("WS connection error — using REST fallback");
        ws.close();
      };
    } catch {
      /* WS not available — REST will handle everything */
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWs]);

  /* Join room when active conversation changes */
  useEffect(() => {
    if (activeConv && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "join_room", conversation_id: activeConv.id }),
      );
    }
  }, [activeConv]);

  /* Auto-scroll messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  /* Initial load */
  useEffect(() => {
    loadConversations();
    // Voice (ElevenLabs) availability is handled by useVoice; mic button shows whenever enabled.
    setSpeechAvailable(true);
  }, [loadConversations]);

  /* ── Create a new AI chat and return it ── */
  const createAIChat = useCallback(async (): Promise<Conversation | null> => {
    if (!token) return null;
    try {
      const res = await apiFetch(`${API}/api/chat/conversations/ai`, {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });
      if (!res) return null;
      const conv = await res.json();
      if (!conv?.id || conv.type !== "ai_private") return null;
      setConversations((prev) =>
        prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev],
      );
      return conv;
    } catch {
      return null;
    }
  }, [token, apiFetch]);

  /* ── Send message ── */
  const sendMessage = async () => {
    if ((!inputText.trim() && pendingImages.length === 0) || isStreaming) return;
    const text = inputText.trim();
    const images = [...pendingImages];
    setInputText("");
    setPendingImages([]);

    // Auto-create AI conversation if none is active
    let conv = activeConv;
    if (!conv) {
      conv = await createAIChat();
      if (!conv) return; // creation failed
      setActiveConv(conv);
      setMessages([]);
      setSidebarView("chats");
      setMobileShowChat(true);
    }

    if (conv.type === "ai_private") {
      // Optimistic: show user message immediately with image previews
      const optimisticMsg: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: conv.id,
        sender_id: user?.id || "",
        sender_name: user?.name || "You",
        content: text,
        is_ai_generated: 0,
        is_private_nudge: 0,
        created_at: Date.now() / 1000,
        attachments: images.map((img) => ({
          id: `temp_att_${Date.now()}`,
          type: "image",
          filename: img.file.name,
          mime_type: img.file.type,
          preview_url: img.preview,
        })),
        metadata: {},
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      // Use REST SSE streaming for AI response
      setIsStreaming(true);
      setStreamingText("");
      setToolStatuses([]);
      setChartDataList([]);
      setThinkingExpanded(true);

      try {
        // Convert images to base64 for multimodal AI
        const imageData: { base64: string; media_type: string }[] = [];
        for (const img of images) {
          const buf = await img.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          imageData.push({ base64, media_type: img.file.type });
        }

        const body = JSON.stringify({
          content: text || (imageData.length > 0 ? "[Image attached]" : ""),
          images: imageData.length > 0 ? imageData : undefined,
        });

        let res = await fetch(
          `${API}/api/chat/conversations/${conv.id}/stream`,
          {
            method: "POST",
            headers: hdrs(),
            body,
          },
        );

        // Recovery path: selected conversation was deleted locally/remotely.
        if (res.status === 404) {
          setConversations((prev) => prev.filter((c) => c.id !== conv!.id));
          const replacement = await createAIChat();
          if (!replacement) {
            throw new Error("Conversation not found and failed to create a new chat");
          }
          conv = replacement;
          setActiveConv(replacement);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticMsg.id
                ? { ...m, conversation_id: replacement.id }
                : m,
            ),
          );
          res = await fetch(
            `${API}/api/chat/conversations/${replacement.id}/stream`,
            {
              method: "POST",
              headers: hdrs(),
              body,
            },
          );
        }

        if (!res.ok) throw new Error(`Stream failed: ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let aiFullText = "";
        let collectedCharts: import("@/components/ChatChart").ChartData[] = [];
        let collectedAnalysis: {
          analysis_id: string;
          ticker: string;
          decision: string;
          confidence: string;
          agents?: Array<{ name: string; label: string; group: string; status: string; signal: string | null; headline: string }>;
          metrics?: { entry?: string; target?: string; stop_loss?: string; time_horizon?: string; risk_rating?: string };
          duration_seconds?: number;
        } | null = null;

        if (reader) {
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
                const event = JSON.parse(line.slice(6));
                if (event.type === "user_message" && event.message) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === optimisticMsg.id ? event.message : m,
                    ),
                  );
                } else if (event.type === "ai_tool_status") {
                  setToolStatuses((prev) => [...prev, event.message || ""]);
                } else if (event.type === "ai_chart_data" && event.chart) {
                  collectedCharts.push(event.chart);
                  setChartDataList((prev) => [...prev, event.chart]);
                } else if (event.type === "ai_analysis_event" && event.event) {
                  const ae = event.event;
                  if (ae.type === "analysis_started") {
                    setToolStatuses((prev) => [...prev, `🔬 Running deep analysis on ${ae.ticker}...`]);
                  } else if (ae.type === "analysis_complete") {
                    collectedAnalysis = {
                      analysis_id: ae.analysis_id,
                      ticker: ae.ticker,
                      decision: ae.decision,
                      confidence: ae.confidence,
                      agents: ae.agents || [],
                      metrics: ae.metrics || {},
                      duration_seconds: ae.duration_seconds,
                    };
                    setToolStatuses((prev) => [...prev, `✅ Analysis complete: ${ae.decision} (${ae.confidence} confidence)`]);
                  } else if (ae.type === "analysis_failed") {
                    setToolStatuses((prev) => [...prev, `❌ Analysis failed: ${ae.error}`]);
                  }
                } else if (event.type === "ai_chunk") {
                  aiFullText += event.chunk || "";
                  setStreamingText(aiFullText);
                  // Auto-collapse thinking once response text starts
                  if (aiFullText.length > 0) {
                    setThinkingExpanded(false);
                  }
                } else if (event.type === "ai_done") {
                  setIsStreaming(false);
                  setStreamingText("");
                  setToolStatuses([]);
                  setChartDataList([]);
                  if (event.message) {
                    const msgWithExtras = {
                      ...event.message,
                      ...(collectedCharts.length > 0 ? { charts: collectedCharts } : {}),
                      ...(collectedAnalysis ? { metadata: { ...event.message.metadata, analysis: collectedAnalysis } } : {}),
                    };
                    setMessages((prev) => [...prev, msgWithExtras]);
                  }
                  // Auto-rename conversation from first Q&A
                  if (event.conversation_name) {
                    setActiveConv((prev) =>
                      prev ? { ...prev, name: event.conversation_name } : prev,
                    );
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.id === conv!.id ? { ...c, name: event.conversation_name } : c,
                      ),
                    );
                  }
                }
              } catch {
                /* skip malformed SSE lines */
              }
            }
          }
        }
      } catch (err) {
        console.error("AI stream error:", err);
        setIsStreaming(false);
        setStreamingText("");
        setToolStatuses([]);
        setChartDataList([]);
      }

      loadConversations();
    } else {
      // Group messages: optimistic display + REST send
      const optimisticMsg: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: conv.id,
        sender_id: user?.id || "",
        sender_name: user?.name || "You",
        content: text,
        is_ai_generated: 0,
        is_private_nudge: 0,
        created_at: Date.now() / 1000,
        attachments: [],
        metadata: {},
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await apiFetch(
          `${API}/api/chat/conversations/${conv.id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ content: text }),
          },
        );
        if (res) {
          const data = await res.json();
          if (data?.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticMsg.id ? data.message : m)),
            );
          }
        }
      } catch {
        /* message stays as optimistic */
      }
      loadConversations();
    }
  };

  /* ── New AI Chat ── */
  const startNewChat = async () => {
    const conv = await createAIChat();
    if (!conv) return;
    setActiveConv(conv);
    setMessages([]);
    setSidebarView("chats");
    setMobileShowChat(true);
  };

  /* ── Join group ── */
  const joinGroup = async (conv: Conversation) => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API}/api/chat/groups/${conv.id}/join`, {
        method: "POST",
      });
      if (!res) return;
      const data = await res.json();
      // The backend returns the updated conversation with member_count
      const updatedConv = data.conversation || conv;
      await loadConversations();
      await loadBrowseGroups();
      setActiveConv(updatedConv);
      await loadMessages(conv.id);
      setSidebarView("groups");
      setMobileShowChat(true);
      // Join WS room for real-time updates
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "join_room", conversation_id: conv.id }),
        );
      }
    } catch {
      /* ignore */
    }
  };

  /* ── Select conversation ── */
  const selectConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    await loadMessages(conv.id);
    setMobileShowChat(true);
    // Join WebSocket room
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "join_room", conversation_id: conv.id }),
      );
    }
  };

  /* ── Delete conversation ── */
  const deleteConversation = async (convId: string) => {
    if (!token) return;
    const wasActive = activeConv?.id === convId;

    // Optimistic UI update to keep delete/snippet interactions snappy.
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (wasActive) {
      setActiveConv(null);
      setMessages([]);
    }

    try {
      const res = await apiFetch(`${API}/api/chat/conversations/${convId}`, {
        method: "DELETE",
      });
      if (!res) {
        void loadConversations();
        return;
      }
      void loadConversations();
    } catch {
      void loadConversations();
    }
  };

  /* ── Rename conversation ── */
  const renameConversation = async (convId: string, newName: string) => {
    if (!token || !newName.trim()) {
      setEditingConvId(null);
      return;
    }
    try {
      await apiFetch(`${API}/api/chat/conversations/${convId}/rename`, {
        method: "PUT",
        body: JSON.stringify({ name: newName.trim() }),
      });
      await loadConversations();
      if (activeConv?.id === convId) {
        setActiveConv((prev) => prev ? { ...prev, name: newName.trim() } : prev);
      }
    } catch {
      /* ignore */
    }
    setEditingConvId(null);
  };

  const handleDragEnd = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...conversations];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setConversations(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    // Persist to backend
    try {
      await apiFetch(`${API}/api/chat/conversations/reorder`, {
        method: "PUT",
        body: JSON.stringify({ conversation_ids: reordered.map((c) => c.id) }),
      });
    } catch {
      /* ignore */
    }
  };

  /* ── Speech-to-text via ElevenLabs (server-side) ── */
  const voice = useVoice();
  const [autoSpeakAI, setAutoSpeakAI] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const startRecording = async () => {
    if (!voice.enabled) return;
    try {
      await voice.startRecording();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!voice.recording) {
      setIsRecording(false);
      return;
    }
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      const text = await voice.stopAndTranscribe();
      if (text) {
        setInputText((prev) => (prev ? prev.trimEnd() + " " + text : text));
        inputRef.current?.focus();
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const speakMessage = async (msg: Message) => {
    if (!voice.enabled) return;
    if (speakingMsgId === msg.id) {
      voice.stop();
      setSpeakingMsgId(null);
      return;
    }
    // Strip markdown lightly so TTS doesn't read syntax.
    const plain = (msg.content || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return;
    setSpeakingMsgId(msg.id);
    try {
      await voice.speak(plain);
    } finally {
      setSpeakingMsgId(null);
    }
  };

  /* Auto-speak the latest AI reply when toggle is on */
  const lastSpokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSpeakAI || isStreaming || !voice.enabled) return;
    const last = messages[messages.length - 1];
    if (!last || !last.is_ai_generated || !last.content) return;
    if (lastSpokenIdRef.current === last.id) return;
    lastSpokenIdRef.current = last.id;
    speakMessage(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming, autoSpeakAI, voice.enabled]);

  /* ── Image attachment handling ── */
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: { file: File; preview: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024) {
        newImages.push({ file, preview: URL.createObjectURL(file) });
      }
    }
    setPendingImages((prev) => [...prev, ...newImages]);
    if (e.target) e.target.value = "";
  };

  const removeImage = (index: number) => {
    setPendingImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Please log in to use chat.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-0px)] bg-background">
      {/* ── AI Nudge Toast ── */}
      {nudge && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-primary/10 border border-primary/30 rounded-lg p-4 shadow-lg animate-in slide-in-from-right">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-primary mb-1">
                Paloor AI whispers...
              </p>
              <p className="text-sm text-primary">{nudge}</p>
            </div>
            <button
              onClick={() => setNudge(null)}
              className="text-primary hover:text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ════════ LEFT SIDEBAR ════════ */}
      <div
        className={`w-72 border-r border-border bg-background flex flex-col shrink-0 ${
          mobileShowChat ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-base tracking-tight">Chat</h2>
            <button
              onClick={startNewChat}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="New AI Chat"
            >
              <Plus size={16} />
            </button>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1">
            {(["chats", "groups", "browse"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setSidebarView(tab);
                  if (tab === "browse") loadBrowseGroups();
                }}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  sidebarView === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {tab === "chats"
                  ? "AI Chats"
                  : tab === "groups"
                    ? "Groups"
                    : "Browse"}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sidebarView === "chats" ? (
            /* ── AI Chats List ── */
            <div className="p-2 space-y-0.5">
              {conversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground mb-3">
                    No conversations yet
                  </p>
                  <button
                    onClick={startNewChat}
                    className="text-xs text-primary hover:text-primary font-medium"
                  >
                    Start your first chat →
                  </button>
                </div>
              ) : (
                conversations.map((conv, idx) => (
                  <div
                    key={conv.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIdx(idx);
                    }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={() => {
                      if (dragIdx !== null) handleDragEnd(dragIdx, idx);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onClick={() => selectConversation(conv)}
                    className={`w-full text-left px-2 py-2.5 rounded-lg transition-colors group cursor-pointer ${
                      activeConv?.id === conv.id
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    } ${dragOverIdx === idx ? "border-t-2 border-primary" : ""} ${dragIdx === idx ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                      <Bot className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {editingConvId === conv.id ? (
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => renameConversation(conv.id, editingName)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameConversation(conv.id, editingName);
                              if (e.key === "Escape") setEditingConvId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-medium w-full bg-background border border-primary rounded px-1 py-0.5 focus:outline-none"
                          />
                        ) : (
                          <p className="text-sm font-medium truncate">
                            {conv.name}
                          </p>
                        )}
                        {conv.last_message && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {conv.last_message.content?.slice(0, 60)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(conv.last_message_at)}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingConvId(conv.id);
                              setEditingName(conv.name);
                            }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
                            title="Rename chat"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(conv.id);
                            }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Delete chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : sidebarView === "groups" ? (
            /* ── My Groups ── */
            <div className="p-2 space-y-0.5">
              {groups.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground mb-3">
                    No groups joined yet
                  </p>
                  <button
                    onClick={() => {
                      setSidebarView("browse");
                      loadBrowseGroups();
                    }}
                    className="text-xs text-primary hover:text-primary font-medium"
                  >
                    Browse groups →
                  </button>
                </div>
              ) : (
                groups.map((g) => {
                  const Icon = CATEGORY_ICONS[g.category] || Hash;
                  return (
                    <button
                      key={g.id}
                      onClick={() => selectConversation(g)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        activeConv?.id === g.id
                          ? "bg-accent"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {g.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {g.member_count || 0} members
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {timeAgo(g.last_message_at)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            /* ── Browse Groups ── */
            <div className="p-3 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Join a community
              </p>
              {browseGroups.map((g) => {
                const Icon = CATEGORY_ICONS[g.category] || Hash;
                const isJoined = groups.some((mg) => mg.id === g.id);
                return (
                  <div
                    key={g.id}
                    className="border border-border rounded-lg p-3 hover:border-foreground/20 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{g.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {g.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            {g.member_count || 0} members
                          </span>
                          {isJoined ? (
                            <span className="text-[10px] text-primary font-medium">
                              Joined ✓
                            </span>
                          ) : (
                            <button
                              onClick={() => joinGroup(g)}
                              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Join →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {browseGroups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No groups available yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════ MAIN CHAT AREA ════════ */}
      <div
        className={`flex-1 flex flex-col ${!mobileShowChat && !activeConv ? "hidden md:flex" : "flex"}`}
      >
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
              <button
                onClick={() => {
                  setMobileShowChat(false);
                  setActiveConv(null);
                }}
                className="md:hidden p-1 rounded hover:bg-accent"
              >
                <ArrowLeft size={16} />
              </button>
              {activeConv.type === "ai_private" ? (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold truncate">
                  {activeConv.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {activeConv.type === "ai_private"
                    ? "Paloor AI • Context-aware"
                    : `${activeConv.member_count || 0} members • ${activeConv.category}`}
                </p>
              </div>
              <button
                onClick={() => deleteConversation(activeConv.id)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                title="Delete conversation"
              >
                <Archive size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {activeConv.type === "ai_private" ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">Paloor AI</h3>
                      <p className="text-sm text-muted-foreground max-w-md">
                        I have your complete financial profile loaded. Ask me
                        anything about your assets, portfolio, tax strategy, or
                        financial goals.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-4 justify-center">
                        {[
                          "What's my net worth?",
                          "Analyze my tax situation",
                          "Review my portfolio risk",
                          "Suggest ways to save more",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setInputText(q);
                              setTimeout(() => inputRef.current?.focus(), 0);
                            }}
                            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No messages yet. Start the conversation!
                      </p>
                    </>
                  )}
                </div>
              )}

              {messages.filter(Boolean).map((msg, idx, arr) => {
                if (!msg || !msg.sender_id) return null;

                // Date separator: show when day changes between messages
                const prevMsg = idx > 0 ? arr[idx - 1] : null;
                const showDateSep =
                  !prevMsg ||
                  new Date(typeof msg.created_at === "string" ? msg.created_at : msg.created_at * 1000).toDateString() !==
                    new Date(typeof prevMsg?.created_at === "string" ? prevMsg.created_at : (prevMsg?.created_at || 0) * 1000).toDateString();

                const isMe = msg.sender_id === user?.id;
                const isAI = !!msg.is_ai_generated;
                const isSystem = msg.sender_id === "system";

                const dateSep = showDateSep ? (
                  <div
                    key={`date-${msg.id}`}
                    className="flex items-center gap-3 my-3"
                  >
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground font-medium px-2">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                ) : null;

                if (isSystem) {
                  return (
                    <React.Fragment key={msg.id}>
                      {dateSep}
                      <div className="flex justify-center">
                        <span className="text-[11px] text-muted-foreground bg-accent/50 px-3 py-1 rounded-full">
                          {msg.content}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={msg.id}>
                    {dateSep}
                    <div
                      className={`flex gap-2.5 ${isMe && !isAI ? "justify-end" : "justify-start"}`}
                    >
                      {/* Avatar */}
                      {(isAI || !isMe) && (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isAI ? "bg-primary/10" : "bg-blue-50"
                          }`}
                        >
                          {isAI ? (
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <span className="text-[10px] font-medium text-blue-600">
                              {(msg.sender_name || "U")[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] md:max-w-[75%] ${isMe && !isAI ? "text-right" : ""}`}
                      >
                        {/* Sender name for group chats */}
                        {activeConv.type === "group" && !isMe && (
                          <p
                            className={`text-[10px] mb-0.5 ${isAI ? "text-primary font-medium" : "text-muted-foreground"}`}
                          >
                            {msg.sender_name || "User"}
                          </p>
                        )}

                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            isAI
                              ? "bg-primary/10 text-foreground rounded-tl-md"
                              : isMe
                                ? "bg-primary text-primary-foreground rounded-tr-md"
                                : "bg-accent text-foreground rounded-tl-md"
                          }`}
                        >
                          {/* Image attachments */}
                          {msg.attachments?.filter((a: any) => a.type === "image").length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {msg.attachments.filter((a: any) => a.type === "image").map((att: any, i: number) => {
                                const src = att.preview_url || `${API}/api/chat/attachments/${att.id}/file?token=${token}`;
                                return (
                                  <img
                                    key={att.id || i}
                                    src={src}
                                    alt={att.filename || "Image"}
                                    className="max-w-[240px] max-h-[200px] rounded-lg object-contain cursor-pointer"
                                    onClick={() => window.open(src, "_blank")}
                                  />
                                );
                              })}
                            </div>
                          )}
                          {msg.content && <MarkdownMessage content={msg.content} isAI={isAI} />}
                        </div>

                        {/* Charts rendered outside the text bubble */}
                        {isAI && (() => {
                          const charts = msg.charts || msg.metadata?.charts;
                          return charts?.length ? <ChartCarousel charts={charts} /> : null;
                        })()}

                        {/* Deep Analysis breakdown */}
                        {isAI && msg.metadata?.analysis?.analysis_id && (
                          <AnalysisBreakdown analysis={msg.metadata.analysis} />
                        )}

                        <p className="text-[9px] text-muted-foreground mt-1 px-1 flex items-center gap-2">
                          {formatTime(msg.created_at)}
                          {isAI && voice.enabled && msg.content && (
                            <button
                              onClick={() => speakMessage(msg)}
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                              title={speakingMsgId === msg.id ? "Stop" : "Listen"}
                            >
                              {speakingMsgId === msg.id ? (
                                <>
                                  <Square className="h-2.5 w-2.5" /> Stop
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-2.5 w-2.5" /> Listen
                                </>
                              )}
                            </button>
                          )}
                        </p>
                      </div>

                      {/* Spacer for sent messages */}
                      {isMe && !isAI && <div className="w-7 shrink-0" />}
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Streaming indicator */}
              {isStreaming && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="max-w-[85%] md:max-w-[75%] space-y-2">
                    {/* Thinking / tool status section */}
                    {toolStatuses.length > 0 && (
                      <div className="bg-muted/60 rounded-xl border border-border/50 overflow-hidden">
                        <button
                          onClick={() => setThinkingExpanded((v) => !v)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
                        >
                          {thinkingExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <Loader2 className={`h-3 w-3 ${!streamingText ? "animate-spin" : ""}`} />
                          <span className="font-medium">
                            {streamingText
                              ? `Analyzed ${toolStatuses.length} source${toolStatuses.length > 1 ? "s" : ""}`
                              : `Fetching data\u2026`}
                          </span>
                        </button>
                        {thinkingExpanded && (
                          <div className="px-3 pb-2 space-y-1">
                            {toolStatuses.map((status, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                {streamingText ? (
                                  <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  </div>
                                ) : i === toolStatuses.length - 1 ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                ) : (
                                  <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  </div>
                                )}
                                <span>{status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Charts section — between thinking and response */}
                    {chartDataList.length > 0 && (
                      <ChartCarousel charts={chartDataList} />
                    )}
                    {/* Response bubble */}
                    <div className="bg-primary/10 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed">
                      {streamingText ? (
                        <MarkdownMessage content={streamingText} isAI={true} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-border p-3">
              {/* Image preview strip */}
              {pendingImages.length > 0 && (
                <div className="flex gap-2 mb-2 max-w-4xl mx-auto overflow-x-auto pb-1">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative shrink-0 group">
                      <img
                        src={img.preview}
                        alt={`Attachment ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1.5 max-w-4xl mx-auto">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={
                      isRecording
                        ? "Listening... click mic to stop"
                        : activeConv?.type === "ai_private"
                          ? "Ask Paloor AI anything about your finances..."
                          : activeConv?.type === "group"
                            ? "Type a message..."
                            : "Ask Paloor AI anything about your finances..."
                    }
                    rows={1}
                    className="w-full resize-none rounded-xl border border-border bg-background pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary max-h-32"
                    style={{ minHeight: "42px" }}
                  />
                </div>
                {/* Action buttons - all on same row */}
                {(!activeConv || activeConv.type === "ai_private") && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                    title="Attach image"
                  >
                    <ImageIcon size={16} />
                  </button>
                )}
                {voice.enabled && (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse hover:bg-red-600"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    } disabled:opacity-50`}
                    title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Voice input (ElevenLabs)"}
                  >
                    {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                {voice.enabled && (
                  <button
                    onClick={() => setAutoSpeakAI((v) => !v)}
                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      autoSpeakAI
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    title={autoSpeakAI ? "Auto-read AI replies: ON" : "Auto-read AI replies: OFF"}
                  >
                    <Volume2 size={16} />
                  </button>
                )}
                <button
                  onClick={sendMessage}
                  disabled={(!inputText.trim() && pendingImages.length === 0) || isStreaming}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
              {(!activeConv || activeConv.type === "ai_private") && (
                <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                  For educational purposes only. Not financial advice. Consult a qualified advisor before making investment decisions.
                </p>
              )}
            </div>
          </>
        ) : (
          /* ── Empty state — can type directly to start chatting ── */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center mb-6">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Paloor AI</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                I have your complete financial profile loaded. Ask me anything
                about your assets, portfolio, tax strategy, or financial goals.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {[
                  "What's my net worth?",
                  "Analyze my tax situation",
                  "Review my portfolio risk",
                  "Suggest ways to save more",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInputText(q);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSidebarView("browse");
                  loadBrowseGroups();
                }}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Users size={14} />
                Or browse community groups
              </button>
            </div>
            {/* Input bar in empty state — auto-creates conversation */}
            <div className="border-t border-border p-3">
              {/* Image preview strip */}
              {pendingImages.length > 0 && (
                <div className="flex gap-2 mb-2 max-w-4xl mx-auto overflow-x-auto pb-1">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative shrink-0 group">
                      <img
                        src={img.preview}
                        alt={`Attachment ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1.5 max-w-4xl mx-auto">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={
                      isRecording
                        ? "Listening... click mic to stop"
                        : "Ask Paloor AI anything about your finances..."
                    }
                    rows={1}
                    className="w-full resize-none rounded-xl border border-border bg-background pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary max-h-32"
                    style={{ minHeight: "42px" }}
                  />
                </div>
                {/* Action buttons - all on same row */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                  title="Attach image"
                >
                  <ImageIcon size={16} />
                </button>
                {voice.enabled && (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse hover:bg-red-600"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    } disabled:opacity-50`}
                    title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Voice input (ElevenLabs)"}
                  >
                    {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                {voice.enabled && (
                  <button
                    onClick={() => setAutoSpeakAI((v) => !v)}
                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      autoSpeakAI
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    title={autoSpeakAI ? "Auto-read AI replies: ON" : "Auto-read AI replies: OFF"}
                  >
                    <Volume2 size={16} />
                  </button>
                )}
                <button
                  onClick={sendMessage}
                  disabled={(!inputText.trim() && pendingImages.length === 0) || isStreaming}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                For educational purposes only. Not financial advice. Consult a qualified advisor before making investment decisions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
