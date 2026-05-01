import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";

interface Quote {
  symbol?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  name?: string;
  [k: string]: unknown;
}

export default function ResearchScreen() {
  const { token } = useAuth();
  const [symbol, setSymbol] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    setError(null);
    setQuote(null);
    // Try a few likely equity endpoints.
    const candidates = [
      `/api/equities/quote/${sym}`,
      `/api/equities/${sym}/quote`,
      `/api/equities/${sym}`,
    ];
    for (const path of candidates) {
      try {
        const data = await api<Quote>(path, { token });
        setQuote(data);
        setBusy(false);
        return;
      } catch {
        /* try next */
      }
    }
    setBusy(false);
    setError(`No quote endpoint responded for ${sym}. Check backend /docs.`);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.h1}>Research</Text>
        <Text style={s.subtitle}>Look up a stock by ticker.</Text>

        <View style={s.row}>
          <TextInput
            style={s.input}
            value={symbol}
            onChangeText={setSymbol}
            placeholder="e.g. AAPL"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={lookup}
          />
          <Pressable style={s.btn} onPress={lookup} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Search</Text>}
          </Pressable>
        </View>

        {error ? <Text style={s.err}>{error}</Text> : null}

        {quote ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>{quote.symbol ?? symbol.toUpperCase()}</Text>
            {quote.name ? <Text style={s.muted}>{quote.name}</Text> : null}
            {quote.price !== undefined ? (
              <Text style={s.price}>${Number(quote.price).toFixed(2)}</Text>
            ) : null}
            <Text style={s.codeLabel}>Raw response:</Text>
            <Text style={s.code}>{JSON.stringify(quote, null, 2)}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, marginBottom: 16 },
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderRadius: 10,
  },
  btnText: { color: colors.primaryText, fontWeight: "700" },
  err: { color: colors.danger, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  muted: { color: colors.muted },
  price: { color: colors.success, fontSize: 28, fontWeight: "800", marginTop: 8 },
  codeLabel: { color: colors.muted, marginTop: 12, fontSize: 11 },
  code: { color: colors.text, fontFamily: "Courier", fontSize: 11, marginTop: 4 },
});
