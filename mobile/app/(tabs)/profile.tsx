import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme, type ThemeColors } from "../../lib/theme";

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  photo_url?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  annual_income?: string;
  net_worth_estimate?: string;
  financial_goals?: string;
  risk_tolerance?: string;
  state?: string;
  email_verified?: boolean;
  profile_completed?: boolean;
  abstraction_level?: string;
}

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const { colors, isDark, toggle } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await api<UserProfile>("/api/auth/me", { token });
        setProfile(data);
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  const displayProfile = profile ?? user;
  const photoUri =
    profile?.photo_url && token ? `${API_URL}${profile.photo_url}` : null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={s.eyebrow}>PROFILE</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={s.avatarSection}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={s.avatar} />
              ) : (
                <View style={s.avatarPlaceholder}>
                  <Ionicons name="person" size={28} color={colors.primary} />
                </View>
              )}
              <View style={s.nameSection}>
                <Text style={s.name}>
                  {displayProfile?.name ?? "Paloor User"}
                </Text>
                <Text style={s.email}>{displayProfile?.email}</Text>
                {profile?.email_verified && (
                  <View style={s.verifiedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color={colors.success}
                    />
                    <Text style={s.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={s.infoSection}>
              <View style={s.sectionHeader}>
                <Ionicons name="color-palette-outline" size={18} color={colors.text} />
                <Text style={s.sectionTitle}>Appearance</Text>
              </View>
              <Pressable style={s.themeRow} onPress={toggle}>
                <View style={s.themeLeft}>
                  <Ionicons
                    name={isDark ? "moon" : "sunny"}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={s.themeLabel}>
                    {isDark ? "Dark mode" : "Light mode"}
                  </Text>
                </View>
                <View style={[s.themeToggle, isDark && s.themeToggleActive]}>
                  <View
                    style={[
                      s.themeToggleKnob,
                      isDark && s.themeToggleKnobActive,
                    ]}
                  />
                </View>
              </Pressable>
            </View>

            {profile && (
              <View style={s.infoSection}>
                <View style={s.sectionHeader}>
                  <Ionicons name="person-outline" size={18} color={colors.text} />
                  <Text style={s.sectionTitle}>About</Text>
                </View>
                <InfoRow
                  label="Location"
                  value={profile.state}
                  icon="location-outline"
                  colors={colors}
                />
                <InfoRow
                  label="Occupation"
                  value={profile.occupation}
                  icon="briefcase-outline"
                  colors={colors}
                />
                <InfoRow
                  label="Age"
                  value={profile.age?.toString()}
                  icon="calendar-outline"
                  colors={colors}
                />
              </View>
            )}

            {profile && (
              <View style={s.infoSection}>
                <View style={s.sectionHeader}>
                  <Ionicons name="wallet-outline" size={18} color={colors.text} />
                  <Text style={s.sectionTitle}>Financial Profile</Text>
                </View>
                <InfoRow
                  label="Annual Income"
                  value={profile.annual_income}
                  icon="cash-outline"
                  colors={colors}
                />
                <InfoRow
                  label="Net Worth"
                  value={profile.net_worth_estimate}
                  icon="trending-up-outline"
                  colors={colors}
                />
                <InfoRow
                  label="Risk Tolerance"
                  value={profile.risk_tolerance}
                  icon="shield-outline"
                  colors={colors}
                />
                <InfoRow
                  label="Goals"
                  value={profile.financial_goals}
                  icon="flag-outline"
                  colors={colors}
                />
              </View>
            )}

            <View style={s.infoSection}>
              <View style={s.sectionHeader}>
                <Ionicons name="information-circle-outline" size={18} color={colors.text} />
                <Text style={s.sectionTitle}>App Info</Text>
              </View>
              <InfoRow label="Backend" value={API_URL} icon="server-outline" colors={colors} />
              <InfoRow label="Version" value="1.0.0" icon="code-outline" colors={colors} />
            </View>

            <Pressable style={s.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={s.logoutText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  icon,
  colors: c,
}: {
  label: string;
  value?: string | null;
  icon: string;
  colors: ThemeColors;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomColor: c.border,
        borderBottomWidth: 0.5,
        gap: 10,
      }}
    >
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={16}
        color={c.muted}
      />
      <Text style={{ color: c.muted, fontSize: 14, flex: 1 }}>{label}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 14, fontWeight: "500" }}>
        {value || "\u2014"}
      </Text>
    </View>
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
      marginBottom: 20,
    },
    avatarSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      marginBottom: 28,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.card,
    },
    avatarPlaceholder: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.primaryDark + "30",
      alignItems: "center",
      justifyContent: "center",
    },
    nameSection: { flex: 1 },
    name: { color: c.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
    email: { color: c.muted, fontSize: 14, marginTop: 2 },
    verifiedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.success + "15",
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginTop: 6,
    },
    verifiedText: { color: c.success, fontSize: 11, fontWeight: "700" },
    infoSection: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: "700" },
    themeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
    },
    themeLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    themeLabel: { color: c.text, fontSize: 15 },
    themeToggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.border,
      padding: 3,
      justifyContent: "center",
    },
    themeToggleActive: { backgroundColor: c.primary },
    themeToggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.card,
    },
    themeToggleKnobActive: { alignSelf: "flex-end" },
    logoutBtn: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.danger + "12",
      borderColor: c.danger + "30",
      borderWidth: 1,
      paddingVertical: 16,
      borderRadius: 14,
    },
    logoutText: { color: c.danger, fontWeight: "700", fontSize: 16 },
  });
}
