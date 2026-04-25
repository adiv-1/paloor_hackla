"use client";

import Link from "next/link";
import {
  Activity,
  FolderOpen,
  BarChart3,
  User,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { InfoPopover } from "@/components/InfoPopover";

const PRIMARY_CARDS = [
  {
    href: "/dashboard/learning",
    icon: GraduationCap,
    title: "Learning",
    description: "Foundations-first finance education from money basics to portfolio theory.",
    cta: "Open learning",
    isNew: true,
    info: {
      description:
        "This is the education track you want to demo right now. It teaches finance from first principles, keeps the language simple, and connects lessons to simulator tasks.",
      tips: [
        "Start in Foundations if you want the easiest story",
        "Each chapter builds toward a practical simulator task",
        "Use this to show the educational progression in the demo",
      ],
      sectionContext: "Learning",
    },
  },
  {
    href: "/dashboard/simulator",
    icon: Activity,
    title: "Simulator",
    description: "A risk-free trade simulator with synthetic market data and regime shifts.",
    cta: "Open simulator",
    isNew: true,
    info: {
      description:
        "This is the practice layer of the product. Users apply what they learn in a fake-data market so they build intuition without risking real money.",
      tips: [
        "Use fast-forward to show time compression in the demo",
        "Show how stocks, bonds, and REITs behave differently",
        "Tie simulator actions back to the lessons users just learned",
      ],
      sectionContext: "Simulator",
    },
  },
];

const OTHER_CARDS = [
  {
    href: "/dashboard/assets",
    icon: FolderOpen,
    title: "Assets",
    description: "Manage vehicles, property, and their documents.",
    cta: "Manage assets",
    info: {
      description:
        "This is where you store and organize all your financial assets — real estate, vehicles, collectibles, and more. Upload documents like titles, deeds, or appraisals and our AI will automatically extract key details.",
      tips: [
        "Click 'Add Asset' to create a new entry",
        "Upload PDFs or images — AI reads them automatically",
        "Each asset tracks value, documents, and history",
      ],
      sectionContext: "Assets",
    },
  },
  {
    href: "/dashboard/equities",
    icon: TrendingUp,
    title: "Equities",
    description: "S&P 500 analysis, regime detection, and trends.",
    cta: "View markets",
    isNew: true,
    info: {
      description:
        "Track stock markets with AI-powered regime detection. See whether the market is in a bull, bear, or correction phase, view trend analysis, and research individual stocks.",
      tips: [
        "Search any ticker to see detailed analysis",
        "Regime detection shows market conditions",
        "Use this data to inform your portfolio decisions",
      ],
      sectionContext: "Equities",
    },
  },
  {
    href: "/dashboard/portfolio",
    icon: BarChart3,
    title: "Portfolio",
    description: "Efficient frontier analysis and optimization.",
    cta: "Analyze portfolio",
    info: {
      description:
        "Analyze your investment portfolio using modern portfolio theory. See your efficient frontier, optimal allocations, and risk-return tradeoffs. Backed by real historical data.",
      tips: [
        "The efficient frontier shows optimal risk/return combos",
        "Compare your current allocation to the optimal one",
        "Adjust time horizon and risk tolerance to explore",
      ],
      sectionContext: "Portfolio",
    },
  },
  {
    href: "/dashboard/account",
    icon: User,
    title: "Account",
    description: "Personal documents, profile, and identity items.",
    cta: "View account",
    info: {
      description:
        "Manage your personal profile, upload identity documents (W-2s, tax returns, pay stubs), link bank and investment accounts, and complete your risk assessment.",
      tips: [
        "Complete your profile for personalized AI advice",
        "Link accounts to see your full financial picture",
        "Take the risk assessment to calibrate recommendations",
      ],
      sectionContext: "Account",
    },
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [showOther, setShowOther] = useState(false);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl tracking-tight">
            {user?.name
              ? `Welcome back, ${user.name.split(" ")[0]}`
              : "Dashboard"}
          </h1>
          <InfoPopover
            title="Dashboard"
            description="Your home base for managing wealth. See your progress, jump into any section, and track your financial health — all in one place."
            tips={[
              "Complete the tasks in the tracker to set up your account",
              "Click any card below to dive into that area",
              "Your financial health score updates as you add data",
            ]}
            sectionContext="Dashboard"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          This dashboard is trimmed for the education-first demo. Learning and
          Simulator are front and center, and the rest of the platform is tucked
          away below.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-2">
            Demo Mode
          </p>
          <h2 className="font-serif text-2xl tracking-tight mb-2">
            Show the learning loop, then show the practice loop.
          </h2>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Start with the Foundations-first learning experience, then move into the
            simulator to show how Paloor turns concepts into intuition without using
            real money or real market history.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {PRIMARY_CARDS.map(
            ({ href, icon: Icon, title, description, cta, isNew, info }) => (
              <div
                key={href}
                className="group relative rounded-lg border border-border hover:bg-accent/50 hover:border-foreground/10 transition-all"
              >
                {isNew && (
                  <span className="absolute top-3 right-10 text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20 z-10">
                    Focus
                  </span>
                )}
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
                  <Icon
                    size={18}
                    className="text-muted-foreground group-hover:text-foreground mb-3 transition-colors"
                  />
                  <h2 className="font-medium mb-1">{title}</h2>
                  <p className="text-sm text-muted-foreground mb-3">
                    {description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {cta}{" "}
                    <ArrowRight
                      size={11}
                      className="group-hover:translate-x-0.5 transition-transform"
                    />
                  </span>
                </Link>
              </div>
            ),
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOther((prev) => !prev)}
            className="w-full flex items-center gap-2 px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            {showOther ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="font-medium">Other Platform Areas</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Hidden for demo focus
            </span>
          </button>

          {showOther && (
            <div className="p-4 grid md:grid-cols-2 gap-4 border-t border-border bg-background">
              {OTHER_CARDS.map(
                ({ href, icon: Icon, title, description, cta, isNew, info }) => (
                  <div
                    key={href}
                    className="group relative rounded-lg border border-border hover:bg-accent/50 hover:border-foreground/10 transition-all"
                  >
                    {isNew && (
                      <span className="absolute top-3 right-10 text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20 z-10">
                        New
                      </span>
                    )}
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
                      <Icon
                        size={18}
                        className="text-muted-foreground group-hover:text-foreground mb-3 transition-colors"
                      />
                      <h2 className="font-medium mb-1">{title}</h2>
                      <p className="text-sm text-muted-foreground mb-3">
                        {description}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {cta}{" "}
                        <ArrowRight
                          size={11}
                          className="group-hover:translate-x-0.5 transition-transform"
                        />
                      </span>
                    </Link>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
