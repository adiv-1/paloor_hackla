import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.h1}>{user?.name ?? "Profile"}</Text>
        <Text style={s.muted}>{user?.email}</Text>

        <View style={s.card}>
          <Text style={s.label}>Backend</Text>
          <Text style={s.value}>{API_URL}</Text>
        </View>

        <Pressable style={s.btn} onPress={logout}>
          <Text style={s.btnText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 12 },
  h1: { fontSize: 28, fontWeight: "800", color: colors.text },
  muted: { color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  label: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 15, marginTop: 4 },
  btn: {
    marginTop: 24,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
