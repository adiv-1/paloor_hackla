import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

export interface ThemeColors {
  bg: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  muted: string;
  primary: string;
  primaryDark: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
}

export const lightColors: ThemeColors = {
  bg: "#f8f6f1",
  card: "#ffffff",
  border: "#e2ddd5",
  text: "#1c1917",
  textSecondary: "#44403c",
  muted: "#7b7468",
  primary: "#1a6b55",
  primaryDark: "#15574a",
  primaryText: "#ffffff",
  danger: "#c4362c",
  success: "#16a34a",
  warning: "#d97706",
};

export const darkColors: ThemeColors = {
  bg: "#111110",
  card: "#1c1a19",
  border: "#2e2b27",
  text: "#e8e4de",
  textSecondary: "#c4bfb6",
  muted: "#8a8478",
  primary: "#3dd9a8",
  primaryDark: "#1a6b55",
  primaryText: "#111110",
  danger: "#c4362c",
  success: "#3dd9a8",
  warning: "#e8b931",
};

interface ThemeState {
  colors: ThemeColors;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState>({
  colors: darkColors,
  isDark: true,
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "paloor_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === "light" || v === "dark") setMode(v);
      else setMode(systemScheme === "light" ? "light" : "dark");
    });
  }, [systemScheme]);

  const isDark = mode === "dark" || (mode === null && systemScheme !== "light");
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const toggle = useCallback(async () => {
    const next = isDark ? "light" : "dark";
    setMode(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
