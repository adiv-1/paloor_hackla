"use client";

import Link from "next/link";
import {
  Activity,
  FolderOpen,
  BarChart3,
  User,
  TrendingUp,
  ArrowRight,
  GraduationCap,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { InfoPopover } from "@/components/InfoPopover";

void BarChart3; // reserved for future cards

const CARDS = [
  {
    href: "/dashboard/chat",
    icon: MessageSquare,
    title: "Chat",
    description:
      "Talk to Paloor AI about anything — your money, a stock, a concept, or your plan.",
    cta: "Open chat",
    info: {
      description:
        "A conversational AI tutor that knows your profile, your portfolio, and the rest of the platform. Ask anything in plain English.",
      tips: [
        "Voice or text — your call",
        "Paste a chart or document and ask about it",
        "Pulls from your assets and portfolio for grounded answers",
      ],
      sectionContext: "Chat",
    },
  },
  {
    href: "/dashboard/assets",
    icon: FolderOpen,
    title: "Assets",
    description:
      "Vehicles, property, investments — and the documents behind each one.",
    cta: "Manage assets",
    info: {
      description:
        "Organize everything you own and the documents that prove it. AI extracts key fields from anything you upload.",
      tips: [
        "Upload PDFs or images — AI reads them",
        "Each asset tracks value, docs, and history",
        "Linked accounts and personal docs live in Account",
      ],
      sectionContext: "Assets",
    },
  },
  {
    href: "/dashboard/learning",
    icon: GraduationCap,
    title: "Learning",
    description:
      "Foundations-first finance lessons — from money basics to portfolio theory.",
    cta: "Start learning",
    info: {
      description:
        "Bite-sized lessons that build on each other. Every chapter ends in a hands-on practice block in the simulator.",
      tips: [
        "Start with Foundations if you're new",
        "Each module unlocks a tool you'll actually use",
        "Listen mode reads lessons aloud",
      ],
      sectionContext: "Learning",
    },
  },
  {
    href: "/dashboard/simulator",
    icon: Activity,
    title: "Simulator",
    description:
      "Risk-free trading sandbox with synthetic markets and regime shifts.",
    cta: "Open simulator",
    info: {
      description:
        "Apply lessons in a fake market. Build intuition without risking real money.",
      tips: [
        "Fast-forward to compress months into seconds",
        "Switch regimes to feel bull, bear, and choppy markets",
        "Tied directly to learning modules",
      ],
      sectionContext: "Simulator",
    },
  },
  {
    href: "/dashboard/equities",
    icon: TrendingUp,
    title: "Equities",
    description:
      "Find S&P 500 companies that fit how you invest — by metric, sector, or AI prompt.",
    cta: "Discover stocks",
    info: {
      description:
        "Search any ticker, run a screener, or describe what you want and let AI build the filter for you.",
      tips: [
        "Try natural language: 'profitable semis with low debt'",
        "'Find stocks for me' uses your risk profile",
        "Click any ticker for fundamentals, charts, and analysis",
      ],
      sectionContext: "Equities",
    },
  },
  {
    href: "/dashboard/analysis",
    icon: Activity,
    title: "Analysis",
    description:
      "Deep multi-agent research reports with bull/bear/risk perspectives.",
    cta: "View analysis",
    info: {
      description:
        "Multi-agent AI research: a bull, bear, fundamental, technical, and risk analyst all weigh in. You get a structured verdict + per-agent reasoning.",
      tips: [
        "Trigger from any equity page",
        "Each agent's report is auditable",
        "Highlight any line to ask follow-up questions",
      ],
      sectionContext: "Analysis",
    },
  },
  {
    href: "/dashboard/account",
    icon: User,
    title: "Account",
    description:
      "Profile, preferences, identity documents, and your risk assessment.",
    cta: "Open account",
    info: {
      description:
        "Manage your profile, link bank/investment accounts, upload personal documents, and tune how the AI talks to you.",
      tips: [
        "Take the financial personality assessment for tailored AI",
        "Set your AI level in Preferences",
        "Linked accounts power portfolio analytics",
      ],
      sectionContext: "Account",
    },
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name ? user.name.split(" ")[0] : null;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Welcome to Paloor"}
          </h1>
          <InfoPopover
            title="Dashboard"
            description="Your home base. Jump into any section, or let the AI tutor walk you through how it all fits together."
            tips={[
              "Chat is always one click away — top-left",
              "Learning + Simulator are the core education loop",
              "Equities + Analysis are where you research real companies",
            ]}
            sectionContext="Dashboard"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your learning platform and onboarding hub for becoming a smarter investor.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(({ href, icon: Icon, title, description, cta, info }) => (
          <div
            key={href}
            className="group relative rounded-lg border border-border hover:bg-accent/40 hover:border-foreground/10 transition-all"
          >
            <div className="absolute top-3 right-3 z-10">
              <InfoPopover
                title={title}
                description={info.description}
                tips={info.tips}
                sectionContext={info.sectionContext}
                size="sm"
              />
            </div>
            <Link href={href} className="block p-5">
              <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                <Icon
                  size={18}
                  className="text-muted-foreground group-hover:text-primary transition-colors"
                />
              </div>
              <h2 className="font-medium text-sm mb-1">{title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3 min-h-[2.5rem]">
                {description}
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {cta}
                <ArrowRight
                  size={11}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
