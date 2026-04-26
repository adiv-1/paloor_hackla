"use client";

import { Square } from "lucide-react";
import { useIsSpeaking, stopSpeaking } from "@/lib/useVoice";

/**
 * Global floating button — appears whenever ElevenLabs TTS is playing
 * anywhere in the app and stops it on click.
 */
export function StopSpeakingButton() {
  const speaking = useIsSpeaking();
  if (!speaking) return null;
  return (
    <button
      type="button"
      onClick={() => stopSpeaking()}
      title="Stop speaking"
      className="fixed z-[9991] bottom-36 right-5 h-10 px-3 rounded-full bg-background text-foreground border border-border shadow-lg hover:bg-muted transition-colors flex items-center gap-2 text-xs font-medium"
    >
      <Square className="h-3 w-3" fill="currentColor" />
      Stop speaking
    </button>
  );
}
