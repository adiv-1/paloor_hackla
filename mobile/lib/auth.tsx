import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useSegments } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

const TOKEN_KEY = "paloor_token";
const USER_KEY = "paloor_user";

export interface User {
  id: string;
  email: string;
  name: string;
  email_verified?: boolean;
  profile_completed?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, name: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  login: async () => null,
  register: async () => null,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthResponse {
  access_token: string;
  user: User;
}

const AUTHENTICATED_ROUTES = ["(tabs)", "lesson"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
        }
      } catch {
        // ignore corrupted storage
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(tabs)";
    const inAllowedRoute = AUTHENTICATED_ROUTES.includes(segments[0] as string);

    if (!token && inAuthGroup) {
      router.replace("/login");
    } else if (
      token &&
      !inAllowedRoute &&
      segments[0] !== undefined
    ) {
      router.replace("/(tabs)/chat");
    }
  }, [loading, token, segments, router]);

  const persist = useCallback(async (t: string, u: User) => {
    await AsyncStorage.setItem(TOKEN_KEY, t);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback<AuthState["login"]>(
    async (email, password) => {
      try {
        const data = await api<AuthResponse>("/api/auth/login", {
          method: "POST",
          json: { email, password },
        });
        await persist(data.access_token, data.user);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Login failed";
      }
    },
    [persist],
  );

  const register = useCallback<AuthState["register"]>(
    async (email, password, name) => {
      try {
        const data = await api<AuthResponse>("/api/auth/register", {
          method: "POST",
          json: { email, password, name },
        });
        await persist(data.access_token, data.user);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Registration failed";
      }
    },
    [persist],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
