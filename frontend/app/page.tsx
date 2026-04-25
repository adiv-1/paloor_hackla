import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ChevronRight,
  GraduationCap,
  BarChart3,
  Shield,
  Activity,
  ArrowRight,
  BookOpen,
  Target,
  Globe,
} from "lucide-react";

/* ── Audience Needs ──────────────────────────────────────────────── */

const PROFILES = [
  {
    id: "starting",
    icon: GraduationCap,
    title: "New to Finance",
    subtitle: "No background required.",
    description:
      "Start with the basics: what investing is, how risk works, and what to do first.",
    features: [
      "Short beginner lessons",
      "Plain-language explanations",
      "Real-life examples",
      "Go at your own pace",
    ],
    color: "teal",
    accent: "border-t-2 border-t-primary",
  },
  {
    id: "practice",
    icon: Activity,
    title: "Learning by Doing",
    subtitle: "Build confidence before real money.",
    description:
      "Use the simulator to try ideas, make mistakes, and learn without real-world consequences.",
    features: [
      "Risk-free simulator",
      "Learn by doing",
      "Build market intuition",
      "Experiment safely",
    ],
    color: "amber",
    accent: "border-t-2 border-t-chart-2",
  },
  {
    id: "guided",
    icon: Target,
    title: "Ready for Next Steps",
    subtitle: "Get organized and move clearly.",
    description:
      "Once you know the basics, Paloor helps connect your accounts, assets, and goals so the next step feels clearer.",
    features: [
      "Guided setup",
      "Plain-language AI help",
      "Connected finances",
      "Support for real decisions",
    ],
    color: "indigo",
    accent: "border-t-2 border-t-chart-3",
  },
];

const PILLARS = [
  {
    icon: BookOpen,
    title: "Learn",
    description:
      "Start with the basics in plain English.",
  },
  {
    icon: Activity,
    title: "Practice",
    description:
      "Try ideas in the simulator before real money is involved.",
  },
  {
    icon: BarChart3,
    title: "Organize",
    description:
      "Keep accounts, assets, and goals in one place.",
  },
  {
    icon: Target,
    title: "Get Guidance",
    description:
      "Get help with the next step instead of guessing.",
  },
];

