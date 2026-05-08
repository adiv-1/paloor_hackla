import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme, type ThemeColors } from "../../lib/theme";

interface Conversation {
  id: string;
  name: string;
  type: string;
  created_at?: string;
  last_message?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

function parseSSEEvents(
  text: string,
): Array<{ type: string; [k: string]: unknown }> {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {}
    }
  }
  return events;
}

export default function ChatScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    if (!token) return;
    loadConversations();
  }, [token]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const list = await api<Conversation[]>(
        "/api/chat/conversations?type=ai",
        { token },
      );
      if (Array.isArray(list)) setConversations(list);
    } catch {}
    setLoading(false);
  };

  const openConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    setMessages([]);
    setError(null);
    try {
      const history = await api<ChatMessage[]>(
        `/api/chat/conversations/${conv.id}/messages`,
        { token },
      );
      if (Array.isArray(history)) {
        setMessages(
          history.map((m) => ({
            id: String((m as { id: string | number }).id),
            role:
              (m as { role?: string }).role === "user"
                ? ("user" as const)
                : ("assistant" as const),
            content: (m as { content?: string }).content ?? "",
          })),
        );
      }
    } catch {}
  };

  const createNewChat = async () => {
    try {
      const conv = await api<Conversation>("/api/chat/conversations/ai", {
        token,
        method: "POST",
        json: { name: `Chat ${new Date().toLocaleDateString()}` },
      });
      setConversations((prev) => [conv, ...prev]);
      openConversation(conv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create chat");
    }
  };

  const deleteConversation = async (convId: string) => {
    try {
      await api(`/api/chat/conversations/${convId}`, {
        token,
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConv?.id === convId) {
        setActiveConv(null);
        setMessages([]);
      }
    } catch {}
  };

  const goBack = () => {
    setActiveConv(null);
    setMessages([]);
    setError(null);
    loadConversations();
  };

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !activeConv || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const aiId = `ai-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: aiId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setSending(true);
    setError(null);

    const url = `${API_URL}/api/chat/conversations/${activeConv.id}/stream`;
    const xhr = new XMLHttpRequest();
    abortRef.current = xhr;
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "text/event-stream");

    let lastIdx = 0;
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(lastIdx);
      lastIdx = xhr.responseText.length;
      const events = parseSSEEvents(chunk);
      for (const ev of events) {
        if (ev.type === "ai_chunk" && typeof ev.text === "string") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, content: m.content + ev.text } : m,
            ),
          );
        } else if (ev.type === "ai_done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, streaming: false } : m,
            ),
          );
          setSending(false);
        } else if (ev.type === "error") {
          setError((ev.message as string) ?? "AI error");
          setSending(false);
        }
      }
    };

    xhr.onloadend = () => {
      abortRef.current = null;
      if (xhr.status !== 200 && xhr.status !== 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? {
                  ...m,
                  content: m.content || "Sorry, something went wrong.",
                  streaming: false,
                }
              : m,
          ),
        );
        setSending(false);
      }
    };

    xhr.onerror = () => {
      setError("Network error");
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)),
      );
      setSending(false);
      abortRef.current = null;
    };

    xhr.send(JSON.stringify({ content: text }));
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Conversation list view ──
  if (!activeConv) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Chats</Text>
          <Pressable style={s.newChatBtn} onPress={createNewChat}>
            <Ionicons name="add" size={20} color={colors.primaryText} />
            <Text style={s.newChatText}>New</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={s.center}>
            <Ionicons
              name="chatbubbles-outline"
              size={56}
              color={colors.border}
            />
            <Text style={s.emptyTitle}>No conversations yet</Text>
            <Text style={s.emptySubtitle}>
              Tap + to start your first AI conversation
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <Pressable
                style={s.convCard}
                onPress={() => openConversation(item)}
              >
                <View style={s.convIcon}>
                  <Ionicons
                    name={
                      item.type === "group"
                        ? "people-outline"
                        : "chatbubble-outline"
                    }
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={s.convInfo}>
                  <Text style={s.convName} numberOfLines={1}>
                    {item.name || "AI Chat"}
                  </Text>
                  <Text style={s.convMeta} numberOfLines={1}>
                    {item.type === "group" ? "Group" : "AI Coach"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => deleteConversation(item.id)}
                  hitSlop={12}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.muted} />
                </Pressable>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Active chat view ──
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <View style={s.chatHeader}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={s.chatHeaderInfo}>
          <Text style={s.chatHeaderTitle} numberOfLines={1}>
            {activeConv.name || "AI Chat"}
          </Text>
          <Text style={s.chatHeaderSub}>AI Financial Coach</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {error ? (
          <Pressable onPress={() => setError(null)} style={s.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </Pressable>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View
              style={[
                s.bubble,
                item.role === "user" ? s.bubbleUser : s.bubbleAi,
              ]}
            >
              {item.role === "assistant" && (
                <View style={s.aiLabel}>
                  <Ionicons name="sparkles" size={12} color={colors.primary} />
                  <Text style={s.aiLabelText}>Paloor AI</Text>
                </View>
              )}
              <Text
                style={[
                  s.bubbleText,
                  item.role === "user" && { color: colors.primaryText },
                ]}
              >
                {item.content || (item.streaming ? "Thinking\u2026" : "")}
              </Text>
              {item.streaming && item.content ? (
                <View style={s.typingDot} />
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Ionicons
                name="sparkles-outline"
                size={48}
                color={colors.border}
              />
              <Text style={s.emptyTitle}>Ask me anything</Text>
              <Text style={s.emptySubtitle}>
                About money, stocks, investing, or your portfolio.
              </Text>
            </View>
          }
        />

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Paloor\u2026"
            placeholderTextColor={colors.muted}
            multiline
            editable={!sending}
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <Pressable
            style={[
              s.sendBtn,
              (sending || !input.trim()) && { opacity: 0.4 },
            ]}
            disabled={sending || !input.trim()}
            onPress={send}
          >
            {sending ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.primaryText} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 14,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 28, fontWeight: "800", color: c.text, letterSpacing: -0.5 },
    newChatBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    newChatText: { color: c.primaryText, fontWeight: "700", fontSize: 14 },

    convCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      gap: 12,
    },
    convIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    convInfo: { flex: 1 },
    convName: { color: c.text, fontSize: 16, fontWeight: "600" },
    convMeta: { color: c.muted, fontSize: 12, marginTop: 2 },

    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
      gap: 12,
    },
    chatHeaderInfo: { flex: 1 },
    chatHeaderTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    chatHeaderSub: { color: c.primary, fontSize: 12, fontWeight: "600", marginTop: 1 },

    list: { padding: 16, paddingBottom: 8, gap: 4 },
    bubble: {
      maxWidth: "85%",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 18,
      marginVertical: 3,
    },
    bubbleUser: {
      backgroundColor: c.primary,
      alignSelf: "flex-end",
      borderBottomRightRadius: 4,
    },
    bubbleAi: {
      backgroundColor: c.card,
      alignSelf: "flex-start",
      borderColor: c.border,
      borderWidth: 1,
      borderBottomLeftRadius: 4,
    },
    aiLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: 4,
    },
    aiLabelText: {
      color: c.primary,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bubbleText: { color: c.text, fontSize: 15, lineHeight: 22 },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.primary,
      marginTop: 6,
      opacity: 0.7,
    },
    emptyChat: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 12 },
    emptyTitle: { color: c.text, fontSize: 22, fontWeight: "700" },
    emptySubtitle: { color: c.muted, fontSize: 15, textAlign: "center", lineHeight: 22 },

    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      padding: 12,
      paddingBottom: 8,
      borderTopColor: c.border,
      borderTopWidth: 1,
      backgroundColor: c.bg,
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 20,
      color: c.text,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      maxHeight: 120,
    },
    sendBtn: {
      backgroundColor: c.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.danger + "15",
      borderBottomColor: c.danger + "40",
      borderBottomWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    errorText: { color: c.danger, fontSize: 13, fontWeight: "600", flex: 1 },
  });
}
