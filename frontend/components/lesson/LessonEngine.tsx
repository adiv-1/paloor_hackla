"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { LessonModule } from "@/lib/modules/types";
import { InteractiveWidgetView } from "./InteractiveBlock";
import { AICheckpointBlock } from "./AICheckpointBlock";
import { SimTaskBlock } from "./SimTaskBlock";
import { GlossaryText } from "./GlossaryText";
import { ListenButton } from "./ListenButton";
import { InfoPopover } from "@/components/InfoPopover";
import { HighlightAskProvider } from "@/components/HighlightAsk";
import { Sparkles, Lightbulb, Trophy, ArrowLeft } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  module: LessonModule;
  onExit: () => void;
  onComplete: (awarded: number, multiplier: number) => void;
}

export function LessonEngine({ module, onExit, onComplete }: Props) {
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const total = module.blocks.length;
  const block = module.blocks[step];

  // Persist progress on every step change
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/learn/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ module_id: module.id, step_index: step }),
    }).catch(() => {});
  }, [step, module.id, token]);

  function advance() {
    if (step + 1 >= total) {
      // Complete
      fetch(`${API}/api/learn/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ module_id: module.id }),
      })
        .then((r) => r.json())
        .then((j) => onComplete(j.awarded ?? 7, j.multiplier ?? 1.0))
        .catch(() => onComplete(7, 1.0));
      return;
    }
    setStep(step + 1);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex items-center justify-between">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to modules
        </button>
        <div className="text-xs text-muted-foreground">
          {module.title} · Step {step + 1} of {total}
        </div>
      </header>

      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-7">
        {block.kind === "concept" && (
          <ConceptView title={block.title} body={block.body} terms={block.terms} onNext={advance} />
        )}
        {block.kind === "interactive" && (
          <InteractiveView title={block.title} prompt={block.prompt} widget={block.widget} tutor={block.tutor} onNext={advance} />
        )}
        {block.kind === "insight" && (
          <InsightView title={block.title} body={block.body} terms={block.terms} onNext={advance} />
        )}
        {block.kind === "checkpoint" && (
          <AICheckpointBlock block={block} moduleId={module.id} moduleTitle={module.title} onComplete={advance} />
        )}
        {block.kind === "sim" && (
          <SimTaskBlock
            block={block}
            moduleId={module.id}
            moduleTitle={module.title}
            concept={module.subtitle}
            onComplete={advance}
          />
        )}
        {block.kind === "reward" && (
          <RewardView unlocks={block.unlocks} onNext={advance} />
        )}
      </div>
    </div>
  );
}

function ConceptView({ title, body, terms, onNext }: { title: string; body: string; terms?: string[]; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Concept
        </div>
        <div className="flex items-center gap-2">
          <InfoPopover
            title={title}
            description="Ask the AI tutor anything about this concept — examples, common mistakes, deeper context."
            sectionContext={`User is learning the concept "${title}" in a Paloor finance lesson. CONCEPT TEXT:\n${body}\n\nAnswer their question conversationally and concretely (under 150 words). Use plain English with examples.`}
            size="sm"
          />
          <ListenButton text={`${title}. ${body}`} autoPlay />
        </div>
      </div>
      <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
      <HighlightAskProvider contextLabel={`Concept: ${title}`}>
        <GlossaryText text={body} terms={terms} />
      </HighlightAskProvider>
      <button
        onClick={onNext}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Got it
      </button>
    </div>
  );
}

function InteractiveView({ title, prompt, widget, tutor, onNext }: any) {
  const [showTranscript, setShowTranscript] = useState(false);
  const narration = tutor || `${title}. ${prompt}`;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-primary">Try it</div>
          <h3 className="mt-1 text-xl font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{prompt}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <InfoPopover
              title={title}
              description="Stuck or curious? Ask the AI tutor about this exercise."
              sectionContext={`User is doing the interactive exercise "${title}" in a Paloor lesson.\nPROMPT: ${prompt}\nNARRATION: ${narration}\n\nAnswer their question with practical guidance specific to this exercise (under 150 words).`}
              size="sm"
            />
            <ListenButton text={narration} autoPlay />
          </div>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            title="Accessibility: read along instead of listening"
          >
            {showTranscript ? "Hide transcript" : "Can't hear anything? Show transcript"}
          </button>
        </div>
      </div>
      {showTranscript && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Transcript</div>
          {narration}
        </div>
      )}
      <InteractiveWidgetView widget={widget} />
      <button
        onClick={onNext}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Continue
      </button>
    </div>
  );
}

function InsightView({ title, body, terms, onNext }: { title: string; body: string; terms?: string[]; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-500">
          <Lightbulb className="h-3 w-3" /> Insight
        </div>
        <div className="flex items-center gap-2">
          <InfoPopover
            title={title}
            description="Want to dig deeper into this insight? Ask the AI tutor."
            sectionContext={`User is reading an insight titled "${title}" in a Paloor lesson. INSIGHT:\n${body}\n\nAnswer their question with concrete examples that build on this insight (under 150 words).`}
            size="sm"
          />
          <ListenButton text={`${title}. ${body}`} autoPlay />
        </div>
      </div>
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <HighlightAskProvider contextLabel={`Insight: ${title}`}>
        <GlossaryText text={body} terms={terms} />
      </HighlightAskProvider>
      <button
        onClick={onNext}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Continue
      </button>
    </div>
  );
}

function RewardView({ unlocks, onNext }: { unlocks: string[]; onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Trophy className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-2xl font-semibold text-foreground">You&apos;ve understood this concept.</h3>
        <p className="mt-2 text-sm text-muted-foreground">Here&apos;s what you&apos;ve earned.</p>
      </div>
      <ul className="mx-auto inline-block space-y-2 text-left text-sm">
        {unlocks.map((u) => (
          <li key={u} className="flex items-center gap-2 text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {u}
          </li>
        ))}
      </ul>
      <button
        onClick={onNext}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Claim and finish
      </button>
    </div>
  );
}
