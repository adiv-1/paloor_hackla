import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { API_URL } from "../lib/api";
import { colors } from "../lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setBusy(true);
    const error = await login(email.trim(), password);
    setBusy(false);
    if (error) setErr(error);
    else router.replace("/(tabs)/chat");
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.flex}
      >
        <View style={s.container}>
          <Text style={s.brand}>Paloor</Text>
          <Text style={s.subtitle}>Sign in to your account</Text>

          <TextInput
            style={s.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {err ? <Text style={s.err}>{err}</Text> : null}

          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={onSubmit}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign in</Text>}
          </Pressable>

          <Link href="/register" style={s.link}>
            <Text style={s.linkText}>Don&apos;t have an account? Create one</Text>
          </Link>

          <Text style={s.api}>API: {API_URL}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  brand: { fontSize: 36, fontWeight: "800", color: colors.text, marginBottom: 4 },
  subtitle: { color: colors.muted, marginBottom: 32 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  err: { color: colors.danger, marginBottom: 8 },
  link: { marginTop: 18, alignSelf: "center" },
  linkText: { color: colors.primary },
  api: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 24 },
});
