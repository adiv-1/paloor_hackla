import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Resolve the backend base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL env var (set by `EXPO_PUBLIC_API_URL=... npx expo start`)
 *   2. `extra.apiUrl` from app.json (defaults to Android emulator loopback 10.0.2.2:8001)
 *   3. Hard fallback to localhost:8001
 *
 * On a physical Android device using Expo Go, you MUST set EXPO_PUBLIC_API_URL
 * to your Mac's LAN IP, e.g. http://192.168.1.42:8001 — the phone cannot reach
 * "localhost" or "10.0.2.2".
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
  if (extra.apiUrl) return extra.apiUrl.replace(/\/+$/, "");
  return Platform.OS === "android" ? "http://10.0.2.2:8001" : "http://127.0.0.1:8001";
}

export const API_URL = resolveApiUrl();

export function wsUrl(path: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return base + (path.startsWith("/") ? path : "/" + path);
}

export interface ApiOptions extends Omit<RequestInit, "headers"> {
  token?: string | null;
  headers?: Record<string, string>;
  json?: unknown;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers = {}, json, body, ...rest } = opts;
  const finalHeaders: Record<string, string> = { ...headers };
  let finalBody = body;
  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(json);
  }
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  const url = path.startsWith("http") ? path : API_URL + path;
  const res = await fetch(url, { ...rest, headers: finalHeaders, body: finalBody });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data && (data as { detail: unknown }).detail) ||
      `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}
