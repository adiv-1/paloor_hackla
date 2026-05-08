import Ionicons from "@expo/vector-icons/Ionicons";
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
import { useTheme, type ThemeColors } from "../../lib/theme";

interface GroupItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  member_count?: number;
  is_member?: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string;
}

export default function CohortsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [cats, grps] = await Promise.allSettled([
        api<Category[]>("/api/chat/groups/categories", { token }),
        api<GroupItem[]>("/api/chat/groups/browse", { token }),
      ]);
      if (cats.status === "fulfilled" && Array.isArray(cats.value))
        setCategories(cats.value);
      if (grps.status === "fulfilled" && Array.isArray(grps.value))
        setGroups(grps.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    }
    setLoading(false);
  };

  const filteredGroups = activeCategory
    ? groups.filter((g) => g.category === activeCategory)
    : groups;

  const joinGroup = async (groupId: string) => {
    setJoining(groupId);
    try {
      await api(`/api/chat/groups/${groupId}/join`, {
        token,
        method: "POST",
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, is_member: true } : g)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join");
    }
    setJoining(null);
  };

  const leaveGroup = async (groupId: string) => {
    try {
      await api(`/api/chat/groups/${groupId}/leave`, {
        token,
        method: "POST",
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, is_member: false } : g)),
      );
    } catch {}
  };

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filteredGroups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <Text style={s.eyebrow}>COMMUNITY</Text>
            <Text style={s.h1}>Groups</Text>
            <Text style={s.subtitle}>
              Join communities to learn and discuss with others
            </Text>

            {categories.length > 0 && (
              <FlatList
                horizontal
                data={[{ id: "__all", name: "All" }, ...categories]}
                keyExtractor={(c) => c.id}
                showsHorizontalScrollIndicator={false}
                style={s.categoryList}
                renderItem={({ item: cat }) => {
                  const isActive =
                    cat.id === "__all"
                      ? activeCategory === null
                      : activeCategory === cat.id;
                  return (
                    <Pressable
                      style={[s.categoryPill, isActive && s.categoryPillActive]}
                      onPress={() =>
                        setActiveCategory(
                          cat.id === "__all" ? null : cat.id,
                        )
                      }
                    >
                      <Text
                        style={[
                          s.categoryText,
                          isActive && s.categoryTextActive,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}

            {error ? (
              <View style={s.errorRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={colors.danger}
                />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {loading && (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginTop: 20 }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyState}>
              <Ionicons
                name="people-outline"
                size={56}
                color={colors.border}
              />
              <Text style={s.emptyTitle}>No groups available</Text>
              <Text style={s.emptySubtitle}>
                Check back later for new communities
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: group }) => (
          <View style={s.groupCard}>
            <View style={s.groupIcon}>
              <Ionicons name="people" size={22} color={colors.primary} />
            </View>
            <View style={s.groupInfo}>
              <Text style={s.groupName}>{group.name}</Text>
              {group.description && (
                <Text style={s.groupDesc} numberOfLines={2}>
                  {group.description}
                </Text>
              )}
              <View style={s.groupMeta}>
                {group.category && (
                  <View style={s.metaBadge}>
                    <Text style={s.metaText}>{group.category}</Text>
                  </View>
                )}
                {group.member_count != null && (
                  <View style={s.memberCount}>
                    <Ionicons
                      name="person-outline"
                      size={12}
                      color={colors.muted}
                    />
                    <Text style={s.memberText}>
                      {group.member_count}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {group.is_member ? (
              <Pressable
                style={s.leaveBtn}
                onPress={() => leaveGroup(group.id)}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={colors.success}
                />
                <Text style={s.joinedText}>Joined</Text>
              </Pressable>
            ) : (
              <Pressable
                style={s.joinBtn}
                onPress={() => joinGroup(group.id)}
                disabled={joining === group.id}
              >
                {joining === group.id ? (
                  <ActivityIndicator
                    color={colors.primaryText}
                    size="small"
                  />
                ) : (
                  <Text style={s.joinText}>Join</Text>
                )}
              </Pressable>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    eyebrow: {
      color: c.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 2,
      marginBottom: 6,
    },
    h1: { fontSize: 30, fontWeight: "800", color: c.text, letterSpacing: -0.5 },
    subtitle: {
      color: c.muted,
      fontSize: 15,
      marginTop: 6,
      lineHeight: 22,
      marginBottom: 16,
    },
    categoryList: { marginBottom: 16 },
    categoryPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      marginRight: 8,
    },
    categoryPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    categoryText: { color: c.muted, fontSize: 13, fontWeight: "600" },
    categoryTextActive: { color: c.primaryText },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    errorText: { color: c.danger, fontSize: 13 },
    emptyState: {
      alignItems: "center",
      paddingTop: 60,
      gap: 12,
    },
    emptyTitle: { color: c.text, fontSize: 20, fontWeight: "700" },
    emptySubtitle: { color: c.muted, fontSize: 14, textAlign: "center" },
    groupCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    groupIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    groupInfo: { flex: 1 },
    groupName: { color: c.text, fontSize: 16, fontWeight: "700" },
    groupDesc: { color: c.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
    groupMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    metaBadge: {
      backgroundColor: c.primary + "15",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    metaText: { color: c.primary, fontSize: 11, fontWeight: "600" },
    memberCount: { flexDirection: "row", alignItems: "center", gap: 3 },
    memberText: { color: c.muted, fontSize: 12 },
    joinBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
    },
    joinText: { color: c.primaryText, fontWeight: "700", fontSize: 14 },
    leaveBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    joinedText: { color: c.success, fontSize: 13, fontWeight: "600" },
  });
}
