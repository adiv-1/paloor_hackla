export type BlockKind =
  | "concept"
  | "interactive"
  | "insight"
  | "checkpoint"
  | "sim"
  | "reward";

export interface LessonBlock {
  id: string;
  kind: BlockKind;
  title?: string;
  body?: string;
  prompt?: string;
  tutor?: string;
  terms?: string[];
  concept?: string;
  question?: string;
  keyIdeas?: string[];
  placeholder?: string;
  unlocks?: string[];
}

export interface LessonModule {
  id: string;
  title: string;
  subtitle: string;
  level: "Foundations" | "Beginner" | "Intermediate";
  estimatedMinutes: number;
  blocks: LessonBlock[];
  unlocks: string[];
  requires?: string;
}

export const RETURNS_MODULE: LessonModule = {
  id: "returns",
  title: "Returns",
  subtitle: "Why money grows \u2014 compounding, percentages, and inflation",
  level: "Foundations",
  estimatedMinutes: 8,
  unlocks: ["Compound Calculator widget in Portfolio", "+7 days AI credits"],
  blocks: [
    {
      id: "r1",
      kind: "concept",
      title: "Returns mean two things",
      body: "A return is what your money earns over time. It can be a percent (5%) or a dollar amount ($500). Both matter \u2014 but they tell different stories.",
      terms: ["return", "percent", "dollar amount"],
    },
    {
      id: "r2",
      kind: "interactive",
      title: "Play with compounding",
      prompt:
        "Drag the sliders. Notice how time changes the answer more than rate or contribution.",
      tutor:
        "Let\u2019s see compounding in action. There are three sliders: monthly contribution, number of years, and annual return. Try doubling the monthly amount \u2014 the final value roughly doubles. Now reset and double the years instead. You\u2019ll notice the final value jumps far more than double. That gap between the green line and the flat amount you put in is compounding doing the work. The takeaway: time is the strongest lever you have.",
    },
    {
      id: "r3",
      kind: "insight",
      title: "Time is the heaviest lever",
      body: "Doubling your monthly amount roughly doubles your end value. Doubling your years more than doubles it \u2014 sometimes triples it. That\u2019s compounding.",
      terms: ["compounding"],
    },
    {
      id: "r4",
      kind: "concept",
      title: "Percent vs dollars",
      body: "A 10% return on $1,000 is $100. A 10% return on $1M is $100,000. Same percent, very different impact. As your portfolio grows, the dollar amount grows faster than the percent suggests.",
      terms: ["portfolio", "return"],
    },
    {
      id: "r5",
      kind: "interactive",
      title: "Inflation eats returns",
      prompt:
        "Move the inflation slider. The grey line is what your money is actually worth.",
      tutor:
        "Here\u2019s why inflation matters. The green line shows your money growing at the nominal return \u2014 the headline number. The grey line shows what that money is actually worth after inflation eats into it. Slide inflation up and watch the grey line flatten. Even a small gap, like seven percent return minus three percent inflation, leaves you with about four percent of real growth. That\u2019s the number you can actually spend.",
    },
    {
      id: "r6",
      kind: "insight",
      title: "Real return is what you live on",
      body: "Earning 7% with 3% inflation means you\u2019re really only growing at about 4%. Always think in real returns when planning long-term.",
      terms: ["inflation", "real returns", "real return"],
    },
    {
      id: "r7",
      kind: "checkpoint",
      concept: "Compounding, percent vs dollars, real vs nominal returns",
      question:
        "If you had to explain to a friend why starting to invest at 22 instead of 32 matters so much, what would you say?",
      keyIdeas: [
        "Time multiplies returns more than rate or contribution",
        "Compounding builds on itself each year",
        "An extra decade can roughly double the end value",
      ],
      placeholder: "Type a few sentences in your own words\u2026",
    },
    {
      id: "r8",
      kind: "sim",
      title: "See the time lever in action",
      prompt:
        "Same $500/month, same 7% expected return. The only difference: how many years each investor stays invested.",
    },
    {
      id: "r9",
      kind: "reward",
      unlocks: [
        "Compound Calculator unlocked in Portfolio",
        "+7 days AI credits earned",
      ],
    },
  ],
};

