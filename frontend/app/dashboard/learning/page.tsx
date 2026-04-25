"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Flame,
  Star,
  Lock,
  CheckCircle,
  Clock,
  Award,
  Zap,
  ChevronRight,
  Heart,
  Sparkles,
  Gift,
  Loader2,
  Play,
  CircleDot,
  Lightbulb,
  TrendingUp,
  Shield,
  Building2,
  Landmark,
  PiggyBank,
  Target,
  LineChart,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  xp: number;
  completed: boolean;
  locked: boolean;
  type: "read" | "interactive" | "quiz" | "sim-task";
}

interface Chapter {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  lessons: Lesson[];
  reward: string;
  level: "Foundations" | "Beginner" | "Intermediate" | "Master";
  simTask?: string;
}

interface Certification {
  id: string;
  title: string;
  issueDate: string | null;
  status: "earned" | "in-progress" | "locked";
  chapterId: string;
  badgeColor: string;
  description: string;
}

interface Incentive {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  type: "premium" | "badge" | "feature";
  daysUnlocked: number | null;
}

interface UserProgress {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lessonsCompleted: number;
  totalLessons: number;
  certificationsEarned: number;
  totalCertifications: number;
  level: number;
  nextLevelXp: number;
  weeklyActivity: boolean[];
}

/* ── Mock Data ─────────────────────────────────────────────────────── */

