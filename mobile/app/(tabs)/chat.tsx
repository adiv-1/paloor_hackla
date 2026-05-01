import { useEffect, useRef, useState } from "react";
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
import { api, wsUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";

interface Conversation {
  id: string;
  name: string;
  type: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export default function ChatScreen() {
  const { token } = useAuth();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingIdRef = useRef<string | null>(null);

  // 1) Load or create the user's AI chat conversation.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await api<Conversation[]>("/api/chat/conversations?type=ai", { token });
        let c = Array.isArray(list) ? list.find((x) => x.type === "ai") ?? list[0] : null;
        if (!c) {
          c = await api<Conversation>("/api/chat/conversations/ai", {
            token,
            method: "POST",
            json: { name: "My AI Coach" },
          });
        }
        if (cancelled) return;
        setConv(c);
        // Load history
        try {
          const history = await api<ChatMessage[]>(
            `/api/chat/conversations/${c.id}/messages`,
            { token },
          );
          if (!cancelled && Array.isArray(history)) {
            setMessages(
              history.map((m) => ({
                id: String(m.id),
                role: (m as { role?: string }).role === "user" ? "user" : "assistant",
                content: (m as { content?: string }).content ?? "",
              })),
            );
          }
        } catch {
          /* ignore history errors */
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load chat");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2) Open WebSocket once we have a token.
  useEffect(() => {
    if (!token) return;
    const url = wsUrl(`/ws/chat?token=${encodeURIComponent(token)}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        switch (data.type) {
          case "ai_stream_start": {
            const id = `ai-${Date.now()}`;
            streamingIdRef.current = id;
            setMessages((prev) => [
              ...prev,
              { id, role: "assistant", content: "", pending: true },
            ]);
            break;
          }
          case "ai_stream_chunk": {
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: m.content + (data.chunk ?? "") } : m)),
            );
            break;
          }
          case "ai_stream_end": {
            const id = streamingIdRef.current;
            streamingIdRef.current = null;
            setSending(false);
            if (id) {
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, pending: false } : m)),
              );
            }
            break;
          }
          case "error": {
            setSending(false);
            setError(data.message ?? "Stream error");
            break;
          }
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => setError("WebSocket error");
    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (messages.length) {
      // Defer to next tick so layout settles.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !conv || !wsRef.current || wsRef.current.readyState !== 1) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    wsRef.current.send(
      JSON.stringify({ type: "message", conversation_id: conv.id, content: text }),
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {error ? <Text style={s.err}>{error}</Text> : null}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === "user" ? s.bubbleUser : s.bubbleAi]}>
              <Text style={[s.bubbleText, item.role === "user" && { color: "#fff" }]}>
                {item.content || (item.pending ? "…" : "")}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={s.empty}>Ask me anything about money, stocks, or your portfolio.</Text>
          }
        />
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Paloor…"
            placeholderTextColor={colors.muted}
            multiline
            editable={!sending}
          />
          <Pressable
            style={[s.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}
            disabled={sending || !input.trim()}
            onPress={send}
          >
            <Text style={s.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  list: { padding: 12, gap: 8 },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginVertical: 4,
  },
  bubbleUser: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  bubbleAi: { backgroundColor: colors.card, alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.bg,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendText: { color: colors.primaryText, fontWeight: "700" },
  err: { color: colors.danger, padding: 8, textAlign: "center" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
});
