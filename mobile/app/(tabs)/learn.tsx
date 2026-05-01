import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";

interface Lesson {
  id: string | number;
  title?: string;
  name?: string;
  description?: string;
  summary?: string;
}

export default function LearnScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      // Try a few likely endpoints — the learn router structure varies.
      const candidates = ["/api/learn/lessons", "/api/learn/modules", "/api/learn"];
      for (const path of candidates) {
        try {
          const data = await api<unknown>(path, { token });
          if (Array.isArray(data)) {
            setItems(data as Lesson[]);
            return;
          }
          if (data && typeof data === "object") {
            const maybe = (data as { lessons?: unknown; modules?: unknown }).lessons
              ?? (data as { modules?: unknown }).modules;
            if (Array.isArray(maybe)) {
              setItems(maybe as Lesson[]);
              return;
            }
          }
        } catch {
          /* try next */
        }
      }
      setError("No lessons endpoint responded. Open backend at /docs to find the right route.");
    })();
  }, [token]);

  if (!items && !error) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={items ?? []}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={s.h1}>Learn</Text>
        }
        ListEmptyComponent={
          <Text style={s.muted}>{error ?? "No lessons yet."}</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={s.card}>
            <Text style={s.cardTitle}>{item.title ?? item.name ?? `Lesson ${item.id}`}</Text>
            {item.description || item.summary ? (
              <Text style={s.cardBody}>{item.description ?? item.summary}</Text>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  h1: { fontSize: 28, fontWeight: "800", color: colors.text, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardBody: { color: colors.muted, marginTop: 6 },
  muted: { color: colors.muted },
});
