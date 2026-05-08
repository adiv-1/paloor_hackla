import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
import { useTheme, type ThemeColors } from "../lib/theme";

export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.flex}
      >
        <View style={s.container}>
          <Text style={s.brand}>Paloor</Text>
          <Text style={s.tagline}>START LEARNING MONEY WITH CONFIDENCE</Text>
          <Text style={s.subtitle}>Create your account</Text>

          <View style={s.inputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.muted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={s.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.muted} style={s.inputIcon} />
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
          </View>
          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {err ? <Text style={s.err}>{err}</Text> : null}

          <Pressable
            style={[s.btn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={s.btnText}>Create account</Text>
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
    container: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
    brand: { fontSize: 42, fontWeight: "800", color: c.text, letterSpacing: -1 },
    tagline: {
      color: c.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 2,
      marginTop: 4,
      marginBottom: 4,
    },
    subtitle: { color: c.muted, marginBottom: 32, fontSize: 16 },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      marginBottom: 12,
    },
    inputIcon: { paddingLeft: 14 },
    input: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 14,
      color: c.text,
      fontSize: 16,
    },
    btn: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 8,
    },
    btnText: { color: c.primaryText, fontWeight: "700", fontSize: 17 },
    err: { color: c.danger, marginBottom: 8, fontSize: 14 },
  });
}
