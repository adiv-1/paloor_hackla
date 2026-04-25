"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  Bot,
  Send,
  Users,
  UserCheck,
  Clock,
  Shield,
  ChevronLeft,
  Loader2,
  ArrowLeft,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Crown,
  Eye,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ─────────────── types ─────────────── */
interface CohortConversation {
  id: string;
  name: string;
  description: string;
  category: string;
  expires_at: string | null;
  created_by: string;
  member_count?: number;
  cohort?: {
    id: string;
    life_stage: string;
    status: string;
    wm_id: string;
    max_members: number;
    expires_at: string;
  } | null;
  last_message?: {
    content: string;
    sender_name: string;
  } | null;
}

interface AvailableCohort {
  id: string;
  conversation_id: string;
  life_stage: string;
  status: string;
  max_members: number;
  member_count: number;
  conv_name: string;
  conv_expires_at: string;
  wm_name: string;
  firm_name: string;
}

interface CohortMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_ai_generated: boolean;
  sender_role?: "member" | "wealth_manager" | "ai" | "system";
  is_own?: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface LifeStage {
  key: string;
  label: string;
  description: string;
}

interface CohortMember {
  user_id: string;
  role: string;
  display_name: string;
  name?: string;
  age?: number;
  occupation?: string;
  annual_income?: string;
  risk_tolerance?: string;
}

