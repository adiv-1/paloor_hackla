"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  Upload,
  Check,
  Loader2,
  Download,
  AlertTriangle,
  X,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Eye,
  Camera,
  User,
  Mail,
  Briefcase,
  MapPin,
  Target,
  Shield,
  Heart,
  DollarSign,
  Home,
  Zap,
  Brain,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Globe,
  GraduationCap,
  TrendingUp,
  Landmark,
  Users,
  Wallet,
  Link2,
  Plus,
  Building,
  CreditCard,
  RefreshCw,
  Search,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Types ─────────────────────────────────────────────────────────── */

interface AccountDoc {
  key: string;
  label: string;
  description: string;
  status: string;
  document_id: string | null;
  filename: string | null;
  uploaded_at: string | null;
  extracted_fields: { key: string; value: string; label?: string }[] | null;
}

/* ── Assessment Questions ─────────────────────────────────────────── */

interface AssessmentQuestion {
  id: string;
  category: string;
  question: string;
  description: string;
  options: { value: string; label: string; description: string }[];
}

const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "loss_reaction",
    category: "Risk Personality",
    question: "Your portfolio drops 20% in one month. What do you do?",
    description:
      "This reveals your emotional reaction to loss — not what you think you should do, but what you'd actually do.",
    options: [
      {
        value: "sell_all",
        label: "Sell everything",
        description: "I can't sleep with that kind of loss",
      },
      {
        value: "sell_some",
        label: "Sell some to reduce risk",
        description: "I'd trim positions to feel safer",
      },
      {
        value: "hold",
        label: "Hold and wait",
        description: "Markets recover — I'll ride it out",
      },
      {
        value: "buy_more",
        label: "Buy more",
        description: "Stocks are on sale — time to average down",
      },
    ],
  },
  {
    id: "time_horizon",
    category: "Planning Timeline",
    question: "When will you need this money?",
    description:
      "Your time horizon fundamentally changes what risks make sense.",
    options: [
      {
        value: "1_year",
        label: "Within 1 year",
        description: "I might need it soon",
      },
      {
        value: "1_5_years",
        label: "1–5 years",
        description: "Medium-term goals",
      },
      {
        value: "5_10_years",
        label: "5–10 years",
        description: "Longer-term but not retirement",
      },
      {
        value: "10_plus",
        label: "10+ years",
        description: "Retirement or generational wealth",
      },
    ],
  },
  {
    id: "knowledge_level",
    category: "Financial Literacy",
    question: "How would you describe your financial knowledge?",
    description:
      "Be honest — this helps us calibrate the experience to your actual level.",
    options: [
      {
        value: "beginner",
        label: "Just starting",
        description: "I don't know what a stock really is",
      },
      {
        value: "basic",
        label: "Know the basics",
        description: "I know stocks, bonds, savings — but not deeply",
      },
      {
        value: "intermediate",
        label: "Fairly knowledgeable",
        description:
          "I understand asset allocation, diversification, tax strategies",
      },
      {
        value: "advanced",
        label: "Very knowledgeable",
        description: "I can read financial statements and build models",
      },
    ],
  },
  {
    id: "income_stability",
    category: "Life Context",
    question: "How stable is your income?",
    description:
      "Income stability affects how much risk you can realistically take.",
    options: [
      {
        value: "very_stable",
        label: "Very stable",
        description: "Government, tenured, or large corp with low layoff risk",
      },
      {
        value: "stable",
        label: "Reasonably stable",
        description: "Steady employment but not guaranteed",
      },
      {
        value: "variable",
        label: "Variable",
        description: "Freelance, commission, or seasonal income",
      },
      {
        value: "uncertain",
        label: "Uncertain",
        description: "Between jobs, early startup, or unpredictable",
      },
    ],
  },
  {
    id: "primary_goal",
    category: "Goals",
    question: "What's your #1 financial priority right now?",
    description: "This shapes every recommendation the AI gives you.",
    options: [
      {
        value: "emergency_fund",
        label: "Build an emergency fund",
        description: "I need a safety net first",
      },
      {
        value: "debt_payoff",
        label: "Pay off debt",
        description: "Student loans, credit cards, or other debt",
      },
      {
        value: "grow_wealth",
        label: "Grow my wealth",
        description: "I want my money to work for me",
      },
      {
        value: "preserve_wealth",
        label: "Protect what I have",
        description: "I have wealth and want to keep it safe",
      },
      {
        value: "retirement",
        label: "Plan for retirement",
        description: "Building toward financial independence",
      },
      {
        value: "major_purchase",
        label: "Save for a major purchase",
        description: "House, car, education, wedding",
      },
    ],
  },
  {
    id: "decision_style",
    category: "Personality",
    question: "How do you prefer to make big decisions?",
    description:
      "This helps us understand if you want detailed analysis or clear recommendations.",
    options: [
      {
        value: "research",
        label: "Deep research",
        description: "I want all the data before deciding",
      },
      {
        value: "gut",
        label: "Trust my instinct",
        description: "I go with what feels right",
      },
      {
        value: "advice",
        label: "Ask experts",
        description: "I want someone knowledgeable to guide me",
      },
      {
        value: "delegate",
        label: "Delegate it",
        description: "Just tell me what to do",
      },
    ],
  },
  {
    id: "volatility_comfort",
    category: "Risk Personality",
    question: "Which portfolio would you choose?",
    description:
      "Real risk tolerance shows up in the tradeoffs you're willing to accept.",
    options: [
      {
        value: "low",
        label: "Avg +4%/yr, worst year -5%",
        description: "Stable but slow growth",
      },
      {
        value: "moderate",
        label: "Avg +7%/yr, worst year -15%",
        description: "Balanced growth and risk",
      },
      {
        value: "high",
        label: "Avg +10%/yr, worst year -30%",
        description: "Higher growth, bigger swings",
      },
      {
        value: "aggressive",
        label: "Avg +14%/yr, worst year -45%",
        description: "Maximum growth, stomach-churning drops",
      },
    ],
  },
  {
    id: "planning_areas",
    category: "Goals",
    question: "Which areas do you want Paloor to help with?",
    description:
      "Select all that apply — this determines which features and AI modules activate for you.",
    options: [
      {
        value: "investing",
        label: "Investing & Portfolio",
        description: "Growing wealth through markets",
      },
      {
        value: "budgeting",
        label: "Budgeting & Spending",
        description: "Understanding where money goes",
      },
      {
        value: "tax",
        label: "Tax Optimization",
        description: "Keeping more of what I earn",
      },
      {
        value: "estate",
        label: "Estate & Legacy",
        description: "Planning for the long term",
      },
      {
        value: "insurance",
        label: "Insurance & Protection",
        description: "Covering downside risks",
      },
      {
        value: "retirement",
        label: "Retirement Planning",
        description: "Financial independence timeline",
      },
    ],
  },
  {
    id: "ai_preference",
    category: "Personality",
    question: "How should the AI communicate with you?",
    description: "This sets the tone for all AI insights and recommendations.",
    options: [
      {
        value: "simple",
        label: "Keep it simple",
        description: "Plain language, clear actions, no jargon",
      },
      {
        value: "balanced",
        label: "Explain the reasoning",
        description: "Give me the why, but keep it accessible",
      },
      {
        value: "detailed",
        label: "Full technical detail",
        description: "Show me the math, the models, the edge cases",
      },
      {
        value: "minimal",
        label: "Just the bottom line",
        description: "One sentence. What should I do.",
      },
    ],
  },
  {
    id: "money_relationship",
    category: "Personality",
    question: "What best describes your relationship with money?",
    description:
      "There's no right answer. This helps us understand your psychological baseline.",
    options: [
      {
        value: "anxious",
        label: "It stresses me out",
        description: "I avoid thinking about finances",
      },
      {
        value: "careful",
        label: "I'm careful with it",
        description: "I track everything and worry about spending",
      },
      {
        value: "neutral",
        label: "It's just a tool",
        description: "I don't think about it emotionally",
      },
      {
        value: "excited",
        label: "I enjoy managing it",
        description: "I actively enjoy financial planning and markets",
      },
    ],
  },
];

