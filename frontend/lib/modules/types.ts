// Block-based lesson engine — shared types
// All blocks render via LessonEngine which advances on `onAdvance()`.

export type BlockKind =
  | "concept"
  | "interactive"
  | "insight"
  | "checkpoint"
  | "sim"
  | "reward";

export interface BaseBlock {
  id: string;
  kind: BlockKind;
}

export interface ConceptBlock extends BaseBlock {
  kind: "concept";
  title: string;
  body: string;            // 1-3 short sentences
  visual?: "compounding" | "allocation" | "correlation"; // small inline svg
  terms?: string[];        // curated glossary terms to underline
}

// Interactive "play" block. Renders the named widget and pipes its live
// output to an InsightBlock immediately after via shared state on the engine.
export interface InteractiveBlock extends BaseBlock {
  kind: "interactive";
  title: string;
  prompt: string;
  widget: InteractiveWidget;
  tutor?: string;          // optional narration script (read aloud + shown in transcript)
}

export type InteractiveWidget =
  | { type: "compound"; defaults: { monthly: number; years: number; rate: number } }
  | { type: "real-vs-nominal"; defaults: { years: number; nominal: number; inflation: number } }
  | { type: "allocation-2"; defaults: { stockPct: number } }
  | { type: "correlation"; defaults: { correlation: number } };

export interface InsightBlock extends BaseBlock {
  kind: "insight";
  title: string;
  body: string;
  terms?: string[];        // curated glossary terms to underline
  // Optional template tokens replaced from previous interactive widget output:
  //   {final}, {gain}, {real}, {erosion}, etc. handled in renderer.
}

export interface CheckpointBlock extends BaseBlock {
  kind: "checkpoint";
  concept: string;          // sent to backend for context
  question: string;         // tutor question shown to user
  keyIdeas: string[];       // backend evaluator targets
  placeholder?: string;
}

export interface SimBlock extends BaseBlock {
  kind: "sim";
  title: string;
  prompt: string;
  // Two portfolios for side-by-side comparison.
  // Each is a list of (name, weight 0-1, expectedReturn, vol).
  portfolios: SimPortfolioInput[];
  durationYears: number;
  startingValue: number;
  // Default "allocation" — sliders adjust stock %.
  // "compounding" — sliders adjust years invested at a fixed expected return
  // and a fixed monthly contribution, illustrating the time lever.
  mode?: "allocation" | "compounding";
  monthlyContribution?: number;       // compounding mode
  expectedAnnualReturn?: number;      // compounding mode (e.g. 0.07)
}

export interface SimPortfolioInput {
  label: string;
  // user-controlled allocation slider key — single slider that splits two assets
  preset: "concentrated" | "diversified" | "user" | "early-start" | "late-start";
  // For compounding mode: number of years the investor stays invested.
  years?: number;
}

export interface RewardBlock extends BaseBlock {
  kind: "reward";
  unlocks: string[];        // human-readable feature unlocks shown
}

export type LessonBlock =
  | ConceptBlock
  | InteractiveBlock
  | InsightBlock
  | CheckpointBlock
  | SimBlock
  | RewardBlock;

export interface LessonModule {
  id: string;
  title: string;
  subtitle: string;
  level: "Foundations" | "Beginner" | "Intermediate";
  estimatedMinutes: number;
  blocks: LessonBlock[];
  unlocks: string[];        // for reward block + product unlock messaging
  requires?: string;        // module_id that must be completed first
}

// Output shape that interactive widgets push back to the engine for templating
// downstream insight blocks.
export type WidgetOutput = Record<string, number | string>;
