"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AdminAuthState {
  admin: Admin | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthState>({
  admin: null,
  token: null,
  loading: true,
  login: async () => null,
  logout: () => {},
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("paloor_admin_token");
    const savedAdmin = localStorage.getItem("paloor_admin_user");
    if (savedToken && savedAdmin) {
      setToken(savedToken);
      try {
        setAdmin(JSON.parse(savedAdmin));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return err.detail || "Login failed";
      }
      const data = await res.json();
      setToken(data.token);
      setAdmin(data.admin);
      localStorage.setItem("paloor_admin_token", data.token);
      localStorage.setItem("paloor_admin_user", JSON.stringify(data.admin));
      return null;
    } catch {
      return "Network error";
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem("paloor_admin_token");
    localStorage.removeItem("paloor_admin_user");
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, token, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export function adminFetch(token: string, path: string, options?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}
