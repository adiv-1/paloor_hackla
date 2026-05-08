import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { MODULES, type LessonBlock } from "../lib/modules";
import { useTheme, type ThemeColors } from "../lib/theme";

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const mod = useMemo(() => MODULES.find((m) => m.id === id), [id]);
  const [currentStep, setCurrentStep] = useState(0);
  const [checkpointAnswer, setCheckpointAnswer] = useState("");
  const [checkpointFeedback, setCheckpointFeedback] = useState<string | null>(
    null,
  );
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!token || !mod) return;
    (async () => {
      try {
        const data = await api<{ current_step?: number }>(
          `/api/learn/progress/${mod.id}`,
          { token },
        );
        if (data?.current_step) setCurrentStep(data.current_step);
      } catch {}
    })();
  }, [token, mod]);

  if (!mod) {
    return (
      <SafeAreaView style={s.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={s.errorText}>Module not found</Text>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const block = mod.blocks[currentStep];
  const isLast = currentStep >= mod.blocks.length - 1;
  const progress = ((currentStep + 1) / mod.blocks.length) * 100;

  const goNext = async () => {
    if (isLast) {
      setCompleting(true);
      try {
        await api("/api/learn/complete", {
          token,
          method: "POST",
          json: { module_id: mod.id },
        });
      } catch {}
      setCompleting(false);
      router.back();
      return;
    }

    const next = currentStep + 1;
    setCurrentStep(next);
    setCheckpointAnswer("");
    setCheckpointFeedback(null);

    try {
      await api("/api/learn/progress", {
        token,
        method: "POST",
        json: { module_id: mod.id, step_index: next },
      });
    } catch {}
  };

  const submitCheckpoint = async () => {
    if (!checkpointAnswer.trim() || !block) return;
    setCheckpointLoading(true);
    try {
      const data = await api<{ pass?: boolean; feedback?: string }>(
        "/api/learn/checkpoint",
        {
          token,
          method: "POST",
          json: {
            module_id: mod.id,
            step_key: block.id,
            concept: block.concept,
            question: block.question,
            key_ideas: block.keyIdeas,
            answer: checkpointAnswer,
          },
        },
      );
      setCheckpointFeedback(
        data?.feedback ??
          (data?.pass ? "Great answer!" : "Try expanding on your answer."),
      );
    } catch {
      setCheckpointFeedback(
        "Couldn\u2019t check your answer right now. Keep going!",
      );
    }
    setCheckpointLoading(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.progressHeader}>
          <View style={s.progressRow}>
            <Text style={s.progressText}>
              {currentStep + 1} / {mod.blocks.length}
            </Text>
            <Text style={s.moduleTitle}>{mod.title}</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressBar, { width: `${progress}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={s.content} key={currentStep}>
          {block && (
            <BlockRenderer block={block} colors={colors} s={s} />
          )}

          {block?.kind === "checkpoint" && (
            <View style={s.checkpointSection}>
              <TextInput
                style={s.checkpointInput}
                value={checkpointAnswer}
                onChangeText={setCheckpointAnswer}
                placeholder={block.placeholder ?? "Type your answer\u2026"}
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
              />
              {checkpointFeedback ? (
                <View style={s.feedbackCard}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={colors.success}
                  />
                  <Text style={s.feedbackText}>{checkpointFeedback}</Text>
                </View>
              ) : (
                <Pressable
                  style={[
                    s.checkBtn,
                    (!checkpointAnswer.trim() || checkpointLoading) && {
                      opacity: 0.5,
                    },
                  ]}
                  disabled={!checkpointAnswer.trim() || checkpointLoading}
                  onPress={submitCheckpoint}
                >
                  {checkpointLoading ? (
                    <ActivityIndicator
                      color={colors.primaryText}
                      size="small"
                    />
                  ) : (
                    <Text style={s.checkBtnText}>Check my answer</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}

          {block?.kind === "interactive" && block.tutor && (
            <View style={s.tutorCard}>
              <View style={s.tutorHeader}>
                <Ionicons name="school-outline" size={16} color={colors.warning} />
                <Text style={s.tutorLabel}>Tutor Explanation</Text>
              </View>
              <Text style={s.tutorText}>{block.tutor}</Text>
            </View>
          )}
        </ScrollView>

        <View style={s.navBar}>
          <Pressable
            style={[
              s.navBtn,
              s.navBtnSecondary,
              currentStep === 0 && { opacity: 0.3 },
            ]}
            disabled={currentStep === 0}
            onPress={() => {
              setCurrentStep((p) => p - 1);
              setCheckpointAnswer("");
              setCheckpointFeedback(null);
            }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={s.navBtnSecondaryText}>Back</Text>
          </Pressable>

          <Pressable
            style={[s.navBtn, s.navBtnPrimary]}
            onPress={goNext}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <>
                <Text style={s.navBtnPrimaryText}>
                  {isLast ? "Complete" : "Next"}
                </Text>
                <Ionicons
                  name={isLast ? "checkmark" : "chevron-forward"}
                  size={18}
                  color={colors.primaryText}
                />
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BlockRenderer({
  block,
  colors: c,
  s,
}: {
  block: LessonBlock;
  colors: ThemeColors;
  s: ReturnType<typeof makeStyles>;
}) {
  const kindConfig: Record<
    string,
    { icon: keyof typeof Ionicons.glyphMap; accent: string }
  > = {
    concept: { icon: "book-outline", accent: c.primary },
    interactive: { icon: "game-controller-outline", accent: c.warning },
    insight: { icon: "bulb-outline", accent: "#c084fc" },
    checkpoint: { icon: "create-outline", accent: c.danger },
    sim: { icon: "bar-chart-outline", accent: "#60a5fa" },
    reward: { icon: "trophy-outline", accent: c.success },
  };

  const cfg = kindConfig[block.kind] ?? {
    icon: "ellipse-outline" as const,
    accent: c.muted,
  };

  if (block.kind === "reward") {
    return (
      <View style={[s.blockCard, { borderColor: c.success + "40" }]}>
        <Ionicons
          name="trophy"
          size={48}
          color={c.success}
          style={{ textAlign: "center", marginBottom: 12 }}
        />
        <Text style={s.rewardTitle}>Lesson Complete!</Text>
        {block.unlocks?.map((u, i) => (
          <View key={i} style={s.rewardItem}>
            <Ionicons name="checkmark" size={16} color={c.success} />
            <Text style={s.rewardItemText}>{u}</Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        s.blockCard,
        { borderLeftColor: cfg.accent, borderLeftWidth: 3 },
      ]}
    >
      <View style={s.blockHeader}>
        <Ionicons name={cfg.icon} size={18} color={cfg.accent} />
        <Text style={[s.blockKind, { color: cfg.accent }]}>
          {block.kind.toUpperCase()}
        </Text>
      </View>

      {block.title && <Text style={s.blockTitle}>{block.title}</Text>}
      {block.body && <Text style={s.blockBody}>{block.body}</Text>}
      {block.prompt && <Text style={s.blockPrompt}>{block.prompt}</Text>}

      {block.question && (
        <View style={s.questionBox}>
          <Text style={s.questionLabel}>QUESTION</Text>
          <Text style={s.questionText}>{block.question}</Text>
        </View>
      )}

      {block.terms && block.terms.length > 0 && (
        <View style={s.termsRow}>
          {block.terms.map((t) => (
            <View key={t} style={s.termBadge}>
              <Text style={s.termText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg,
      gap: 12,
    },
    errorText: { color: c.danger, fontSize: 16 },
    backBtn: {
      backgroundColor: c.card,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
    },
    backBtnText: { color: c.text, fontWeight: "600" },
    progressHeader: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
    },
    progressRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    progressText: { color: c.muted, fontSize: 13, fontWeight: "600" },
    moduleTitle: { color: c.text, fontSize: 15, fontWeight: "700" },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: c.border },
    progressBar: { height: 4, borderRadius: 2, backgroundColor: c.primary },
    content: { padding: 20, paddingBottom: 20 },
    blockCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 18,
      marginBottom: 14,
    },
    blockHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    blockKind: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
    blockTitle: {
      color: c.text,
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 8,
      lineHeight: 26,
    },
    blockBody: { color: c.textSecondary, fontSize: 15, lineHeight: 24 },
    blockPrompt: {
      color: c.muted,
      fontSize: 14,
      fontStyle: "italic",
      lineHeight: 22,
      marginTop: 8,
    },
    questionBox: {
      backgroundColor: c.bg,
      borderRadius: 10,
      padding: 14,
      marginTop: 8,
    },
    questionLabel: {
      color: c.danger,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
      marginBottom: 6,
    },
    questionText: { color: c.text, fontSize: 15, lineHeight: 22 },
    termsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
    termBadge: {
      backgroundColor: c.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    termText: { color: c.primary, fontSize: 12, fontWeight: "600" },
    checkpointSection: { marginTop: 4 },
    checkpointInput: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      color: c.text,
      fontSize: 15,
      minHeight: 100,
      lineHeight: 22,
    },
    checkBtn: {
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 12,
    },
    checkBtnText: { color: c.primaryText, fontWeight: "700", fontSize: 15 },
    feedbackCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: c.success + "12",
      borderColor: c.success + "30",
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginTop: 12,
    },
    feedbackText: { color: c.text, fontSize: 14, lineHeight: 22, flex: 1 },
    tutorCard: {
      backgroundColor: c.warning + "10",
      borderColor: c.warning + "25",
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 14,
    },
    tutorHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    tutorLabel: { color: c.warning, fontSize: 12, fontWeight: "700" },
    tutorText: { color: c.textSecondary, fontSize: 14, lineHeight: 22 },
    rewardTitle: {
      color: c.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 16,
    },
    rewardItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.success + "12",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      marginBottom: 8,
    },
    rewardItemText: { color: c.success, fontSize: 14, fontWeight: "600" },
    navBar: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderTopColor: c.border,
      borderTopWidth: 1,
      backgroundColor: c.bg,
    },
    navBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 14,
      borderRadius: 12,
    },
    navBtnPrimary: { backgroundColor: c.primary },
    navBtnPrimaryText: { color: c.primaryText, fontWeight: "700", fontSize: 16 },
    navBtnSecondary: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
    },
    navBtnSecondaryText: { color: c.text, fontWeight: "600", fontSize: 16 },
  });
}
