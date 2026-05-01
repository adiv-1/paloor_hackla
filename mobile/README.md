# Paloor Mobile (Expo / React Native)

Android (and iOS) client for the Paloor backend. Built with **Expo SDK 54**, **expo-router**, and **TypeScript**. The phone is just the UI — it talks to the existing FastAPI backend over HTTPS/WSS.

## Quick start (LA Hacks demo on a physical Android phone)

### 1. Start the backend on your Mac

```bash
cd backend
source ../.venv/bin/activate
PALOOR_LOCAL_DB=1 uvicorn main:app --host 0.0.0.0 --port 8001
```

The `--host 0.0.0.0` is **required** so your phone can reach the Mac across Wi-Fi. Find your Mac's LAN IP:

```bash
ipconfig getifaddr en0    # e.g. 192.168.1.42
```

### 2. Start the mobile app

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://192.168.1.42:8001 npx expo start
```

(Replace the IP with the one from step 1.)

### 3. Open on the phone

1. Install **Expo Go** from the Play Store on your Android phone.
2. Make sure the phone is on the same Wi-Fi as the Mac.
3. Scan the QR code shown in the terminal with Expo Go.
4. App boots → log in with an existing Paloor account or create a new one.

### Alternative: Android Studio emulator

```bash
cd mobile
npx expo start --android
```

The default `extra.apiUrl` in `app.json` is `http://10.0.2.2:8001`, which is how the Android emulator reaches your Mac's `localhost`. No env var needed.

### Alternative: AWS-hosted backend

Point at the deployed App Runner URL:

```bash
EXPO_PUBLIC_API_URL=https://your-apprunner-url.awsapprunner.com npx expo start
```

## What's implemented

| Screen     | Status   | Notes                                                                   |
| ---------- | -------- | ----------------------------------------------------------------------- |
| Login      | ✅       | `POST /api/auth/login`, JWT stored in AsyncStorage                       |
| Register   | ✅       | `POST /api/auth/register`                                                |
| Chat       | ✅       | WebSocket streaming via `/ws/chat?token=…`, history via REST             |
| Learn      | 🟡 stub  | Lists lessons from `/api/learn/*` — basic card view, no lesson detail   |
| Research   | 🟡 stub  | Ticker lookup via `/api/equities/*` — raw JSON for now                   |
| Profile    | ✅       | Shows email, backend URL, sign-out                                       |

## Architecture

```
mobile/
├── app/                    # expo-router file-based routes
│   ├── _layout.tsx         # Stack root, AuthProvider, theme
│   ├── index.tsx           # Boot redirect (/login or /(tabs)/chat)
│   ├── login.tsx
│   ├── register.tsx
│   └── (tabs)/
│       ├── _layout.tsx     # Bottom tab bar
│       ├── chat.tsx        # AI chat with WS streaming
│       ├── learn.tsx
│       ├── research.tsx
│       └── profile.tsx
└── lib/
    ├── api.ts              # API_URL resolver, fetch wrapper, wsUrl()
    ├── auth.tsx            # AuthProvider + useAuth() (mirrors frontend/lib/auth.tsx)
    └── theme.ts            # Color tokens
```

## Why React Native / Expo (and not the alternatives)

- **PWA**: would work but needs the Next.js app publicly hosted; less impressive for judges.
- **Native Kotlin/Android**: rebuilds everything in a foreign language; no time in a hackathon.
- **Run backend on the phone**: impossible — PostgreSQL + pgvector + the Python ML stack don't run on Android.

## Backend changes

**None required.** React Native fetches don't trigger CORS (CORS is browser-only), and the existing JWT auth + WebSocket protocol Just Works™ from a native client.

## Known gaps / next steps

- Voice input/playback (ElevenLabs TTS, AWS Transcribe STT) — needs `expo-av` + `expo-speech` or `@react-native-voice/voice`.
- Charts (portfolio, stock history) — needs `victory-native` or `react-native-gifted-charts`.
- Document upload (OCR via Gemini) — needs `expo-document-picker` + `expo-image-picker`.
- Profile-setup flow after register (the web app has a multi-step form at `/profile-setup`).
- Push notifications for AI nudges.
