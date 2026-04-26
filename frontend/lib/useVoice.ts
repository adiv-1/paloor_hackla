"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let _voiceEnabledCache: boolean | null = null;

// Module-level audio ref so a global Stop button can halt playback started
// from any hook instance.
let _currentAudio: HTMLAudioElement | null = null;
const _listeners = new Set<(p: boolean) => void>();
let _playing = false;

function _setPlaying(v: boolean) {
  _playing = v;
  _listeners.forEach((fn) => fn(v));
}

export function stopSpeaking() {
  if (_currentAudio) {
    try {
      _currentAudio.pause();
      _currentAudio.src = "";
    } catch {
      /* noop */
    }
    _currentAudio = null;
  }
  _setPlaying(false);
}

export function useIsSpeaking() {
  const [v, setV] = useState(_playing);
  useEffect(() => {
    _listeners.add(setV);
    setV(_playing);
    return () => {
      _listeners.delete(setV);
    };
  }, []);
  return v;
}

/**
 * Browser-side wrapper around the backend ElevenLabs routes.
 * - speak(text): fetches audio/mpeg from /api/learn/voice/tts and plays it
 * - record/stopAndTranscribe: capture mic + send to /api/learn/voice/stt
 */
export function useVoice() {
  const { token } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(_voiceEnabledCache);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (_voiceEnabledCache !== null || !token) return;
    fetch(`${API}/api/learn/voice/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => {
        _voiceEnabledCache = !!j.enabled;
        setEnabled(_voiceEnabledCache);
      })
      .catch(() => {
        _voiceEnabledCache = false;
        setEnabled(false);
      });
  }, [token]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
    if (_currentAudio) {
      try {
        _currentAudio.pause();
        _currentAudio.src = "";
      } catch {
        /* noop */
      }
      _currentAudio = null;
    }
    setPlaying(false);
    _setPlaying(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!token || !text?.trim()) return;
      stop();
      try {
        const res = await fetch(`${API}/api/learn/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          if (res.status === 503) (_voiceEnabledCache = false), setEnabled(false);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        _currentAudio = audio;
        audio.onended = () => {
          setPlaying(false);
          _setPlaying(false);
          if (_currentAudio === audio) _currentAudio = null;
          URL.revokeObjectURL(url);
        };
        setPlaying(true);
        _setPlaying(true);
        await audio.play();
      } catch {
        setPlaying(false);
        _setPlaying(false);
      }
    },
    [token, stop],
  );

  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch (e) {
      console.warn("mic denied", e);
      setRecording(false);
    }
  }, [recording]);

  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    if (!recRef.current) return "";
    const mr = recRef.current;
    const done = new Promise<void>((resolve) => {
      mr.addEventListener("stop", () => resolve(), { once: true });
    });
    mr.stop();
    setRecording(false);
    await done;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    recRef.current = null;
    if (!blob.size || !token) return "";
    const fd = new FormData();
    fd.append("file", blob, "audio.webm");
    try {
      const res = await fetch(`${API}/api/learn/voice/stt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) return "";
      const j = await res.json();
      return (j.text || "").trim();
    } catch {
      return "";
    }
  }, [token]);

  useEffect(() => () => stop(), [stop]);

  return { enabled: enabled === true, speak, stop, playing, startRecording, stopAndTranscribe, recording };
}
