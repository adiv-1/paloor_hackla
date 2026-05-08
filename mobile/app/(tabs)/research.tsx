import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
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
import { useTheme, type ThemeColors } from "../../lib/theme";

interface SearchResult {
  symbol: string;
  name: string;
  type?: string;
}

interface CompanyData {
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  description?: string;
  overview_meta?: Record<string, unknown>;
  [k: string]: unknown;
}

interface PricePoint {
  date: string;
  close: number;
}

interface PriceData {
  ticker: string;
  period: string;
  data: PricePoint[];
  count: number;
}

function formatMarketCap(n?: number): string {
  if (!n) return "N/A";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

export default function ResearchScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    setSearching(true);
    setError(null);
    setCompany(null);
    setPrices(null);
    setResults([]);
    try {
      const data = await api<{
        results?: SearchResult[];
        matches?: SearchResult[];
      }>(`/api/equities/v2/symbol-search?keywords=${encodeURIComponent(q)}`, {
        token,
      });
      const list = data?.results ?? data?.matches ?? [];
      if (Array.isArray(list) && list.length > 0) {
        setResults(list.slice(0, 8));
      } else {
        loadTicker(q);
      }
    } catch {
      loadTicker(q);
    }
    setSearching(false);
  };

  const loadTicker = async (ticker: string) => {
    setLoadingDetail(true);
    setError(null);
    setResults([]);
    try {
      const [comp, priceData] = await Promise.allSettled([
        api<CompanyData>(`/api/equities/v2/companies/${ticker}`, { token }),
        api<PriceData>(`/api/equities/v2/prices/${ticker}?period=1M`, {
          token,
        }),
      ]);
      if (comp.status === "fulfilled") setCompany(comp.value);
      if (priceData.status === "fulfilled") setPrices(priceData.value);
      if (comp.status === "rejected" && priceData.status === "rejected") {
        setError(`No data found for ${ticker}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    }
    setLoadingDetail(false);
  };

  const latestPrice = prices?.data?.[prices.data.length - 1];
  const prevPrice = prices?.data?.[prices.data.length - 2];
  const priceChange =
    latestPrice && prevPrice
      ? ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100
      : null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={s.eyebrow}>RESEARCH</Text>
        <Text style={s.h1}>Equity Discovery</Text>
        <Text style={s.subtitle}>Look up any stock by ticker or name</Text>

        <View style={s.searchRow}>
          <View style={s.searchInputWrap}>
            <Ionicons
              name="search-outline"
              size={18}
              color={colors.muted}
              style={{ marginLeft: 14 }}
            />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search ticker or company\u2026"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={search}
            />
          </View>
          <Pressable style={s.searchBtn} onPress={search} disabled={searching}>
            {searching ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <Ionicons name="arrow-forward" size={20} color={colors.primaryText} />
            )}
          </Pressable>
        </View>

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={s.err}>{error}</Text>
          </View>
        ) : null}

        {results.length > 0 && (
          <View style={s.resultsSection}>
            <Text style={s.sectionLabel}>SEARCH RESULTS</Text>
            {results.map((r) => (
              <Pressable
                key={r.symbol}
                style={s.resultCard}
                onPress={() => {
                  setQuery(r.symbol);
                  loadTicker(r.symbol);
                }}
              >
                <View style={s.resultLeft}>
                  <Ionicons
                    name="trending-up-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={s.resultSymbol}>{r.symbol}</Text>
                  {r.type ? <Text style={s.resultType}>{r.type}</Text> : null}
                </View>
                <Text style={s.resultName} numberOfLines={1}>
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {loadingDetail && (
          <View style={s.loadingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.loadingText}>Loading stock data\u2026</Text>
          </View>
        )}

        {company && (
          <View style={s.detailCard}>
            <View style={s.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.ticker}>{company.ticker}</Text>
                <Text style={s.companyName}>{company.name ?? "Unknown"}</Text>
              </View>
              {latestPrice && (
                <View style={s.priceBox}>
                  <Text style={s.priceValue}>
                    ${latestPrice.close.toFixed(2)}
                  </Text>
                  {priceChange !== null && (
                    <View style={s.changeRow}>
                      <Ionicons
                        name={priceChange >= 0 ? "caret-up" : "caret-down"}
                        size={14}
                        color={
                          priceChange >= 0 ? colors.success : colors.danger
                        }
                      />
                      <Text
                        style={{
                          color:
                            priceChange >= 0 ? colors.success : colors.danger,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {Math.abs(priceChange).toFixed(2)}%
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {(company.sector || company.industry) && (
              <View style={s.tagRow}>
                {company.sector && (
                  <View style={s.tag}>
                    <Text style={s.tagText}>{company.sector}</Text>
                  </View>
                )}
                {company.industry && (
                  <View style={s.tag}>
                    <Text style={s.tagText}>{company.industry}</Text>
                  </View>
                )}
              </View>
            )}

            {company.description && (
              <Text style={s.description} numberOfLines={4}>
                {company.description}
              </Text>
            )}

            <View style={s.statsGrid}>
              <StatItem
                label="Market Cap"
                value={formatMarketCap(company.market_cap)}
                colors={colors}
              />
              {company.overview_meta &&
                Object.entries(company.overview_meta)
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <StatItem
                      key={k}
                      label={k.replace(/_/g, " ")}
                      value={String(v ?? "N/A")}
                      colors={colors}
                    />
                  ))}
            </View>

            {prices && prices.data.length > 1 && (
              <View style={s.priceSection}>
                <Text style={s.sectionLabel}>
                  PRICE HISTORY ({prices.period})
                </Text>
                <View style={s.miniChart}>
                  <MiniChart data={prices.data} colors={colors} />
                </View>
              </View>
            )}
          </View>
        )}

        {!company && !loadingDetail && !results.length && !error && (
          <View style={s.emptyState}>
            <Ionicons
              name="analytics-outline"
              size={56}
              color={colors.border}
            />
            <Text style={s.emptyText}>
              Search for any stock ticker like AAPL, MSFT, or GOOGL
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({
  label,
  value,
  colors: c,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ width: "48%", paddingVertical: 10, paddingHorizontal: 4 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: 11,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: c.text,
          fontSize: 15,
          fontWeight: "600",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function MiniChart({
  data,
  colors: c,
}: {
  data: PricePoint[];
  colors: ThemeColors;
}) {
  if (data.length < 2) return null;
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const chartHeight = 60;
  const up = closes[closes.length - 1] >= closes[0];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        height: chartHeight,
        gap: 1,
      }}
    >
      {data.map((d, i) => {
        const h = Math.max(2, ((d.close - min) / range) * chartHeight);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              backgroundColor: up ? c.success + "60" : c.danger + "60",
              borderRadius: 1,
            }}
          />
        );
      })}
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
      marginBottom: 6,
    },
    h1: { fontSize: 30, fontWeight: "800", color: c.text, letterSpacing: -0.5 },
    subtitle: {
      color: c.muted,
      fontSize: 15,
      marginTop: 6,
      marginBottom: 20,
      lineHeight: 22,
    },
    searchRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    searchInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 14,
      fontSize: 16,
    },
    searchBtn: {
      backgroundColor: c.primary,
      width: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    err: { color: c.danger, fontSize: 14 },
    resultsSection: { marginBottom: 16 },
    sectionLabel: {
      color: c.muted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      marginBottom: 10,
    },
    resultCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    resultLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    resultSymbol: { color: c.text, fontSize: 16, fontWeight: "700" },
    resultType: {
      color: c.muted,
      fontSize: 11,
      backgroundColor: c.border,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: "hidden",
    },
    resultName: { color: c.muted, fontSize: 13, marginTop: 4 },
    loadingCard: { alignItems: "center", paddingVertical: 40, gap: 12 },
    loadingText: { color: c.muted, fontSize: 14 },
    detailCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      marginTop: 4,
    },
    detailHeader: { flexDirection: "row", justifyContent: "space-between" },
    ticker: { color: c.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    companyName: { color: c.muted, fontSize: 14, marginTop: 2 },
    priceBox: { alignItems: "flex-end" },
    priceValue: { color: c.text, fontSize: 24, fontWeight: "700" },
    changeRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
    tagRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
    tag: {
      backgroundColor: c.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    tagText: { color: c.primary, fontSize: 12, fontWeight: "600" },
    description: { color: c.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 14 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 16, gap: 2 },
    priceSection: { marginTop: 18 },
    miniChart: {
      backgroundColor: c.bg,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    },
    emptyState: { alignItems: "center", paddingTop: 60, gap: 16 },
    emptyText: {
      color: c.muted,
      fontSize: 15,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 20,
    },
  });
}