/* ─────────────── helpers ─────────────── */
function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatExpiry(ts: string) {
  const exp = new Date(ts);
  const now = new Date();
  const diff = exp.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function formatDateSeparator(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─────────────── Markdown renderer ─────────────── */
function CohortMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        code: ({ children, className }) => {
          if (className) {
            return (
              <pre className="bg-black/5 dark:bg-white/5 rounded p-2 my-1.5 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-black/5 dark:bg-white/5 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function CohortPage() {
  const { user, token } = useAuth();

  /* ── state ── */
  const [sidebarView, setSidebarView] = useState<
    "my-cohorts" | "browse" | "wm-panel"
  >("my-cohorts");
  const [myCohorts, setMyCohorts] = useState<CohortConversation[]>([]);
  const [availableCohorts, setAvailableCohorts] = useState<AvailableCohort[]>(
    [],
  );
  const [lifeStages, setLifeStages] = useState<LifeStage[]>([]);
  const [activeCohort, setActiveCohort] = useState<CohortConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<CohortMessage[]>([]);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [isWM, setIsWM] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showWMRegister, setShowWMRegister] = useState(false);
  const [showCreateCohort, setShowCreateCohort] = useState(false);
  const [wmAgreed, setWmAgreed] = useState<Record<string, boolean>>({});
  const [filterStage, setFilterStage] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* ── API helper ── */
  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (!token) return null;
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      if (!res.ok) return null;
      return res;
    },
    [token],
  );

  /* ── scroll to bottom ── */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  /* ── load data ── */
  const loadMyCohorts = useCallback(async () => {
    const res = await apiFetch(`${API}/api/cohort/my-cohorts`);
    if (res) {
      const data = await res.json();
      setMyCohorts(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [apiFetch]);

  const loadAvailableCohorts = useCallback(async () => {
    const url = filterStage
      ? `${API}/api/cohort/available?life_stage=${filterStage}`
      : `${API}/api/cohort/available`;
    const res = await apiFetch(url);
    if (res) setAvailableCohorts(await res.json());
  }, [apiFetch, filterStage]);

  const loadLifeStages = useCallback(async () => {
    const res = await apiFetch(`${API}/api/cohort/life-stages`);
    if (res) setLifeStages(await res.json());
  }, [apiFetch]);

  const checkWMStatus = useCallback(async () => {
    const res = await apiFetch(`${API}/api/cohort/wm/status`);
    if (res) {
      const data = await res.json();
      setIsWM(data.is_wealth_manager);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!token) return;
    loadMyCohorts();
    loadLifeStages();
    checkWMStatus();
  }, [token, loadMyCohorts, loadLifeStages, checkWMStatus]);

  // Reload available cohorts when filter changes
  useEffect(() => {
    if (sidebarView === "browse") loadAvailableCohorts();
  }, [filterStage, sidebarView, loadAvailableCohorts]);

  /* ── load messages for active cohort ── */
  const loadMessages = useCallback(
    async (convId: string) => {
      const res = await apiFetch(`${API}/api/cohort/${convId}/messages`);
      if (res) setMessages(await res.json());
    },
    [apiFetch],
  );

  const loadMembers = useCallback(
    async (convId: string) => {
      const res = await apiFetch(`${API}/api/cohort/${convId}/members`);
      if (res) setMembers(await res.json());
    },
    [apiFetch],
  );

  useEffect(() => {
    if (activeCohort) {
      loadMessages(activeCohort.id);
      loadMembers(activeCohort.id);
    }
  }, [activeCohort, loadMessages, loadMembers]);

  /* ── open a cohort ── */
  const openCohort = (cohort: CohortConversation) => {
    setActiveCohort(cohort);
    setMobileShowChat(true);
    setShowMembers(false);
  };

  /* ── join cohort ── */
  const joinCohort = async (convId: string) => {
    const res = await apiFetch(`${API}/api/cohort/${convId}/join`, {
      method: "POST",
    });
    if (res) {
      const data = await res.json();
      await loadMyCohorts();
      if (data.conversation) {
        openCohort(data.conversation);
      }
    }
  };

  /* ── agree to terms (WM) ── */
  const agreeToTerms = async (convId: string) => {
    const res = await apiFetch(`${API}/api/cohort/${convId}/agree-terms`, {
      method: "POST",
    });
    if (res) {
      setWmAgreed((prev) => ({ ...prev, [convId]: true }));
      loadMembers(convId);
    }
  };

  /* ── send message ── */
  const sendMessage = async () => {
    if (!inputText.trim() || !activeCohort || isStreaming) return;

    const content = inputText.trim();
    setInputText("");
    setIsStreaming(true);
    setStreamingText("");

    try {
      const res = await fetch(
        `${API}/api/cohort/${activeCohort.id}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        },
      );

      if (!res.ok || !res.body) {
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAIText = "";

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
            if (event.type === "user_message") {
              setMessages((prev) => [...prev, event.message]);
            } else if (event.type === "ai_chunk") {
              fullAIText += event.chunk;
              setStreamingText(fullAIText);
            } else if (event.type === "ai_done") {
              setMessages((prev) => [...prev, event.message]);
              setStreamingText("");
              fullAIText = "";
            } else if (event.type === "stream_end") {
              // done
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      console.error("Cohort stream error:", err);
    } finally {
      setIsStreaming(false);
    }
  };

  /* ── create cohort (WM only) ── */
  const [newCohortStage, setNewCohortStage] = useState("");
  const [newCohortDuration, setNewCohortDuration] = useState(48);

  const createCohort = async () => {
    if (!newCohortStage) return;
    const res = await apiFetch(`${API}/api/cohort/create`, {
      method: "POST",
      body: JSON.stringify({
        life_stage: newCohortStage,
        duration_hours: newCohortDuration,
      }),
    });
    if (res) {
      setShowCreateCohort(false);
      setNewCohortStage("");
      loadMyCohorts();
    }
  };

  /* ── WM registration ── */
  const [wmForm, setWmForm] = useState({
    firm_name: "",
    license_number: "",
    bio: "",
  });

  const registerWM = async () => {
    const res = await apiFetch(`${API}/api/cohort/wm/register`, {
      method: "POST",
      body: JSON.stringify(wmForm),
    });
    if (res) {
      setIsWM(true);
      setShowWMRegister(false);
    }
  };

  /* ─────────────── RENDER ─────────────── */
  if (!user) return null;

  const isExpired = (cohort: CohortConversation) => {
    if (!cohort.expires_at) return false;
    return new Date(cohort.expires_at) < new Date();
  };

  return (
    <div className="flex h-[calc(100vh-0px)] bg-background">
      {/* ════════ LEFT SIDEBAR ════════ */}
      <div
        className={`w-72 border-r border-border bg-background flex flex-col shrink-0 ${
          mobileShowChat ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-base tracking-tight">Cohorts</h2>
            {isWM && (
              <button
                onClick={() => setShowCreateCohort(true)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Create Cohort"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          {/* Tab bar */}
          <div className="flex gap-1">
            {(["my-cohorts", "browse"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setSidebarView(tab);
                  if (tab === "browse") loadAvailableCohorts();
                }}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  sidebarView === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {tab === "my-cohorts" ? "My Cohorts" : "Browse"}
              </button>
            ))}
            {!isWM && (
              <button
                onClick={() => setShowWMRegister(true)}
                className="flex-1 text-xs py-1.5 rounded-md font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                For WMs
              </button>
            )}
            {isWM && (
              <button
                onClick={() => setSidebarView("wm-panel")}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  sidebarView === "wm-panel"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                WM Panel
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sidebarView === "my-cohorts" ? (
            /* ── My Cohorts List ── */
            <div className="p-2 space-y-0.5">
              {myCohorts.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground mb-3">
                    No cohorts yet
                  </p>
                  <button
                    onClick={() => {
                      setSidebarView("browse");
                      loadAvailableCohorts();
                    }}
                    className="text-xs text-primary hover:text-primary font-medium"
                  >
                    Browse available cohorts →
                  </button>
                </div>
              ) : (
                myCohorts.map((cohort) => (
                  <button
                    key={cohort.id}
                    onClick={() => openCohort(cohort)}
                    className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                      activeCohort?.id === cohort.id
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isExpired(cohort)
                            ? "bg-muted"
                            : "bg-emerald-50 dark:bg-emerald-950"
                        }`}
                      >
                        <Users
                          className={`h-4 w-4 ${isExpired(cohort) ? "text-muted-foreground" : "text-emerald-500"}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {cohort.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock size={10} className="text-muted-foreground" />
                          <span
                            className={`text-[10px] ${isExpired(cohort) ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {cohort.expires_at
                              ? formatExpiry(cohort.expires_at)
                              : "No expiry"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {cohort.last_message && (
                      <p className="text-[11px] text-muted-foreground truncate mt-1 ml-10">
                        {cohort.last_message.sender_name}:{" "}
                        {cohort.last_message.content}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          ) : sidebarView === "browse" ? (
            /* ── Browse Available Cohorts ── */
            <div className="p-2">
              {/* Life stage filter */}
              <div className="mb-3">
                <select
                  value={filterStage}
                  onChange={(e) => {
                    setFilterStage(e.target.value);
                  }}
                  className="w-full text-xs p-1.5 rounded-md border border-border bg-background"
                >
                  <option value="">All Life Stages</option>
                  {lifeStages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {availableCohorts.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No cohorts available right now
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableCohorts.map((cohort) => (
                    <div
                      key={cohort.id}
                      className="p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <p className="text-sm font-medium">{cohort.conv_name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <Crown size={10} className="inline mr-1" />
                        {cohort.wm_name}
                        {cohort.firm_name && ` • ${cohort.firm_name}`}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>
                          <Users size={10} className="inline mr-0.5" />
                          {cohort.member_count}/{cohort.max_members + 1}
                        </span>
                        <span>
                          <Clock size={10} className="inline mr-0.5" />
                          {formatExpiry(cohort.conv_expires_at)}
                        </span>
                      </div>
                      <button
                        onClick={() => joinCohort(cohort.conversation_id)}
                        className="mt-2 w-full text-xs py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Join Cohort
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : sidebarView === "wm-panel" ? (
            /* ── Wealth Manager Panel ── */
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950">
                <Crown className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Wealth Manager
                </span>
              </div>
              <button
                onClick={() => setShowCreateCohort(true)}
                className="w-full text-xs py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-3"
              >
                <Plus size={12} className="inline mr-1" /> Create New Cohort
              </button>

              {/* WM's cohorts */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Your Cohorts
              </p>
              {myCohorts
                .filter((c) => c.created_by === user.id)
                .map((cohort) => (
                  <button
                    key={cohort.id}
                    onClick={() => openCohort(cohort)}
                    className={`w-full text-left p-2 rounded-lg mb-1 transition-colors ${
                      activeCohort?.id === cohort.id
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <p className="text-xs font-medium truncate">
                      {cohort.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {cohort.member_count || 0} members •{" "}
                      {cohort.expires_at
                        ? formatExpiry(cohort.expires_at)
                        : "Active"}
                    </p>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ════════ MAIN CHAT AREA ════════ */}
      <div
        className={`flex-1 flex flex-col ${!mobileShowChat && !activeCohort ? "hidden md:flex" : "flex"}`}
      >
        {activeCohort ? (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
              <button
                onClick={() => {
                  setMobileShowChat(false);
                  setActiveCohort(null);
                }}
                className="md:hidden p-1 rounded hover:bg-accent"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold truncate">
                  {activeCohort.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {members.length} members •{" "}
                  {activeCohort.expires_at
                    ? formatExpiry(activeCohort.expires_at)
                    : "Active"}
                </p>
              </div>

              {/* WM terms agreement button */}
              {isWM && activeCohort.created_by === user.id && !wmAgreed[activeCohort.id] && (
                <button
                  onClick={() => agreeToTerms(activeCohort.id)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
                >
                  <Shield size={12} />
                  Agree to Terms
                </button>
              )}

              {/* Members toggle */}
              <button
                onClick={() => setShowMembers(!showMembers)}
                className={`p-1.5 rounded-md transition-colors ${
                  showMembers
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title="Members"
              >
                <Eye size={14} />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {messages.length === 0 && !isStreaming && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">
                      Cohort Session
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      This is a private group with a wealth manager. Names are
                      anonymized for your privacy. Ask questions freely!
                    </p>
                  </div>
                )}

                {messages.filter(Boolean).map((msg, idx, arr) => {
                  const prevMsg = idx > 0 ? arr[idx - 1] : null;
                  const showDateSep =
                    !prevMsg ||
                    new Date(msg.created_at).toDateString() !==
                      new Date(prevMsg?.created_at || "").toDateString();

                  const role = msg.sender_role || "member";
                  const isSystem = msg.sender_id === "system";
                  const isAI = role === "ai" || msg.is_ai_generated;
                  const isWMMsg = role === "wealth_manager";
                  const isOwn = msg.is_own;

                  // Layout: clients on right, WM + AI on left
                  const isLeftSide = isAI || isWMMsg;

                  const dateSep = showDateSep ? (
                    <div className="flex items-center gap-3 my-3">
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
                        className={`flex gap-2.5 ${isLeftSide ? "justify-start" : "justify-end"}`}
                      >
                        {/* Left-side avatar (WM or AI) */}
                        {isLeftSide && (
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              isAI
                                ? "bg-violet-50 dark:bg-violet-950"
                                : "bg-emerald-50 dark:bg-emerald-950"
                            }`}
                          >
                            {isAI ? (
                              <Bot className="h-3.5 w-3.5 text-violet-500" />
                            ) : (
                              <Crown className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </div>
                        )}

                        <div
                          className={`max-w-[85%] md:max-w-[70%] ${!isLeftSide ? "text-right" : ""}`}
                        >
                          {/* Sender name */}
                          <p
                            className={`text-[10px] mb-0.5 ${
                              isAI
                                ? "text-violet-500 font-medium"
                                : isWMMsg
                                  ? "text-emerald-600 font-medium"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {isAI
                              ? "Paloor AI"
                              : msg.sender_name || "Member"}
                          </p>

                          {/* Message bubble */}
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              isAI
                                ? "bg-violet-50 dark:bg-violet-950/50 text-foreground rounded-tl-md border border-violet-100 dark:border-violet-900"
                                : isWMMsg
                                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-foreground rounded-tl-md border border-emerald-100 dark:border-emerald-900"
                                  : isOwn
                                    ? "bg-green-600 text-white rounded-tr-md"
                                    : "bg-green-100 dark:bg-green-950/50 text-foreground rounded-tr-md"
                            }`}
                          >
                            {isAI || isWMMsg ? (
                              <CohortMarkdown content={msg.content} />
                            ) : (
                              <p className="whitespace-pre-wrap">
                                {msg.content}
                              </p>
                            )}
                          </div>

                          <p className="text-[9px] text-muted-foreground mt-1 px-1">
                            {formatTime(msg.created_at)}
                          </p>
                        </div>

                        {/* Right spacer for left-side messages */}
                        {isLeftSide && <div className="w-7 shrink-0" />}
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* Streaming indicator */}
                {isStreaming && streamingText && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-7 h-7 rounded-full bg-violet-50 dark:bg-violet-950 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <div className="max-w-[85%] md:max-w-[70%]">
                      <p className="text-[10px] text-violet-500 font-medium mb-0.5">
                        Paloor AI
                      </p>
                      <div className="bg-violet-50 dark:bg-violet-950/50 text-foreground rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed border border-violet-100 dark:border-violet-900">
                        <CohortMarkdown content={streamingText} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Members Panel (right side) */}
              {showMembers && (
                <div className="w-64 border-l border-border bg-background overflow-y-auto p-3 shrink-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Members ({members.length})
                  </h3>
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.user_id}
                        className="p-2 rounded-lg bg-accent/30"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              m.role === "wealth_manager"
                                ? "bg-emerald-50 dark:bg-emerald-950"
                                : "bg-green-50 dark:bg-green-950"
                            }`}
                          >
                            {m.role === "wealth_manager" ? (
                              <Crown className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <span className="text-[9px] font-medium text-green-600">
                                {(m.display_name || "?")[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {m.display_name || m.name || "Member"}
                            </p>
                            {m.role === "wealth_manager" && (
                              <p className="text-[9px] text-emerald-600">
                                Wealth Manager
                              </p>
                            )}
                          </div>
                        </div>
                        {/* WM sees extra profile info if agreed */}
                        {m.name &&
                          m.role !== "wealth_manager" &&
                          isWM && (
                            <div className="mt-1.5 pl-8 text-[10px] text-muted-foreground space-y-0.5">
                              <p>Name: {m.name}</p>
                              {m.age && <p>Age: {m.age}</p>}
                              {m.occupation && <p>Role: {m.occupation}</p>}
                              {m.annual_income && (
                                <p>Income: {m.annual_income}</p>
                              )}
                              {m.risk_tolerance && (
                                <p>Risk: {m.risk_tolerance}</p>
                              )}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t border-border p-3">
              {isExpired(activeCohort) ? (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <AlertCircle size={14} />
                    This cohort session has expired
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-1.5 max-w-4xl mx-auto">
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
                      placeholder="Type a message..."
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-border bg-background pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary max-h-32"
                      style={{ minHeight: "42px" }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!inputText.trim() || isStreaming}
                      className="p-2.5 rounded-xl bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                    Names are anonymized. AI may assist with factual information.
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-950 dark:to-emerald-900 flex items-center justify-center mb-6">
              <UserCheck className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Expert Cohorts</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Join a small group of 5-6 people at a similar life stage, paired
              with a wealth manager for a focused 48-hour session. Your
              identity stays anonymous.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSidebarView("browse");
                  loadAvailableCohorts();
                }}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Search size={14} />
                Browse Cohorts
              </button>
              {!isWM && (
                <button
                  onClick={() => setShowWMRegister(true)}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <Crown size={14} />
                  I&apos;m a Wealth Manager
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════ MODALS ════════ */}

      {/* WM Registration Modal */}
      {showWMRegister && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-1">
              Register as Wealth Manager
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set up your profile to create and manage cohort sessions.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Firm Name
                </label>
                <input
                  value={wmForm.firm_name}
                  onChange={(e) =>
                    setWmForm({ ...wmForm, firm_name: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g., Morgan Stanley"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  License / CRD Number
                </label>
                <input
                  value={wmForm.license_number}
                  onChange={(e) =>
                    setWmForm({ ...wmForm, license_number: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g., CRD#1234567"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Bio
                </label>
                <textarea
                  value={wmForm.bio}
                  onChange={(e) =>
                    setWmForm({ ...wmForm, bio: e.target.value })
                  }
                  rows={3}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Brief description of your expertise..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowWMRegister(false)}
                className="flex-1 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={registerWM}
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Cohort Modal (WM only) */}
      {showCreateCohort && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-1">Create New Cohort</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set up a 48-hour cohort session for users at a specific life
              stage.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Life Stage
                </label>
                <select
                  value={newCohortStage}
                  onChange={(e) => setNewCohortStage(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a life stage...</option>
                  {lifeStages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Duration (hours)
                </label>
                <input
                  type="number"
                  value={newCohortDuration}
                  onChange={(e) =>
                    setNewCohortDuration(parseInt(e.target.value) || 48)
                  }
                  min={1}
                  max={168}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCreateCohort(false)}
                className="flex-1 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createCohort}
                disabled={!newCohortStage}
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-30"
              >
                Create Cohort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WM Terms Agreement Modal */}
      {isWM &&
        activeCohort &&
        activeCohort.created_by === user.id &&
        !wmAgreed[activeCohort.id] &&
        members.length > 1 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Data Privacy Agreement</h3>
                  <p className="text-xs text-muted-foreground">Required to view member profiles</p>
                </div>
              </div>
              <div className="bg-accent/50 rounded-lg p-3 text-sm text-muted-foreground mb-4 space-y-2">
                <p>By agreeing, you acknowledge that:</p>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>You will only use member financial data to provide guidance within this cohort session</li>
                  <li>You will not contact members outside this platform using information learned here</li>
                  <li>You will not share or sell any member data obtained through cohort sessions</li>
                  <li>All interactions are logged for compliance and member protection</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveCohort(null)}
                  className="flex-1 py-2 rounded-md border border-border text-sm hover:bg-accent transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={() => agreeToTerms(activeCohort.id)}
                  className="flex-1 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle size={14} />
                  I Agree
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