const PRINCIPLES = [
  {
    icon: GraduationCap,
    title: "Start simple",
    description:
      "The first job is helping people understand the basics without making them feel behind.",
  },
  {
    icon: Activity,
    title: "Practice before pressure",
    description:
      "People should be able to learn before a decision becomes expensive.",
  },
  {
    icon: Globe,
    title: "Guide, don't overwhelm",
    description:
      "Most people need a clear next step, not more noise.",
  },
  {
    icon: Shield,
    title: "Build around real life",
    description:
      "Finance is savings, debt, investing, protection, and goals together.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-wide"
          >
            Paloor
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#who"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Who It&apos;s For
            </a>
            <a
              href="#how"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </a>
            <a
              href="#mission"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Our Mission
            </a>
            <a
              href="#assets"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Platform
            </a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="text-sm px-5 py-2 bg-primary text-primary-foreground border border-primary/80 shadow-sm font-medium hover:bg-primary/90 hover:shadow transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        <Reveal>
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-6">
              Finance, Explained Clearly
            </p>
            <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[1.05] mb-8">
              Start learning money
              <br />
              with confidence.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10">
              Paloor helps people who are new to finance learn the basics,
              practice safely, and get guidance before making real money
              decisions.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-3 px-7 py-3 bg-primary text-primary-foreground border border-primary/80 shadow-sm text-sm font-medium hover:bg-primary/90 hover:shadow transition-all"
              >
                Start for Free <ArrowRight size={15} />
              </Link>
              <a
                href="#who"
                className="inline-flex items-center gap-2 px-7 py-3 border border-border text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors"
              >
                See How It Works
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Customer Profiles */}
      <section id="who" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-3">
              Who it&apos;s for
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-3">
              Built for people who want help, not jargon.
            </h2>
            <p className="text-muted-foreground max-w-2xl mb-14">
              We&apos;re focused on people who feel new to finance, rusty, or
              overwhelmed. The goal is to help them move forward clearly.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {PROFILES.map((p) => (
              <Reveal key={p.id}>
                <div className={`h-full bg-card p-6 ${p.accent}`}>
                  <h3 className="font-serif text-xl mb-1">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">{p.subtitle}</p>
                  <p className="text-sm text-muted-foreground mt-4 leading-relaxed flex-1">
                    {p.description}
                  </p>
                  <ul className="mt-5 pt-5 border-t border-border space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <ChevronRight
                          size={14}
                          className="text-primary mt-0.5 shrink-0"
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — 4 Pillars */}
      <section id="how" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-3">
              How it works
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-3">
              Learn first. Then act.
            </h2>
            <p className="text-muted-foreground max-w-2xl mb-14">
              Understand the concept, try it safely, organize your finances,
              then get help with the next decision.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-4 gap-10">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title}>
                <div>
                  <span className="font-serif text-5xl text-border select-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="mt-4">
                    <h3 className="font-serif text-lg mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Overview — Asset Categories */}
      <section id="assets" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-3">
              The platform
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-3">
              Start with the parts of money people actually need help with.
            </h2>
            <p className="text-muted-foreground max-w-2xl mb-14">
              Paloor focuses on the basics people need to understand and how
              those pieces connect in real life.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-x-8 gap-y-6">
            {[
              {
                title: "Cash & Saving",
                items: "Checking, savings, emergency funds, and monthly cash flow",
              },
              {
                title: "Investing Basics",
                items: "Retirement accounts, brokerage accounts, diversification, and risk",
              },
              {
                title: "Major Assets",
                items: "Home, car, property, valuables, and net worth",
              },
              {
                title: "Protection",
                items: "Insurance, beneficiaries, and key documents",
              },
              {
                title: "Debt & Obligations",
                items: "Credit cards, student loans, mortgages, and payoff plans",
              },
              {
                title: "Goals & Planning",
                items: "Short-term priorities, long-term goals, and tradeoffs",
              },
            ].map((c) => (
              <Reveal key={c.title}>
                <div className="border-l-2 border-border pl-5 py-2 hover:border-primary transition-colors">
                  <h3 className="font-medium text-sm mb-1">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {c.items}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-3">
              Our mission
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-3">
              Make financial confidence
              <br />
              easier to build.
            </h2>
            <p className="text-muted-foreground max-w-2xl mb-14">
              Most people do not want more complexity. They want clear
              explanations, a safer place to learn, and help with what to do
              next.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-8">
            {PRINCIPLES.map((p) => (
              <Reveal key={p.title}>
                <div className="flex items-start gap-5">
                  <div className="w-10 h-10 flex items-center justify-center border border-border shrink-0">
                    <p.icon size={16} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <p className="text-sm font-medium text-primary tracking-wide uppercase mb-3">
              What you get
            </p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-14">
              Tools that make finance easier to begin.
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-x-10 gap-y-10">
            {[
              {
                title: "Lessons That Start at Zero",
                desc: "Foundational lessons on money, investing, risk, and planning in plain language.",
              },
              {
                title: "Risk-Free Simulator",
                desc: "Practice with fake money before anything becomes expensive.",
              },
              {
                title: "Plain-Language AI Help",
                desc: "Ask questions and get explanations without assumed knowledge.",
              },
              {
                title: "Guided Setup",
                desc: "Checklists and next steps help people get organized without guessing what matters first.",
              },
              {
                title: "Account & Asset Snapshot",
                desc: "See savings, investments, property, debt, and key documents together.",
              },
              {
                title: "Document Organization",
                desc: "Keep important documents together so they are easy to find.",
              },
              {
                title: "Goal-Based Progress",
                desc: "Connect what you are learning back to real financial goals.",
              },
              {
                title: "Real-Life Financial Coverage",
                desc: "Savings, debt, insurance, investing, and planning belong in one place.",
              },
              {
                title: "Room to Grow",
                desc: "Go deeper over time without making advanced tools the starting point.",
              },
            ].map((f) => (
              <Reveal key={f.title}>
                <div>
                  <h3 className="font-medium mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <Reveal>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-4">
              Start learning with confidence.
            </h2>
            <p className="text-muted-foreground mb-10 max-w-lg mx-auto">
              Learn the basics, practice safely, and get help making sense of
              your finances. No credit card required.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground border border-primary/80 shadow-sm text-sm font-medium hover:bg-primary/90 hover:shadow transition-all"
              >
                Create Free Account <ChevronRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="font-serif text-lg font-semibold tracking-wide">
            Paloor
          </span>
          <div className="flex items-center gap-8">
            <a
              href="#who"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Who It&apos;s For
            </a>
            <a
              href="#how"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </a>
            <a
              href="#mission"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mission
            </a>
            <a
              href="#assets"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Platform
            </a>
          </div>
          <span className="text-sm text-muted-foreground">
            2026 Paloor. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