function generateLearningData() {
  const chapters: Chapter[] = [
    // ─── FOUNDATIONS (the absolute basics — no jargon) ───
    {
      id: "ch_money",
      title: "What Is Money, Really?",
      description:
        "Before investing, understand why money has value, how prices change over time, and what inflation actually means for your life.",
      icon: "Sparkles",
      color: "#f59e0b",
      progress: 100,
      totalLessons: 4,
      completedLessons: 4,
      level: "Foundations",
      reward: "Unlocks all Beginner paths",
      lessons: [
        {
          id: "m_1",
          title: "Why Does a Dollar Today Beat a Dollar Tomorrow?",
          subtitle:
            "The time value of money — the single most important idea in finance.",
          duration: "4 min",
          xp: 40,
          completed: true,
          locked: false,
          type: "read",
        },
        {
          id: "m_2",
          title: "What Is Inflation? (And Why Your Grandma's $5 Mattered)",
          subtitle: "Prices go up. Your savings lose power. Here's the math.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "interactive",
        },
        {
          id: "m_3",
          title: "Saving vs. Investing — What's the Difference?",
          subtitle:
            "Saving protects money. Investing grows it. Know when to do each.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "read",
        },
        {
          id: "m_4",
          title: "The Rule of 72",
          subtitle:
            "A mental shortcut: divide 72 by your interest rate → years to double your money.",
          duration: "3 min",
          xp: 60,
          completed: true,
          locked: false,
          type: "quiz",
        },
      ],
    },
    {
      id: "ch_grow",
      title: "How Money Grows",
      description:
        "Compound interest, the stock market's purpose, and why starting early is the biggest advantage you'll ever have.",
      icon: "TrendingUp",
      color: "#10b981",
      progress: 60,
      totalLessons: 5,
      completedLessons: 3,
      level: "Foundations",
      reward: "7 days free AI Insights",
      lessons: [
        {
          id: "g_1",
          title: "Compound Interest — The Eighth Wonder of the World",
          subtitle:
            "Einstein (maybe) said it. Here's why it matters more than anything.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "interactive",
        },
        {
          id: "g_2",
          title: "What Is the Stock Market?",
          subtitle:
            "A marketplace where you buy tiny pieces of real companies.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "read",
        },
        {
          id: "g_3",
          title: "Why Starting at 22 vs. 32 Changes Everything",
          subtitle: "The math of 10 years of compounding — it's not close.",
          duration: "4 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "interactive",
        },
        {
          id: "g_4",
          title: "What Is an ETF?",
          subtitle:
            "One purchase, hundreds of companies. The easiest way to start.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "g_5",
          title: "Your First $100 → What Should You Do?",
          subtitle:
            "Practical action: where to put money if you only have $100.",
          duration: "5 min",
          xp: 80,
          completed: false,
          locked: false,
          type: "quiz",
        },
      ],
    },
    {
      id: "ch_protect",
      title: "How Not to Lose Money",
      description:
        "Risk, diversification, scams, and the emotional traps that destroy portfolios. The lessons Wall Street hopes you never learn.",
      icon: "Shield",
      color: "#ef4444",
      progress: 25,
      totalLessons: 4,
      completedLessons: 1,
      level: "Foundations",
      reward: "7 days free AI Insights",
      lessons: [
        {
          id: "p_1",
          title: "Risk — It's Not a Bad Word",
          subtitle:
            "Every investment has risk. The goal isn't zero risk — it's the right risk.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "read",
        },
        {
          id: "p_2",
          title: "Don't Put All Your Eggs in One Basket",
          subtitle:
            "Diversification in plain English — and when it actually fails.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: false,
          type: "interactive",
        },
        {
          id: "p_3",
          title: 'The Biggest Lie: "I\'ll Time the Market"',
          subtitle:
            "Why even professional fund managers can't do it consistently.",
          duration: "5 min",
          xp: 60,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "p_4",
          title: "Scams, Meme Stocks, and FOMO",
          subtitle:
            "If it sounds too good to be true, it is. How to protect yourself.",
          duration: "5 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "quiz",
        },
      ],
    },
    {
      id: "ch_why_paloor",
      title: "Why Paloor?",
      description:
        "How Paloor helps you track, learn, and grow your wealth — and why understanding your own finances is the first step.",
      icon: "Heart",
      color: "#8b5cf6",
      progress: 0,
      totalLessons: 3,
      completedLessons: 0,
      level: "Foundations",
      reward: "Unlock Trade Simulator",
      lessons: [
        {
          id: "wp_1",
          title: "Your Financial Dashboard — What It All Means",
          subtitle:
            "A tour of your net worth, assets, and what each number actually means.",
          duration: "4 min",
          xp: 40,
          completed: false,
          locked: false,
          type: "interactive",
        },
        {
          id: "wp_2",
          title: "How AI Helps You (Without Replacing Your Brain)",
          subtitle:
            "Paloor's AI reads your data and gives you insights — here's how to use them.",
          duration: "5 min",
          xp: 50,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "wp_3",
          title: "Building Your First Financial Plan",
          subtitle: "Set a goal, allocate, and track it. Your first real step.",
          duration: "6 min",
          xp: 80,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },

    // ─── BEGINNER (actual asset classes explained simply) ───
    {
      id: "ch_equities",
      title: "Stocks — Owning a Piece of a Company",
      description:
        "What a stock actually is, how to read a stock page, P/E ratios without the jargon, and when to buy vs. hold.",
      icon: "LineChart",
      color: "#10b981",
      progress: 30,
      totalLessons: 6,
      completedLessons: 2,
      level: "Beginner",
      reward: "15 days free AI Equity Insights",
      simTask:
        "Buy 3 different stocks in the Trade Simulator using what you learned. Hold for a simulated 6 months.",
      lessons: [
        {
          id: "eq_1",
          title: "A Stock Is a Tiny Piece of a Real Company",
          subtitle:
            "You buy Apple stock → you own a slice of Apple. That's it.",
          duration: "5 min",
          xp: 50,
          completed: true,
          locked: false,
          type: "read",
        },
        {
          id: "eq_2",
          title: "How to Read a Stock Page",
          subtitle: "Price, volume, market cap, 52-week high/low — decoded.",
          duration: "7 min",
          xp: 60,
          completed: true,
          locked: false,
          type: "interactive",
        },
        {
          id: "eq_3",
          title: "P/E Ratio — Is This Stock Expensive?",
          subtitle:
            "The most common number on Wall Street, explained like you're 10.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "eq_4",
          title: "Dividends — Getting Paid to Hold",
          subtitle: "Some companies pay you cash just for owning their stock.",
          duration: "5 min",
          xp: 50,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "eq_5",
          title: "Growth vs. Value — Two Ways to Win",
          subtitle:
            "Tesla vs. Coca-Cola. Both can make you money. Different games.",
          duration: "7 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "eq_6",
          title: "\u{1F9EA} Sim Task: Build Your First Stock Portfolio",
          subtitle:
            "Use the Trade Simulator to buy 3 stocks and hold for 6 simulated months.",
          duration: "15 min",
          xp: 200,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },
    {
      id: "ch_bonds",
      title: "Bonds — Lending Money for Profit",
      description:
        "When you buy a bond, you're the bank. Learn how lending to governments and companies earns you steady income.",
      icon: "Landmark",
      color: "#6366f1",
      progress: 0,
      totalLessons: 5,
      completedLessons: 0,
      level: "Beginner",
      reward: "15 days free AI Portfolio Insights",
      simTask:
        "Allocate 30% of your sim portfolio to bonds and observe the difference in volatility over 1 simulated year.",
      lessons: [
        {
          id: "bd_1",
          title: "You Are the Bank",
          subtitle:
            "Buy a bond = lend someone money. They pay you back with interest.",
          duration: "5 min",
          xp: 50,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "bd_2",
          title: "Why Bonds Go Down When Rates Go Up",
          subtitle:
            "The inverse relationship that confuses everyone — made simple.",
          duration: "7 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "bd_3",
          title: "Government vs. Corporate Bonds",
          subtitle:
            "Treasury bonds are ultra-safe. Corporate bonds pay more. The trade-off.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "bd_4",
          title: "What the Yield Curve Is Telling You",
          subtitle:
            "When short-term rates beat long-term rates, something is wrong.",
          duration: "8 min",
          xp: 80,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "bd_5",
          title: "\u{1F9EA} Sim Task: Add Bonds to Your Portfolio",
          subtitle:
            "Allocate 30% to bonds in the simulator. Watch how it changes your risk.",
          duration: "15 min",
          xp: 200,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },
    {
      id: "ch_realestate",
      title: "Real Estate — Land, Buildings, and REITs",
      description:
        "You don't need to buy a house. REITs let you invest in real estate for the price of a stock. Or go big and learn rental economics.",
      icon: "Building2",
      color: "#f59e0b",
      progress: 0,
      totalLessons: 5,
      completedLessons: 0,
      level: "Beginner",
      reward: "15 days free AI Spending Insights",
      simTask:
        "Build a sim portfolio with 20% real estate exposure using REITs.",
      lessons: [
        {
          id: "re_1",
          title: "Why Real Estate Is Different From Everything Else",
          subtitle:
            "It's physical, it generates rent, and it's tax-advantaged. Triple threat.",
          duration: "5 min",
          xp: 50,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "re_2",
          title: "REITs — Real Estate Without the Headaches",
          subtitle:
            "Buy a REIT ETF, own a slice of shopping malls, warehouses, apartments.",
          duration: "7 min",
          xp: 60,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "re_3",
          title: "Cap Rate — The One Number Investors Care About",
          subtitle: "Net income / property price = is this deal worth it?",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "re_4",
          title: "Leverage — Using a Mortgage to Multiply Returns",
          subtitle: "Put down 20%, control 100%. Powerful and dangerous.",
          duration: "7 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "re_5",
          title: "\u{1F9EA} Sim Task: Real Estate in Your Portfolio",
          subtitle: "Add REIT exposure and compare to equities-only.",
          duration: "15 min",
          xp: 200,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },

    // ─── INTERMEDIATE ───
    {
      id: "ch_portfolio",
      title: "Building a Real Portfolio",
      description:
        "Asset allocation, the efficient frontier, Sharpe ratio, and rebalancing — the math that separates amateurs from investors.",
      icon: "Target",
      color: "#ec4899",
      progress: 0,
      totalLessons: 5,
      completedLessons: 0,
      level: "Intermediate",
      reward: "30 days free AI Portfolio Advisor",
      simTask: "Create a 3-asset portfolio optimized for your risk tolerance.",
      lessons: [
        {
          id: "pt_1",
          title: "Asset Allocation > Stock Picking",
          subtitle:
            "90% of returns come from allocation, not from picking the right stock.",
          duration: "6 min",
          xp: 50,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "pt_2",
          title: "The Efficient Frontier (Without the PhD)",
          subtitle:
            "The best possible return for any level of risk. Visualized.",
          duration: "8 min",
          xp: 80,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "pt_3",
          title: "Sharpe Ratio — One Number to Rule Them All",
          subtitle:
            "Return per unit of risk. Higher is better. That's the whole thing.",
          duration: "7 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "pt_4",
          title: "When and How to Rebalance",
          subtitle: "Your portfolio drifts over time. Here's when to fix it.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "pt_5",
          title: "\u{1F9EA} Sim Task: Optimize Your Portfolio",
          subtitle:
            "Build a diversified 3-asset portfolio in the Trade Simulator.",
          duration: "20 min",
          xp: 300,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },
    {
      id: "ch_retirement",
      title: "Retirement Isn't Optional",
      description:
        "401(k), IRA, Roth, Social Security — the tax-advantaged accounts that can make you wealthy if you start now.",
      icon: "PiggyBank",
      color: "#14b8a6",
      progress: 0,
      totalLessons: 4,
      completedLessons: 0,
      level: "Intermediate",
      reward: "30 days free AI Financial Planning",
      lessons: [
        {
          id: "rt_1",
          title: "401(k) and IRA — Free Money You're Probably Missing",
          subtitle:
            "Employer match = free money. Tax deduction = government subsidy.",
          duration: "6 min",
          xp: 60,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "rt_2",
          title: "Roth vs. Traditional — Pay Taxes Now or Later?",
          subtitle:
            "The answer depends on one question: will you earn more later?",
          duration: "7 min",
          xp: 70,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "rt_3",
          title: "The 4% Rule — How Much Do You Need to Retire?",
          subtitle: "Multiply your annual spending by 25. That's your number.",
          duration: "5 min",
          xp: 50,
          completed: false,
          locked: true,
          type: "read",
        },
        {
          id: "rt_4",
          title: "FIRE — Financial Independence, Retire Early",
          subtitle:
            "The math is simple. The execution is hard. Let's talk about both.",
          duration: "8 min",
          xp: 80,
          completed: false,
          locked: true,
          type: "quiz",
        },
      ],
    },

    // ─── MASTER ───
    {
      id: "ch_models",
      title: "How Paloor Models Markets",
      description:
        "Peek behind the curtain: Markov regimes, z-scores, mean reversion, and the quantitative models powering your dashboard.",
      icon: "Sparkles",
      color: "#a855f7",
      progress: 0,
      totalLessons: 4,
      completedLessons: 0,
      level: "Master",
      reward: "Permanent AI Insights (no expiry)",
      simTask: "Use regime signals to time a sim trade. Did the model help?",
      lessons: [
        {
          id: "ml_1",
          title: "What Is a Markov Regime Model?",
          subtitle:
            "Markets have moods — bull, bear, neutral. This model detects them.",
          duration: "8 min",
          xp: 100,
          completed: false,
          locked: false,
          type: "read",
        },
        {
          id: "ml_2",
          title: "Z-Scores and Mean Reversion",
          subtitle: "How far is the price from normal? When does it snap back?",
          duration: "10 min",
          xp: 120,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "ml_3",
          title: "Reading the Paloor Equities Dashboard",
          subtitle: "Now you understand the models. Here's how to use them.",
          duration: "8 min",
          xp: 100,
          completed: false,
          locked: true,
          type: "interactive",
        },
        {
          id: "ml_4",
          title: "\u{1F9EA} Sim Task: Trade with the Model",
          subtitle: "Use the regime signals to time a trade in the simulator.",
          duration: "20 min",
          xp: 400,
          completed: false,
          locked: true,
          type: "sim-task",
        },
      ],
    },
  ];

  const userProgress: UserProgress = {
    totalXp: 1480,
    currentStreak: 12,
    longestStreak: 23,
    lessonsCompleted: 10,
    totalLessons: chapters.reduce((s, c) => s + c.totalLessons, 0),
    certificationsEarned: 1,
    totalCertifications: chapters.length,
    level: 4,
    nextLevelXp: 2000,
    weeklyActivity: [true, true, false, true, true, true, false],
  };

  const certifications: Certification[] = [
    {
      id: "cert_money",
      title: "Money Foundations",
      issueDate: "Feb 20, 2026",
      status: "earned",
      chapterId: "ch_money",
      badgeColor: "#f59e0b",
      description:
        "You understand the time value of money, inflation, and why investing matters.",
    },
    {
      id: "cert_grow",
      title: "Growth Fundamentals",
      issueDate: null,
      status: "in-progress",
      chapterId: "ch_grow",
      badgeColor: "#10b981",
      description: "Compound interest, markets, and taking your first step.",
    },
    {
      id: "cert_protect",
      title: "Risk Awareness",
      issueDate: null,
      status: "in-progress",
      chapterId: "ch_protect",
      badgeColor: "#ef4444",
      description:
        "Understanding risk, diversification, and avoiding common traps.",
    },
    {
      id: "cert_equities",
      title: "Equity Literacy",
      issueDate: null,
      status: "in-progress",
      chapterId: "ch_equities",
      badgeColor: "#10b981",
      description:
        "Read stock pages, understand valuations, build your first equity portfolio.",
    },
    {
      id: "cert_bonds",
      title: "Fixed Income Literacy",
      issueDate: null,
      status: "locked",
      chapterId: "ch_bonds",
      badgeColor: "#6366f1",
      description: "Bonds, yield curves, and the role of fixed income.",
    },
    {
      id: "cert_realestate",
      title: "Real Estate Literacy",
      issueDate: null,
      status: "locked",
      chapterId: "ch_realestate",
      badgeColor: "#f59e0b",
      description: "REITs, cap rates, leverage, and real estate investing.",
    },
    {
      id: "cert_portfolio",
      title: "Portfolio Strategist",
      issueDate: null,
      status: "locked",
      chapterId: "ch_portfolio",
      badgeColor: "#ec4899",
      description:
        "Asset allocation, Sharpe ratio, and portfolio optimization.",
    },
    {
      id: "cert_retirement",
      title: "Retirement Ready",
      issueDate: null,
      status: "locked",
      chapterId: "ch_retirement",
      badgeColor: "#14b8a6",
      description:
        "Tax-advantaged accounts, the 4% rule, and financial independence.",
    },
    {
      id: "cert_models",
      title: "Quant Explorer",
      issueDate: null,
      status: "locked",
      chapterId: "ch_models",
      badgeColor: "#a855f7",
      description:
        "Understand the quant models powering your Paloor dashboard.",
    },
  ];

  const incentives: Incentive[] = [
    {
      id: "inc_1",
      title: "Foundations Complete",
      description:
        "Complete all 4 Foundation chapters to unlock Beginner paths + 7 days AI Insights free.",
      earned: false,
      type: "premium",
      daysUnlocked: 7,
    },
    {
      id: "inc_2",
      title: "Beginner Stocks",
      description:
        "Complete Stocks chapter → 15 days AI Equity Insights. Yours forever once earned.",
      earned: false,
      type: "premium",
      daysUnlocked: 15,
    },
    {
      id: "inc_3",
      title: "Beginner Bonds",
      description: "Complete Bonds chapter → 15 days AI Portfolio Insights.",
      earned: false,
      type: "premium",
      daysUnlocked: 15,
    },
    {
      id: "inc_4",
      title: "Portfolio Master",
      description:
        "Complete Portfolio chapter → 30 days full AI Portfolio Advisor.",
      earned: false,
      type: "premium",
      daysUnlocked: 30,
    },
    {
      id: "inc_5",
      title: "Quant Explorer",
      description:
        "Complete all Master chapters → Permanent AI Insights access (no expiry, ever).",
      earned: false,
      type: "feature",
      daysUnlocked: null,
    },
  ];

  return { chapters, userProgress, certifications, incentives };
}

/* ── Icon Map ──────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Sparkles,
  TrendingUp,
  Shield,
  Heart,
  LineChart,
  Landmark,
  Building2,
  Target,
  PiggyBank,
};

const LEVEL_COLORS: Record<string, string> = {
  Foundations: "#f59e0b",
  Beginner: "#10b981",
  Intermediate: "#6366f1",
  Master: "#a855f7",
};

const LESSON_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  read: { label: "Read", color: "#71717a" },
  interactive: { label: "Interactive", color: "#3b82f6" },
  quiz: { label: "Quiz", color: "#f59e0b" },
  "sim-task": { label: "Sim Task", color: "#10b981" },
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function LearningPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReturnType<
    typeof generateLearningData
  > | null>(null);
  const [activeTab, setActiveTab] = useState<"learn" | "certs" | "rewards">(
    "learn",
  );
  const [expandedChapter, setExpandedChapter] = useState<string | null>(
    "ch_grow",
  );
  const [activeLevel, setActiveLevel] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(generateLearningData());
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { chapters, userProgress, certifications, incentives } = data;
  const xpPercent = Math.round(
    (userProgress.totalXp / userProgress.nextLevelXp) * 100,
  );
  const levels = ["Foundations", "Beginner", "Intermediate", "Master"];
  const filteredChapters = activeLevel
    ? chapters.filter((c) => c.level === activeLevel)
    : chapters;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl tracking-tight">Learning</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Finance is gatekept. We&apos;re changing that — one concept at a time.
        </p>
      </div>

      {/* Progress + Streak */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <span className="text-sm font-medium">
                {userProgress.totalXp.toLocaleString()} XP
              </span>
              <span className="text-xs text-muted-foreground">
                · Level {userProgress.level}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {userProgress.nextLevelXp - userProgress.totalXp} XP to Level{" "}
              {userProgress.level + 1}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
            <span>
              {userProgress.lessonsCompleted} / {userProgress.totalLessons}{" "}
              lessons
            </span>
            <span>
              {userProgress.certificationsEarned} /{" "}
              {userProgress.totalCertifications} certifications
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-orange-500" />
            <span className="text-sm font-semibold">
              {userProgress.currentStreak} day streak
            </span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-full h-5 rounded-sm ${userProgress.weeklyActivity[i] ? "bg-orange-500/80" : "bg-muted"}`}
                />
                <span className="text-[9px] text-muted-foreground">{day}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Best: {userProgress.longestStreak} days
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { key: "learn" as const, label: "Learning Paths", icon: BookOpen },
          { key: "certs" as const, label: "Certifications", icon: Award },
          { key: "rewards" as const, label: "Rewards", icon: Gift },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── LEARNING PATHS ── */}
      {activeTab === "learn" && (
        <div className="space-y-5">
          {/* Level Filter */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveLevel(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !activeLevel
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() =>
                  setActiveLevel(activeLevel === level ? null : level)
                }
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activeLevel === level
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: LEVEL_COLORS[level] }}
                />
                {level}
              </button>
            ))}
          </div>

          {/* Chapters */}
          {filteredChapters.map((ch) => {
            const Icon = ICON_MAP[ch.icon] || BookOpen;
            const expanded = expandedChapter === ch.id;
            const allDone = ch.completedLessons === ch.totalLessons;
            return (
              <div
                key={ch.id}
                className={`rounded-xl border bg-card overflow-hidden transition-all ${allDone ? "border-primary/30" : "border-border"}`}
              >
                <button
                  onClick={() => setExpandedChapter(expanded ? null : ch.id)}
                  className="w-full p-5 flex items-center gap-4 text-left hover:bg-accent/30 transition-colors"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${ch.color}15` }}
                  >
                    {allDone ? (
                      <CheckCircle size={22} className="text-primary" />
                    ) : (
                      <Icon size={22} style={{ color: ch.color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{ch.title}</h3>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: `${LEVEL_COLORS[ch.level]}15`,
                          color: LEVEL_COLORS[ch.level],
                        }}
                      >
                        {ch.level}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {ch.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${ch.progress}%`,
                            backgroundColor: ch.color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {ch.completedLessons}/{ch.totalLessons}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-border">
                    {ch.lessons.map((lesson, idx) => {
                      const typeInfo = LESSON_TYPE_LABELS[lesson.type];
                      return (
                        <div
                          key={lesson.id}
                          className={`flex items-center gap-3 px-5 py-3.5 ${idx < ch.lessons.length - 1 ? "border-b border-border/40" : ""} ${lesson.locked ? "opacity-35" : "hover:bg-accent/20"} transition-colors`}
                        >
                          <div className="w-6 h-6 flex items-center justify-center shrink-0">
                            {lesson.completed ? (
                              <CheckCircle
                                size={18}
                                className="text-primary"
                              />
                            ) : lesson.locked ? (
                              <Lock
                                size={14}
                                className="text-muted-foreground"
                              />
                            ) : lesson.type === "sim-task" ? (
                              <CircleDot
                                size={16}
                                style={{ color: "#10b981" }}
                              />
                            ) : (
                              <Play size={14} style={{ color: ch.color }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {lesson.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {lesson.subtitle}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: `${typeInfo.color}15`,
                                color: typeInfo.color,
                              }}
                            >
                              {typeInfo.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock size={10} /> {lesson.duration}
                            </span>
                            <span className="text-[10px] tabular-nums text-amber-400 flex items-center gap-1 w-12 justify-end">
                              <Zap size={10} /> {lesson.xp}
                            </span>
                            {!lesson.locked && !lesson.completed && (
                              <button className="text-xs px-3 py-1 rounded-md font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                                Start
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="px-5 py-3 bg-muted/30 flex items-center gap-3 text-xs">
                      <Gift size={14} className="text-amber-400 shrink-0" />
                      <span className="text-muted-foreground">
                        Complete this path →{" "}
                        <strong className="text-foreground">{ch.reward}</strong>
                      </span>
                      {ch.simTask && (
                        <span className="ml-auto text-[10px] text-primary flex items-center gap-1">
                          <CircleDot size={10} /> Ends with Sim Task
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CERTIFICATIONS ── */}
      {activeTab === "certs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {certifications.map((cert) => {
              const ch = chapters.find((c) => c.id === cert.chapterId);
              return (
                <div
                  key={cert.id}
                  className={`rounded-xl border bg-card p-5 relative overflow-hidden transition-all ${cert.status === "locked" ? "border-border opacity-50" : cert.status === "earned" ? "border-amber-500/30 shadow-sm shadow-amber-500/10" : "border-border"}`}
                >
                  {cert.status === "earned" && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle size={18} className="text-amber-500" />
                    </div>
                  )}
                  {cert.status === "locked" && (
                    <div className="absolute top-3 right-3">
                      <Lock size={14} className="text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: `${cert.badgeColor}12` }}
                  >
                    <Award size={24} style={{ color: cert.badgeColor }} />
                  </div>
                  <h3 className="text-sm font-semibold">{cert.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {cert.description}
                  </p>
                  {cert.status === "earned" && (
                    <p className="text-[10px] text-amber-500 mt-2 font-medium">
                      Earned {cert.issueDate}
                    </p>
                  )}
                  {cert.status === "in-progress" && ch && (
                    <div className="mt-3">
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${ch.progress}%`,
                            backgroundColor: cert.badgeColor,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {ch.progress}%
                      </p>
                    </div>
                  )}
                  {cert.status === "locked" && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Complete prerequisites first
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <Award size={20} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">
                  About Paloor Certifications
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  These aren&apos;t investment advice. They&apos;re proof you
                  understand the fundamentals. Complete all lessons, pass the
                  assessment, earn a verifiable digital badge. Most importantly
                  — understand your finances before putting real money at risk.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REWARDS ── */}
      {activeTab === "rewards" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-5 mb-2">
            <div className="flex items-start gap-3">
              <Lightbulb
                size={18}
                className="text-violet-400 mt-0.5 shrink-0"
              />
              <div>
                <h3 className="text-sm font-semibold">Learn More, Get More</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Paloor never penalizes you for learning. Complete chapters to
                  unlock premium features — and once earned,{" "}
                  <strong>the reward stays with you forever</strong>. No time
                  limits, no FOMO, no pressure. Just genuine incentive to better
                  yourself.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {incentives.map((inc) => (
              <div
                key={inc.id}
                className={`rounded-xl border p-5 flex items-center gap-4 transition-all ${inc.earned ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${inc.earned ? "bg-primary/20" : "bg-muted"}`}
                >
                  {inc.earned ? (
                    <CheckCircle size={20} className="text-primary" />
                  ) : inc.type === "premium" ? (
                    <Star size={18} className="text-amber-400" />
                  ) : (
                    <Sparkles size={18} className="text-violet-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold">{inc.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inc.description}
                  </p>
                </div>
                {inc.daysUnlocked && !inc.earned && (
                  <span className="text-xs tabular-nums text-amber-400 shrink-0">
                    {inc.daysUnlocked} days free
                  </span>
                )}
                {!inc.daysUnlocked && !inc.earned && (
                  <span className="text-xs tabular-nums text-violet-400 shrink-0">
                    Permanent
                  </span>
                )}
                {inc.earned && (
                  <span className="text-xs font-medium text-primary shrink-0">
                    Earned ✓
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