export const DIVERSIFICATION_MODULE: LessonModule = {
  id: "diversification",
  title: "Diversification",
  subtitle: "Why owning many things beats owning one",
  level: "Beginner",
  estimatedMinutes: 9,
  requires: "returns",
  unlocks: ["Correlation Matrix in Equities", "+7 days AI credits"],
  blocks: [
    {
      id: "d1",
      kind: "concept",
      title: "Concentration is the hidden risk",
      body: "If you own one company and it falls 50%, you fall 50%. If you own twenty companies, the chance that all of them fall together is much lower. That\u2019s the simple intuition behind diversification.",
      terms: ["diversification", "concentration", "risk"],
    },
    {
      id: "d2",
      kind: "interactive",
      title: "Split your portfolio",
      prompt:
        "Slide between 100% stocks and 100% bonds. Watch the expected return and risk shift together.",
      tutor:
        "This slider mixes stocks and bonds. Push it all the way to stocks: expected return goes up, but so does risk \u2014 your portfolio will swing harder. Slide back toward bonds: smoother ride, but lower long-term return. There\u2019s no single right answer; it depends on how long you have and how much volatility you can stomach. Try a 60/40 split \u2014 a classic starting point for many investors.",
    },
    {
      id: "d3",
      kind: "insight",
      title: "Risk and return move together",
      body: "More stocks means higher expected return \u2014 and higher swings. There\u2019s no free lunch on return. But there is a free lunch on risk, which we\u2019ll see next.",
      terms: ["expected return", "risk", "stocks", "bonds"],
    },
    {
      id: "d4",
      kind: "concept",
      title: "Correlation is the magic ingredient",
      body: "When two assets move differently from each other (low correlation), combining them reduces risk without reducing return as much. This is the only true free lunch in finance.",
      terms: ["correlation", "assets", "risk"],
    },
    {
      id: "d5",
      kind: "interactive",
      title: "Try different correlations",
      prompt:
        "Drag the correlation slider. Notice how a 50/50 mix has lower risk when assets are uncorrelated.",
      tutor:
        "Now this is the magic. Two assets with the same individual risk are mixed 50/50. Drag the correlation slider. When correlation is high \u2014 close to one \u2014 they move together and the combined risk barely drops. Bring correlation down to zero, or even negative, and the combined risk falls noticeably even though neither asset got safer. That\u2019s the only true free lunch in investing: combining things that don\u2019t move in sync.",
    },
    {
      id: "d6",
      kind: "insight",
      title: "Lower correlation = smoother ride",
      body: "Two assets with the same individual risk can produce a much lower combined risk if they don\u2019t move together. That\u2019s why a global, multi-asset portfolio feels calmer than any one piece.",
      terms: ["correlation", "portfolio", "risk"],
    },
    {
      id: "d7",
      kind: "checkpoint",
      concept: "Diversification, correlation, risk-adjusted returns",
      question:
        "A friend says \u2018I just want to put everything in NVIDIA \u2014 it\u2019s been the best stock.\u2019 How would you push back without being preachy?",
      keyIdeas: [
        "Past performance doesn\u2019t guarantee future returns",
        "Concentrated bets carry catastrophic downside risk",
        "Diversification reduces risk without proportionally reducing return",
      ],
      placeholder: "What would you actually say to them?",
    },
    {
      id: "d8",
      kind: "sim",
      title: "Concentrated vs diversified \u2014 3 years",
      prompt:
        "Same starting capital. Two strategies. Watch them play out.",
    },
    {
      id: "d9",
      kind: "reward",
      unlocks: [
        "Correlation Matrix unlocked in Equities",
        "+7 days AI credits earned",
      ],
    },
  ],
};

export const MODULES: LessonModule[] = [RETURNS_MODULE, DIVERSIFICATION_MODULE];
