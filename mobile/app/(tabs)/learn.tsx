import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { MODULES, type LessonModule } from "../../lib/modules";
import { useTheme, type ThemeColors } from "../../lib/theme";

interface ProgressItem {
  module_id: string;
  current_step: number;
  completed_at?: string | null;
  credits_earned?: number;
}

const LEVEL_ICONS: Record<string, string> = {
  Foundations: "layers-outline",
  Beginner: "leaf-outline",
  Intermediate: "flash-outline",
};

export default function LearnScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [progress, setProgress] = useState<Record<string, ProgressItem>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await api<{ items: ProgressItem[] }>(
          "/api/learn/progress",
          { token },
        );
        if (data?.items) {
          const map: Record<string, ProgressItem> = {};
          for (const p of data.items) map[p.module_id] = p;
          setProgress(map);
        }
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  const isLocked = (mod: LessonModule) => {
    if (!mod.requires) return false;
    const req = progress[mod.requires];
    return !req?.completed_at;
  };

  const renderModule = ({ item: mod }: { item: LessonModule }) => {
    const locked = isLocked(mod);
    const prog = progress[mod.id];
    const completed = !!prog?.completed_at;
    const step = prog?.current_step ?? 0;
    const total = mod.blocks.length;
    const pct = completed ? 100 : total > 0 ? (step / total) * 100 : 0;
    const levelColor =
      mod.level === "Foundations"
        ? colors.primary
        : mod.level === "Beginner"
          ? colors.warning
          : "#c084fc";

    return (
      <Pressable
        style={[s.card, locked && s.cardLocked]}
        disabled={locked}
        onPress={() => router.push(`/lesson?id=${mod.id}`)}
      >
        <View style={s.cardHeader}>
          <View style={[s.levelBadge, { backgroundColor: levelColor + "20" }]}>
            <Ionicons
              name={(LEVEL_ICONS[mod.level] ?? "star-outline") as keyof typeof Ionicons.glyphMap}
              size={12}
              color={levelColor}
            />
            <Text style={[s.levelText, { color: levelColor }]}>
              {mod.level}
            </Text>
          </View>
          <View style={s.durationBadge}>
            <Ionicons name="time-outline" size={12} color={colors.muted} />
            <Text style={s.durationText}>{mod.estimatedMinutes} min</Text>
          </View>
        </View>

        <Text style={s.cardTitle}>
          {locked && (
            <Ionicons name="lock-closed" size={18} color={colors.muted} />
          )}
          {locked && " "}
          {completed && (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          )}
          {completed && " "}
          {mod.title}
        </Text>
        <Text style={s.cardSubtitle}>{mod.subtitle}</Text>

        {!locked && (
          <View style={s.progressContainer}>
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressBar,
                  {
                    width: `${pct}%`,
                    backgroundColor: completed ? colors.success : colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={s.progressLabel}>
              {completed ? "Done" : step > 0 ? `${step}/${total}` : "Start"}
            </Text>
          </View>
        )}

        {locked && (
          <Text style={s.lockedText}>
            Complete &ldquo;
            {MODULES.find((m) => m.id === mod.requires)?.title}&rdquo; first
          </Text>
        )}

        {mod.unlocks.length > 0 && !locked && (
          <View style={s.unlockRow}>
            <Ionicons name="gift-outline" size={14} color={colors.textSecondary} />
            <Text style={s.unlockText}>{mod.unlocks[0]}</Text>
          </View>
        )}

        {!locked && (
          <View style={s.startRow}>
            <Ionicons
              name={completed ? "refresh-outline" : "play-circle-outline"}
              size={18}
              color={colors.primary}
            />
            <Text style={s.startText}>
              {completed ? "Review" : step > 0 ? "Continue" : "Start lesson"}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={MODULES}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={s.headerSection}>
            <Text style={s.eyebrow}>LEARN</Text>
            <Text style={s.h1}>Financial Literacy</Text>
            <Text style={s.subtitle}>
              Master money concepts through interactive lessons
            </Text>
            {loading && (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginTop: 12 }}
              />
            )}
          </View>
        }
        renderItem={renderModule}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    headerSection: { marginBottom: 20 },
    eyebrow: {
      color: c.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 2,
      marginBottom: 6,
    },
    h1: { fontSize: 30, fontWeight: "800", color: c.text, letterSpacing: -0.5 },
    subtitle: { color: c.muted, fontSize: 15, marginTop: 6, lineHeight: 22 },
    card: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
    },
    cardLocked: { opacity: 0.5 },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    levelBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    levelText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
    durationBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
    durationText: { color: c.muted, fontSize: 12 },
    cardTitle: { color: c.text, fontSize: 20, fontWeight: "700", marginBottom: 4 },
    cardSubtitle: { color: c.muted, fontSize: 14, lineHeight: 20 },
    progressContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 14,
      gap: 10,
    },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.border },
    progressBar: { height: 6, borderRadius: 3 },
    progressLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
    lockedText: { color: c.muted, fontSize: 13, fontStyle: "italic", marginTop: 10 },
    unlockRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 6 },
    unlockText: { color: c.textSecondary, fontSize: 12 },
    startRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 14,
      paddingTop: 12,
      borderTopColor: c.border,
      borderTopWidth: 1,
    },
    startText: { color: c.primary, fontSize: 14, fontWeight: "600" },
  });
}
