import { useRouter } from "expo-router";
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
import { colors } from "../lib/theme";

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setBusy(true);
    const error = await register(email.trim(), password, name.trim());
    setBusy(false);
    if (error) setErr(error);
    else router.replace("/(tabs)/chat");
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
        <View style={s.container}>
          <Text style={s.title}>Create your account</Text>

          <TextInput
            style={s.input}
            placeholder="Full name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
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
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create account</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 24 },
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
});