/* ── Component ─────────────────────────────────────────────────────── */

export default function AccountPage() {
  const { user, token, refreshUser } = useAuth();
  const [docs, setDocs] = useState<AccountDoc[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{
    docId: string;
    key: string;
    value: string;
  } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    age: "",
    gender: "",
    state: "",
    occupation: "",
    annual_income: "",
    net_worth_estimate: "",
    risk_tolerance: "",
    dependents: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef<string | null>(null);

  // Assessment state
  const [showAssessment, setShowAssessment] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [assessmentComplete, setAssessmentComplete] = useState(false);

  // Linked accounts state
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [accountTypes, setAccountTypes] = useState<Record<string, any>>({});
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkStep, setLinkStep] = useState<"institution" | "type" | "details">(
    "institution",
  );
  const [selectedInstitution, setSelectedInstitution] = useState<any>(null);
  const [selectedType, setSelectedType] = useState("");
  const [linkForm, setLinkForm] = useState({ name: "", mask: "", balance: "" });
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [institutionSearch, setInstitutionSearch] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "profile" | "documents" | "preferences" | "assessment" | "accounts"
  >("profile");

  const loadDocs = async () => {
    const res = await fetch(`${API}/api/account/documents`);
    const data = await res.json();
    setDocs(data);
  };

  useEffect(() => {
    loadDocs();
    loadLinkedAccounts();
    loadInstitutions();
  }, []);

  const startUpload = (key: string) => {
    pendingKey.current = key;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = pendingKey.current;
    if (!file || !key) return;
    e.target.value = "";
    setUploadingKey(key);
    setUploadWarning(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/account/documents/${key}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.warning) setUploadWarning(data.warning);
      }
      await loadDocs();
      setExpandedKey(key);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingKey(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = "";
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/auth/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) await refreshUser();
    } catch (err) {
      console.error(err);
    }
    setUploadingPhoto(false);
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await fetch(`${API}/api/documents/${docId}`, { method: "DELETE" });
      await loadDocs();
      setExpandedKey(null);
      setPreviewDoc(null);
    } catch (err) {
      console.error(err);
    }
  };

  const saveField = async () => {
    if (!editingField) return;
    try {
      await fetch(
        `${API}/api/documents/${editingField.docId}/fields/${editingField.key}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: editingField.value }),
        },
      );
      await loadDocs();
    } catch (err) {
      console.error(err);
    }
    setEditingField(null);
  };

  const startEditProfile = () => {
    setProfileForm({
      age: user?.age?.toString() || "",
      gender: user?.gender || "",
      state: user?.state || "",
      occupation: user?.occupation || "",
      annual_income: user?.annual_income || "",
      net_worth_estimate: user?.net_worth_estimate || "",
      risk_tolerance: user?.risk_tolerance || "",
      dependents: user?.dependents?.toString() || "",
    });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!token) return;
    setSavingProfile(true);
    try {
      const body: Record<string, unknown> = {
        age: profileForm.age ? parseInt(profileForm.age) : null,
        gender: profileForm.gender || null,
        state: profileForm.state || null,
        occupation: profileForm.occupation || null,
        annual_income: profileForm.annual_income || null,
        net_worth_estimate: profileForm.net_worth_estimate || null,
        risk_tolerance: profileForm.risk_tolerance || null,
        dependents: profileForm.dependents
          ? parseInt(profileForm.dependents)
          : null,
      };
      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await refreshUser();
        setEditingProfile(false);
      }
    } catch (err) {
      console.error(err);
    }
    setSavingProfile(false);
  };

  // Assessment handlers
  const selectAnswer = (questionId: string, value: string) => {
    const q = ASSESSMENT_QUESTIONS.find((q) => q.id === questionId);
    if (q?.id === "planning_areas") {
      const current = (answers[questionId] as string[]) || [];
      if (current.includes(value)) {
        setAnswers({
          ...answers,
          [questionId]: current.filter((v) => v !== value),
        });
      } else {
        setAnswers({ ...answers, [questionId]: [...current, value] });
      }
    } else {
      setAnswers({ ...answers, [questionId]: value });
    }
  };

  const nextQuestion = () => {
    if (currentQuestion < ASSESSMENT_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setAssessmentComplete(true);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1);
  };

  const resetAssessment = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setAssessmentComplete(false);
    setShowAssessment(false);
  };

  // Linked accounts functions
  const loadLinkedAccounts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setLinkedAccounts(await res.json());
    } catch {}
  };

  const loadInstitutions = async () => {
    try {
      const [instRes, typesRes] = await Promise.all([
        fetch(`${API}/api/accounts/institutions`),
        fetch(`${API}/api/accounts/types`),
      ]);
      if (instRes.ok) setInstitutions(await instRes.json());
      if (typesRes.ok) setAccountTypes(await typesRes.json());
    } catch {}
  };

  const startLinkAccount = () => {
    setShowLinkModal(true);
    setLinkStep("institution");
    setSelectedInstitution(null);
    setSelectedType("");
    setLinkForm({ name: "", mask: "", balance: "" });
    setInstitutionSearch("");
  };

  const submitLinkAccount = async () => {
    if (!token || !selectedInstitution || !selectedType) return;
    setLinkingAccount(true);
    try {
      const res = await fetch(`${API}/api/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          institution: selectedInstitution.name,
          account_type: selectedType,
          account_name:
            linkForm.name ||
            `${selectedInstitution.name} ${accountTypes[selectedType]?.label || selectedType}`,
          mask: linkForm.mask,
          balance: parseFloat(linkForm.balance) || 0,
        }),
      });
      if (res.ok) {
        await loadLinkedAccounts();
        setShowLinkModal(false);
      }
    } catch {}
    setLinkingAccount(false);
  };

  const unlinkAccount = async (accountId: string) => {
    if (!token || !confirm("Remove this linked account?")) return;
    try {
      await fetch(`${API}/api/accounts/${accountId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadLinkedAccounts();
    } catch {}
  };

  const photoUrl = user?.photo_url
    ? `${API}${user.photo_url}?t=${Date.now()}`
    : null;

  const profileFields = [
    { icon: User, label: "Age", value: user?.age },
    { icon: User, label: "Gender", value: user?.gender },
    { icon: MapPin, label: "State", value: user?.state },
    { icon: Briefcase, label: "Occupation", value: user?.occupation },
    { icon: DollarSign, label: "Annual Income", value: user?.annual_income },
    { icon: Shield, label: "Net Worth Est.", value: user?.net_worth_estimate },
    { icon: Target, label: "Risk Tolerance", value: user?.risk_tolerance },
    { icon: Users, label: "Dependents", value: user?.dependents },
  ];

  const goals = user?.financial_goals || [];
  const answeredCount = Object.keys(answers).length;
  const isMultiSelect =
    ASSESSMENT_QUESTIONS[currentQuestion]?.id === "planning_areas";

  // Derive profile from assessment answers
  const getAssessmentProfile = () => {
    const risk = answers.volatility_comfort as string;
    const reaction = answers.loss_reaction as string;
    const goal = answers.primary_goal as string;
    const knowledge = answers.knowledge_level as string;
    const money = answers.money_relationship as string;

    let riskScore = 0;
    if (risk === "aggressive") riskScore += 4;
    else if (risk === "high") riskScore += 3;
    else if (risk === "moderate") riskScore += 2;
    else riskScore += 1;

    if (reaction === "buy_more") riskScore += 3;
    else if (reaction === "hold") riskScore += 2;
    else if (reaction === "sell_some") riskScore += 1;

    const riskLabel =
      riskScore >= 6
        ? "Aggressive"
        : riskScore >= 4
          ? "Moderate-Aggressive"
          : riskScore >= 3
            ? "Moderate"
            : "Conservative";

    return { riskLabel, goal, knowledge, money };
  };

  const TABS = [
    { key: "profile", label: "Profile", icon: User },
    { key: "accounts", label: "Linked Accounts", icon: Link2 },
    { key: "documents", label: "Documents", icon: Upload },
    { key: "preferences", label: "Preferences", icon: Zap },
    { key: "assessment", label: "Risk Assessment", icon: Brain },
  ] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your profile, preferences, personal documents, and risk assessment.
        </p>
      </div>

      {uploadWarning && (
        <div className="flex items-start gap-3 px-4 py-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span className="flex-1">{uploadWarning}</span>
          <button
            onClick={() => setUploadWarning(null)}
            className="shrink-0 text-amber-600 hover:text-amber-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.key === "assessment" &&
              answeredCount > 0 &&
              !assessmentComplete && (
                <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full tabular-nums">
                  {answeredCount}/{ASSESSMENT_QUESTIONS.length}
                </span>
              )}
            {tab.key === "assessment" && assessmentComplete && (
              <CheckCircle2 size={12} className="text-primary" />
            )}
          </button>
        ))}
      </div>

      {/* ── Linked Accounts Tab ─────────────────────────────────── */}
      {activeTab === "accounts" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {linkedAccounts.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                const byType: Record<string, { count: number; total: number }> =
                  {};
                let grandTotal = 0;
                linkedAccounts.forEach((acc: any) => {
                  if (!byType[acc.account_type])
                    byType[acc.account_type] = { count: 0, total: 0 };
                  byType[acc.account_type].count++;
                  byType[acc.account_type].total += acc.balance || 0;
                  grandTotal += acc.balance || 0;
                });
                return (
                  <>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Total Balance
                      </p>
                      <p className="text-xl font-bold mt-1">
                        $
                        {grandTotal.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {linkedAccounts.length} account
                        {linkedAccounts.length !== 1 ? "s" : ""} linked
                      </p>
                    </div>
                    {Object.entries(byType)
                      .slice(0, 3)
                      .map(([type, data]) => (
                        <div
                          key={type}
                          className="rounded-xl border border-border bg-card p-4"
                        >
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            {accountTypes[type]?.label || type}
                          </p>
                          <p className="text-lg font-bold mt-1">
                            $
                            {data.total.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {data.count} account{data.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      ))}
                  </>
                );
              })()}
            </div>
          )}

          {/* Account List */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold">Linked Accounts</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Connect your bank, brokerage, and retirement accounts to get a
                  complete financial picture.
                </p>
              </div>
              <button
                onClick={startLinkAccount}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} />
                Link Account
              </button>
            </div>

            {linkedAccounts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Link2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">
                  No accounts linked yet
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Link your bank accounts, 401(k), Roth IRA, brokerage, and
                  other financial accounts to see everything in one place.
                </p>
                <button
                  onClick={startLinkAccount}
                  className="text-xs text-primary hover:text-primary font-medium"
                >
                  Link your first account →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {linkedAccounts.map((acc: any) => {
                  const typeInfo = accountTypes[acc.account_type] || {};
                  return (
                    <div
                      key={acc.id}
                      className="px-5 py-3.5 flex items-center gap-4 hover:bg-accent/30 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-lg shrink-0">
                        {typeInfo.icon || "🏦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {acc.account_name}
                          </p>
                          {acc.mask && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              ••{acc.mask}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            {acc.institution}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            •
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            {typeInfo.label || acc.account_type}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          $
                          {(acc.balance || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          Synced{" "}
                          {new Date(
                            acc.last_synced * 1000,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => unlinkAccount(acc.id)}
                        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Remove account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info callout */}
          <div className="rounded-xl border border-primary bg-primary/50 p-4 flex items-start gap-3">
            <Shield size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-primary">
                Bank-level security
              </p>
              <p className="text-[11px] text-primary mt-0.5">
                Your account credentials are never stored on our servers. We use
                read-only access to pull balances and transactions. You can
                unlink any account at any time.
              </p>
            </div>
          </div>

          {/* Link Account Modal */}
          {showLinkModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-background border border-border rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {linkStep === "institution" && "Choose your institution"}
                      {linkStep === "type" &&
                        `${selectedInstitution?.name} — Account Type`}
                      {linkStep === "details" && "Account Details"}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {linkStep === "institution" &&
                        "Search for your bank or investment provider"}
                      {linkStep === "type" &&
                        "What type of account do you want to link?"}
                      {linkStep === "details" && "Enter your account details"}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowLinkModal(false)}
                    className="p-1 rounded hover:bg-accent"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {linkStep === "institution" && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <input
                          type="text"
                          placeholder="Search institutions..."
                          value={institutionSearch}
                          onChange={(e) => setInstitutionSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {institutions
                          .filter((inst: any) =>
                            inst.name
                              .toLowerCase()
                              .includes(institutionSearch.toLowerCase()),
                          )
                          .map((inst: any) => (
                            <button
                              key={inst.id}
                              onClick={() => {
                                setSelectedInstitution(inst);
                                setLinkStep("type");
                              }}
                              className="text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary hover:bg-primary/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{inst.logo}</span>
                                <p className="text-xs font-medium truncate">
                                  {inst.name}
                                </p>
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {linkStep === "type" && selectedInstitution && (
                    <div className="space-y-2">
                      {selectedInstitution.types.map((type: string) => {
                        const typeInfo = accountTypes[type] || {};
                        return (
                          <button
                            key={type}
                            onClick={() => {
                              setSelectedType(type);
                              setLinkForm({
                                name: `${selectedInstitution.name} ${typeInfo.label || type}`,
                                mask: "",
                                balance: "",
                              });
                              setLinkStep("details");
                            }}
                            className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-primary hover:bg-primary/50 transition-colors flex items-center gap-3"
                          >
                            <span className="text-lg">
                              {typeInfo.icon || "🏦"}
                            </span>
                            <div>
                              <p className="text-sm font-medium">
                                {typeInfo.label || type}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {type.replace(/_/g, " ")}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setLinkStep("institution")}
                        className="text-xs text-muted-foreground hover:text-foreground mt-2"
                      >
                        ← Back to institutions
                      </button>
                    </div>
                  )}

                  {linkStep === "details" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border border-border">
                        <span className="text-lg">
                          {selectedInstitution?.logo}
                        </span>
                        <div>
                          <p className="text-sm font-medium">
                            {selectedInstitution?.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {accountTypes[selectedType]?.label || selectedType}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          Account Name
                        </label>
                        <input
                          type="text"
                          value={linkForm.name}
                          onChange={(e) =>
                            setLinkForm({ ...linkForm, name: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Last 4 digits (optional)
                          </label>
                          <input
                            type="text"
                            maxLength={4}
                            value={linkForm.mask}
                            onChange={(e) =>
                              setLinkForm({
                                ...linkForm,
                                mask: e.target.value.replace(/\D/g, ""),
                              })
                            }
                            placeholder="1234"
                            className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Current Balance
                          </label>
                          <input
                            type="number"
                            value={linkForm.balance}
                            onChange={(e) =>
                              setLinkForm({
                                ...linkForm,
                                balance: e.target.value,
                              })
                            }
                            placeholder="0.00"
                            className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setLinkStep("type")}
                          className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={submitLinkAccount}
                          disabled={linkingAccount}
                          className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {linkingAccount ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Link2 size={14} />
                          )}
                          Link Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Profile Tab ──────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold">Profile Information</span>
            {!editingProfile ? (
              <button
                onClick={startEditProfile}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil size={11} /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingProfile(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-white hover:bg-primary disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : null}
                  Save
                </button>
              </div>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-start gap-5">
              <div className="relative group shrink-0">
                <div className="w-20 h-20 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">{user?.name || "—"}</h2>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Mail className="h-3.5 w-3.5" />
                  {user?.email}
                </div>

                {editingProfile ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    {[
                      { key: "age", label: "Age", type: "number" },
                      {
                        key: "gender",
                        label: "Gender",
                        type: "select",
                        options: [
                          "Male",
                          "Female",
                          "Non-binary",
                          "Prefer not to say",
                        ],
                      },
                      { key: "state", label: "State", type: "text" },
                      { key: "occupation", label: "Occupation", type: "text" },
                      {
                        key: "annual_income",
                        label: "Annual Income",
                        type: "select",
                        options: [
                          "Under $50k",
                          "$50k – $100k",
                          "$100k – $250k",
                          "$250k – $500k",
                          "$500k – $1M",
                          "Over $1M",
                        ],
                      },
                      {
                        key: "net_worth_estimate",
                        label: "Net Worth Est.",
                        type: "select",
                        options: [
                          "Under $100k",
                          "$100k – $250k",
                          "$250k – $500k",
                          "$500k – $1M",
                          "$1M – $5M",
                          "Over $5M",
                        ],
                      },
                      {
                        key: "risk_tolerance",
                        label: "Risk Tolerance",
                        type: "select",
                        options: ["Conservative", "Moderate", "Aggressive"],
                      },
                      {
                        key: "dependents",
                        label: "Dependents",
                        type: "number",
                      },
                    ].map((field) => (
                      <div key={field.key}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                          {field.label}
                        </p>
                        {field.type === "select" ? (
                          <select
                            value={
                              profileForm[field.key as keyof typeof profileForm]
                            }
                            onChange={(e) =>
                              setProfileForm({
                                ...profileForm,
                                [field.key]: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 text-xs border border-border rounded bg-background"
                          >
                            <option value="">—</option>
                            {field.options!.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={
                              profileForm[field.key as keyof typeof profileForm]
                            }
                            onChange={(e) =>
                              setProfileForm({
                                ...profileForm,
                                [field.key]: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 text-xs border border-border rounded bg-background"
                            placeholder="—"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    {profileFields.map((f) => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {f.label}
                        </p>
                        <p className="text-sm font-medium mt-0.5">
                          {f.value ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {goals.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                      Financial Goals
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {goals.map((g: string) => (
                        <span
                          key={g}
                          className="px-2 py-0.5 text-xs rounded-full border border-primary/30 bg-primary/10 text-primary"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Documents Tab ────────────────────────────────────────── */}
      {activeTab === "documents" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <span className="text-sm font-semibold">Personal Documents</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Documents uploaded here are automatically linked to asset
              checklists.
            </p>
          </div>
          {docs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading documents...
            </div>
          ) : (
            docs.map((doc) => (
              <div key={doc.key} className="border-t border-border">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {doc.status === "uploaded" ? (
                      <Check size={14} className="text-primary shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{doc.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {doc.description}
                      </p>
                      {doc.filename && (
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {doc.filename}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {doc.status === "missing" ? (
                      <button
                        onClick={() => startUpload(doc.key)}
                        disabled={uploadingKey === doc.key}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 disabled:opacity-50"
                      >
                        {uploadingKey === doc.key ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />{" "}
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload size={12} /> Upload
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            setExpandedKey(
                              expandedKey === doc.key ? null : doc.key,
                            )
                          }
                          className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                          title="View fields"
                        >
                          {expandedKey === doc.key ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            setPreviewDoc(
                              previewDoc === doc.document_id
                                ? null
                                : doc.document_id,
                            )
                          }
                          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50"
                          title="Preview"
                        >
                          <Eye size={12} />
                        </button>
                        <a
                          href={`${API}/api/documents/${doc.document_id}/download`}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50"
                        >
                          <Download size={12} /> Download
                        </a>
                        <button
                          onClick={() =>
                            doc.document_id && deleteDoc(doc.document_id)
                          }
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {previewDoc === doc.document_id && doc.document_id && (
                  <div className="px-4 pb-3">
                    <div className="ml-7 rounded-md border border-border overflow-hidden bg-muted/30">
                      <img
                        src={`${API}/api/documents/${doc.document_id}/preview`}
                        alt={doc.label}
                        className="max-w-full max-h-64 object-contain mx-auto"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const parent = el.parentElement;
                          if (parent) {
                            const div = document.createElement("div");
                            div.className =
                              "p-4 text-xs text-muted-foreground text-center";
                            div.textContent =
                              "Preview not available. Use Download instead.";
                            parent.appendChild(div);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
                {expandedKey === doc.key && doc.extracted_fields && (
                  <div className="px-4 pb-3">
                    <div className="ml-7 p-3 rounded-md bg-muted/50 space-y-2">
                      <p className="text-[11px] tabular-nums text-muted-foreground uppercase tracking-wider mb-2">
                        Extracted Fields{" "}
                        <span className="text-muted-foreground/50">
                          — click any value to edit
                        </span>
                      </p>
                      {doc.extracted_fields.map((f) => {
                        const isEditing =
                          editingField &&
                          editingField.docId === doc.document_id &&
                          editingField.key === f.key;
                        const fieldLabel =
                          f.label ||
                          f.key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase());
                        return (
                          <div
                            key={f.key}
                            className="flex items-center justify-between text-sm gap-2"
                          >
                            <span className="text-muted-foreground shrink-0 text-xs min-w-[130px]">
                              {fieldLabel}
                            </span>
                            {isEditing ? (
                              <div className="flex items-center gap-1 flex-1">
                                <input
                                  autoFocus
                                  value={editingField.value}
                                  onChange={(e) =>
                                    setEditingField({
                                      ...editingField,
                                      value: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveField();
                                    if (e.key === "Escape")
                                      setEditingField(null);
                                  }}
                                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background"
                                />
                                <button
                                  onClick={saveField}
                                  className="text-primary hover:text-primary text-xs font-medium px-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingField(null)}
                                  className="text-muted-foreground hover:text-foreground text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                className="group flex items-center gap-1 cursor-pointer hover:text-foreground text-xs flex-1"
                                onClick={() =>
                                  doc.document_id &&
                                  setEditingField({
                                    docId: doc.document_id,
                                    key: f.key,
                                    value: f.value,
                                  })
                                }
                              >
                                {f.value || (
                                  <span className="text-muted-foreground/50 italic">
                                    Click to add
                                  </span>
                                )}
                                <Pencil
                                  size={10}
                                  className="opacity-0 group-hover:opacity-50"
                                />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Preferences Tab ──────────────────────────────────────── */}
      {activeTab === "preferences" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Notification Preferences</h3>
            <div className="space-y-3">
              {[
                {
                  key: "email_weekly",
                  label: "Weekly Portfolio Summary",
                  description:
                    "Email digest every Monday with net worth, P&L, and AI insights",
                },
                {
                  key: "email_alerts",
                  label: "Alert Notifications",
                  description:
                    "Email when significant portfolio events occur (large drops, rebalance triggers)",
                },
                {
                  key: "learning_reminders",
                  label: "Learning Reminders",
                  description: "Gentle nudges to continue your learning path",
                },
                {
                  key: "market_regime",
                  label: "Market Regime Changes",
                  description:
                    "Notification when Markov model detects a regime shift",
                },
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                  <button className="w-10 h-5 rounded-full bg-muted border border-border relative transition-colors hover:border-foreground/20">
                    <div className="w-4 h-4 rounded-full bg-muted-foreground/30 absolute left-0.5 top-0.5 transition-all" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Display Preferences</h3>
            <div className="space-y-3">
              {[
                {
                  key: "currency",
                  label: "Currency",
                  description: "Display currency for all values",
                  options: ["USD ($)", "EUR (€)", "GBP (£)", "INR (₹)"],
                },
                {
                  key: "date_format",
                  label: "Date Format",
                  description: "How dates appear across the platform",
                  options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"],
                },
                {
                  key: "number_format",
                  label: "Number Format",
                  description: "Thousand/decimal separators",
                  options: ["1,000.00", "1.000,00", "1 000.00"],
                },
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                  <select className="text-xs px-2 py-1 border border-border rounded bg-background">
                    {pref.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">AI Preferences</h3>
            <div className="space-y-3">
              {[
                {
                  key: "ai_tone",
                  label: "AI Communication Style",
                  description: "How the AI explains things to you",
                  options: [
                    "Simple & clear",
                    "Balanced with reasoning",
                    "Full technical detail",
                    "Just the bottom line",
                  ],
                },
                {
                  key: "ai_proactive",
                  label: "Proactive Suggestions",
                  description:
                    "AI initiates recommendations vs. only responds when asked",
                  options: [
                    "Always suggest",
                    "Weekly digest only",
                    "Only when asked",
                  ],
                },
                {
                  key: "ai_risk_warnings",
                  label: "Risk Warning Level",
                  description: "How aggressively the AI flags potential risks",
                  options: [
                    "Conservative (flag everything)",
                    "Balanced",
                    "Minimal (major risks only)",
                  ],
                },
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                  <select className="text-xs px-2 py-1 border border-border rounded bg-background">
                    {pref.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Privacy & Data</h3>
            <div className="space-y-3">
              {[
                {
                  key: "data_sharing",
                  label: "Anonymized Data Sharing",
                  description:
                    "Contribute to aggregate insights (never individual data)",
                },
                {
                  key: "ai_training",
                  label: "AI Model Training",
                  description:
                    "Allow your interactions to improve Paloor's AI (anonymized)",
                },
                {
                  key: "third_party",
                  label: "Third-Party Integrations",
                  description:
                    "Allow connections to external financial services",
                },
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                  <button className="w-10 h-5 rounded-full bg-muted border border-border relative transition-colors hover:border-foreground/20">
                    <div className="w-4 h-4 rounded-full bg-muted-foreground/30 absolute left-0.5 top-0.5 transition-all" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Assessment Tab ────────────────────────────────────────── */}
      {activeTab === "assessment" && (
        <div>
          {!showAssessment && !assessmentComplete ? (
            /* Start screen */
            <div className="rounded-xl border border-border bg-card p-8 text-center max-w-2xl mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <Brain size={24} className="text-violet-500" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                Financial Personality Assessment
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-6">
                This isn&apos;t a finance quiz — it&apos;s a personality test
                designed to understand how you think about money, risk, and
                decisions. Your answers shape how Paloor&apos;s AI communicates
                with you and what recommendations it makes.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground mb-6">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} /> ~5 minutes
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain size={12} /> {ASSESSMENT_QUESTIONS.length} questions
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield size={12} /> No wrong answers
                </div>
              </div>
              <button
                onClick={() => setShowAssessment(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-colors"
              >
                Start Assessment <ArrowRight size={16} />
              </button>
              {answeredCount > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  You have a previous session — {answeredCount}/
                  {ASSESSMENT_QUESTIONS.length} answered
                </p>
              )}
            </div>
          ) : assessmentComplete ? (
            /* Results screen */
            <div className="rounded-xl border border-border bg-card p-8 max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <CheckCircle2
                  size={32}
                  className="text-primary mx-auto mb-3"
                />
                <h2 className="text-xl font-bold">Assessment Complete</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Here&apos;s what we learned about your financial personality.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Risk Profile
                  </p>
                  <p className="text-lg font-bold">
                    {getAssessmentProfile().riskLabel}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Primary Goal
                  </p>
                  <p className="text-lg font-bold capitalize">
                    {(getAssessmentProfile().goal || "—").replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Financial Knowledge
                  </p>
                  <p className="text-lg font-bold capitalize">
                    {getAssessmentProfile().knowledge || "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Money Relationship
                  </p>
                  <p className="text-lg font-bold capitalize">
                    {(getAssessmentProfile().money || "—").replace(/_/g, " ")}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4 mb-6">
                <div className="flex items-start gap-2">
                  <Zap size={14} className="text-violet-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-violet-300 leading-relaxed">
                    <strong>What this means for your AI:</strong> Based on your
                    assessment, Paloor will adapt its communication style, risk
                    warnings, and investment suggestions to match your
                    personality. Your assessment can be retaken anytime — people
                    change.
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={resetAssessment}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg border border-border"
                >
                  Retake Assessment
                </button>
              </div>
            </div>
          ) : (
            /* Question flow */
            <div className="max-w-2xl mx-auto">
              {/* Progress */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-300"
                    style={{
                      width: `${((currentQuestion + 1) / ASSESSMENT_QUESTIONS.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {currentQuestion + 1} / {ASSESSMENT_QUESTIONS.length}
                </span>
              </div>

              {/* Question */}
              {(() => {
                const q = ASSESSMENT_QUESTIONS[currentQuestion];
                const currentAnswer = answers[q.id];
                const hasAnswer = isMultiSelect
                  ? ((currentAnswer as string[]) || []).length > 0
                  : !!currentAnswer;
                return (
                  <div className="rounded-xl border border-border bg-card p-6">
                    <p className="text-[10px] tabular-nums uppercase tracking-wider text-violet-400 mb-2">
                      {q.category}
                    </p>
                    <h3 className="text-lg font-bold mb-1">{q.question}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {q.description}
                    </p>

                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const isSelected = isMultiSelect
                          ? ((currentAnswer as string[]) || []).includes(
                              opt.value,
                            )
                          : currentAnswer === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => selectAnswer(q.id, opt.value)}
                            className={`w-full text-left p-4 rounded-lg border transition-colors ${
                              isSelected
                                ? "border-violet-500/50 bg-violet-500/10"
                                : "border-border hover:border-foreground/10 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected
                                    ? "border-violet-500 bg-violet-500"
                                    : "border-border"
                                }`}
                              >
                                {isSelected && (
                                  <Check size={12} className="text-white" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {opt.label}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {opt.description}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {isMultiSelect && (
                      <p className="text-[10px] text-muted-foreground mt-3">
                        Select all that apply
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                      <button
                        onClick={prevQuestion}
                        disabled={currentQuestion === 0}
                        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={nextQuestion}
                        disabled={!hasAnswer}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-30 transition-colors"
                      >
                        {currentQuestion === ASSESSMENT_QUESTIONS.length - 1
                          ? "Complete"
                          : "Next"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
