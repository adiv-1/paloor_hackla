"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface User {
  id: string;
  email: string;
  name: string;
  email_verified?: boolean;
  profile_completed?: boolean;
  age?: number | null;
  gender?: string | null;
  occupation?: string | null;
  annual_income?: string | null;
  net_worth_estimate?: string | null;
  financial_goals?: string[] | null;
  risk_tolerance?: string | null;
  dependents?: number | null;
  state?: string | null;
  photo_url?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (
    email: string,
    password: string,
    name: string,
  ) => Promise<string | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  login: async () => null,
  register: async () => null,
  logout: () => {},
  refreshUser: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const setUser = useCallback((u: User) => {
    setUserState(u);
    localStorage.setItem("paloor_user", JSON.stringify(u));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("paloor_token");
    const savedUser = localStorage.getItem("paloor_user");
    if (saved && savedUser) {
      setToken(saved);
      setUserState(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading && !token && pathname.startsWith("/dashboard")) {
      router.replace("/login");
    }
  }, [loading, token, pathname, router]);

  const refreshUser = useCallback(async () => {
    const t = token || localStorage.getItem("paloor_token");
    if (!t) return;
    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      // Ignore refresh failures; stale session will be handled by route guards.
    }
  }, [token, setUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const res = await fetch(`${API}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const err = await res.json();
          return err.detail || "Invalid credentials";
        }
        const data = await res.json();
        localStorage.setItem("paloor_token", data.access_token);
        localStorage.setItem("paloor_user", JSON.stringify(data.user));
        setToken(data.access_token);
        setUserState(data.user);
        return null;
      } catch {
        return "Network error";
      }
    },
    [],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
    ): Promise<string | null> => {
      try {
        const res = await fetch(`${API}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) {
          const err = await res.json();
          return err.detail || "Registration failed";
        }
        const data = await res.json();
        // Brand-new account: clear any leftover onboarding flag so the
        // walkthrough always shows for newly created users.
        localStorage.removeItem("paloor_onboarded");
        localStorage.setItem("paloor_token", data.access_token);
        localStorage.setItem("paloor_user", JSON.stringify(data.user));
        setToken(data.access_token);
        setUserState(data.user);
        return null;
      } catch {
        return "Network error";
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("paloor_token");
    localStorage.removeItem("paloor_user");
    localStorage.removeItem("paloor_onboarded");
    setToken(null);
    setUserState(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
