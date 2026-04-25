"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  Building2,
  Car,
  Gem,
  CircleDollarSign,
  Landmark,
  BarChart3,
  Bitcoin,
  GraduationCap,
  Heart,
  Briefcase,
  FileText,
  Shield,
  Shell,
  Umbrella,
  Scale,
  ScrollText,
  Users,
  Building,
  CreditCard,
  Home as HomeIcon,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  User,
  Mail,
  MapPin,
  Camera,
  Loader2,
  Upload,
  Check,
  FolderOpen,
  AlertTriangle,
  Lock,
} from "lucide-react";

/* ── Asset Category Definitions ──────────────────────────────────── */

interface AssetItem {
  key: string;
  label: string;
  description: string;
  icon: typeof Car;
}

interface AssetCategory {
  id: string;
  label: string;
  description: string;
  icon: typeof Building2;
  color: string;
  items: AssetItem[];
}

const ASSET_CATEGORIES: AssetCategory[] = [
  {
    id: "real-assets",
    label: "Real Assets",
    description: "Physical property, vehicles, valuables, and precious metals",
    icon: Building2,
    color: "emerald",
    items: [
      {
        key: "primary_home",
        label: "Primary Home",
        description:
          "Your primary residence — deed, mortgage, insurance, tax records",
        icon: HomeIcon,
      },
      {
        key: "rental_property",
        label: "Rental Property",
        description: "Investment properties generating rental income",
        icon: Building2,
      },
      {
        key: "land",
        label: "Land",
        description: "Vacant land, agricultural, or development parcels",
        icon: Building2,
      },
      {
        key: "vehicles",
        label: "Vehicles",
        description:
          "Cars, motorcycles, boats, aircraft — title, registration, insurance",
        icon: Car,
      },
      {
        key: "jewelry_art",
        label: "Jewelry & Art",
        description:
          "High-value personal property — appraisals, provenance, insurance riders",
        icon: Gem,
      },
      {
        key: "collectibles",
        label: "Collectibles",
        description:
          "Watches, wine, vintage items — authentication and valuation records",
        icon: Gem,
      },
      {
        key: "precious_metals",
        label: "Precious Metals",
        description:
          "Physical gold, silver, platinum — purchase receipts, storage records",
        icon: CircleDollarSign,
      },
    ],
  },
  {
    id: "financial-assets",
    label: "Financial Assets",
    description: "Bank accounts, investments, retirement, and digital assets",
    icon: BarChart3,
    color: "blue",
    items: [
      {
        key: "checking",
        label: "Checking Accounts",
        description: "Day-to-day banking — statements, routing info",
        icon: Landmark,
      },
      {
        key: "savings",
        label: "Savings Accounts",
        description: "Savings, money market, high-yield accounts",
        icon: Landmark,
      },
      {
        key: "brokerage",
        label: "Brokerage Accounts",
        description: "Stocks, ETFs, bonds, options — statements, tax lots",
        icon: BarChart3,
      },
      {
        key: "retirement_401k",
        label: "401(k) Accounts",
        description:
          "Employer-sponsored retirement — contribution records, beneficiaries",
        icon: GraduationCap,
      },
      {
        key: "ira",
        label: "IRA Accounts",
        description:
          "Traditional, Roth, SEP, SIMPLE — contribution history, RMD tracking",
        icon: GraduationCap,
      },
      {
        key: "pension",
        label: "Pension",
        description:
          "Defined benefit pension documentation and payout projections",
        icon: ScrollText,
      },
      {
        key: "private_investments",
        label: "Private Investments",
        description:
          "VC, angel, syndicates, private equity — subscription docs, K-1s",
        icon: Briefcase,
      },
      {
        key: "crypto",
        label: "Crypto & Digital",
        description:
          "Wallets, exchange accounts — keys, transaction history, tax basis",
        icon: Bitcoin,
      },
      {
        key: "education_529",
        label: "529 Education Savings",
        description:
          "College savings plans — beneficiary info, contribution records",
        icon: GraduationCap,
      },
      {
        key: "hsa",
        label: "HSA Accounts",
        description:
          "Health savings accounts — contribution records, eligible expenses",
        icon: Heart,
      },
    ],
  },
  {
    id: "education-career",
    label: "Education & Career",
    description:
      "Academic records, W-2s, income tax documents, Social Security",
    icon: GraduationCap,
    color: "emerald",
    items: [
      {
        key: "education",
        label: "Education Records",
        description: "Transcripts, diplomas, and professional certifications",
        icon: GraduationCap,
      },
      {
        key: "income_tax",
        label: "W-2 / Tax Documents",
        description: "W-2 forms, 1099s, pay stubs — per employer and tax year",
        icon: FileText,
      },
      {
        key: "social_security",
        label: "Social Security",
        description: "Social Security statement and benefit estimates from SSA",
        icon: Shield,
      },
    ],
  },
  {
    id: "employment",
    label: "Employment & Compensation",
    description: "Equity compensation, deferred comp, and employment contracts",
    icon: Briefcase,
    color: "violet",
    items: [
      {
        key: "rsus",
        label: "RSUs",
        description:
          "Restricted stock units — vesting schedules, grant letters, tax withholding",
        icon: FileText,
      },
      {
        key: "stock_options",
        label: "Stock Options",
        description:
          "ISOs, NSOs — grant price, vesting, exercise windows, 83(b) elections",
        icon: FileText,
      },
      {
        key: "espp",
        label: "ESPP",
        description:
          "Employee stock purchase plan — enrollment, contribution, discount terms",
        icon: FileText,
      },
      {
        key: "deferred_comp",
        label: "Deferred Compensation",
        description:
          "Non-qualified deferred comp plans — election forms, payout schedules",
        icon: ScrollText,
      },
      {
        key: "employment_contract",
        label: "Employment Contracts",
        description: "Offer letters, non-compete, severance terms",
        icon: ScrollText,
      },
    ],
  },
  {
    id: "insurance",
    label: "Insurance Policies",
    description: "Life, health, disability, property, and liability coverage",
    icon: Shield,
    color: "amber",
    items: [
      {
        key: "life_insurance",
        label: "Life Insurance",
        description:
          "Term, whole, universal — policy details, beneficiaries, cash value",
        icon: Shield,
      },
      {
        key: "health_insurance",
        label: "Health Insurance",
        description:
          "Medical, dental, vision — plan details, network, deductibles",
        icon: Heart,
      },
      {
        key: "disability_insurance",
        label: "Disability Insurance",
        description:
          "Short-term, long-term — coverage amounts, elimination periods",
        icon: Shield,
      },
      {
        key: "auto_insurance",
        label: "Auto Insurance",
        description:
          "Liability, collision, comprehensive — declarations, coverage limits",
        icon: Car,
      },
      {
        key: "home_insurance",
        label: "Home / Renters Insurance",
        description: "Dwelling, personal property, liability coverage",
        icon: HomeIcon,
      },
      {
        key: "umbrella_insurance",
        label: "Umbrella Liability",
        description: "Excess liability coverage above primary policies",
        icon: Umbrella,
      },
    ],
  },
  {
    id: "legal-estate",
    label: "Legal & Estate",
    description:
      "Wills, trusts, powers of attorney, and beneficiary designations",
    icon: Scale,
    color: "rose",
    items: [
      {
        key: "will",
        label: "Will",
        description:
          "Last will and testament — original, executor info, witness details",
        icon: ScrollText,
      },
      {
        key: "trust",
        label: "Trust Documents",
        description:
          "Revocable, irrevocable — trust agreement, trustee designations, schedules",
        icon: ScrollText,
      },
      {
        key: "power_of_attorney",
        label: "Power of Attorney",
        description:
          "Financial and general POA — agent designations, scope, limitations",
        icon: FileText,
      },
      {
        key: "healthcare_directive",
        label: "Healthcare Directive",
        description:
          "Living will, healthcare proxy — treatment preferences, agent info",
        icon: Heart,
      },
      {
        key: "beneficiary_designations",
        label: "Beneficiary Designations",
        description:
          "Cross-reference for all accounts — 401k, IRA, insurance, TOD/POD",
        icon: Users,
      },
      {
        key: "business_ownership",
        label: "Business Ownership",
        description:
          "Ownership interests, buy-sell agreements, succession planning",
        icon: Building,
      },
    ],
  },
  {
    id: "business",
    label: "Business Interests",
    description: "LLCs, corporations, partnerships, and cap tables",
    icon: Building,
    color: "cyan",
    items: [
      {
        key: "llc_formation",
        label: "LLC / Corp Formation",
        description: "Articles of organization, EIN, operating agreements",
        icon: Building,
      },
      {
        key: "operating_agreement",
        label: "Operating Agreements",
        description: "Member duties, profit distribution, dissolution terms",
        icon: ScrollText,
      },
      {
        key: "cap_table",
        label: "Cap Tables",
        description: "Ownership percentages, share classes, dilution history",
        icon: BarChart3,
      },
      {
        key: "partnership_agreements",
        label: "Partnership Agreements",
        description: "Partnership terms, capital contributions, profit splits",
        icon: Users,
      },
    ],
  },
  {
    id: "debt",
    label: "Debt Obligations",
    description: "Mortgages, loans, credit lines — tracked alongside assets",
    icon: CreditCard,
    color: "red",
    items: [
      {
        key: "mortgage",
        label: "Mortgage",
        description: "Rate, term, amortization schedule, escrow, payoff amount",
        icon: HomeIcon,
      },
      {
        key: "student_loans",
        label: "Student Loans",
        description:
          "Federal, private — servicer info, repayment plan, forgiveness eligibility",
        icon: GraduationCap,
      },
      {
        key: "auto_loans",
        label: "Auto Loans",
        description: "Rate, term, payoff schedule, GAP insurance",
        icon: Car,
      },
      {
        key: "personal_loans",
        label: "Personal Loans",
        description: "Unsecured loans — rate, term, payoff projections",
        icon: CreditCard,
      },
      {
        key: "credit_lines",
        label: "Credit Lines",
        description: "HELOC, personal LOC, business LOC — limits, draws, rates",
        icon: CreditCard,
      },
    ],
  },
];

/* ── Identity Documents ──────────────────────────────────────────── */

const IDENTITY_DOCS = [
  {
    key: "passport",
    label: "Passport",
    description: "Valid passport — number, expiry, country of issue",
  },
  {
    key: "drivers_license",
    label: "Driver's License",
    description: "Government-issued driver's license",
  },
  {
    key: "government_id",
    label: "Government Photo ID",
    description: "State-issued identification card",
  },
  {
    key: "ssn_card",
    label: "Social Security Card",
    description: "Original or replacement SSN card",
  },
  {
    key: "birth_certificate",
    label: "Birth Certificate",
    description: "Certified copy of birth certificate",
  },
  {
    key: "marriage_certificate",
    label: "Marriage Certificate",
    description: "If applicable — certified copy",
  },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Helper: color classes ───────────────────────────────────────── */
function colorClasses(color: string) {
  const map: Record<
    string,
    { bg: string; text: string; border: string; accent: string }
  > = {
    emerald: {
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
      accent: "bg-primary",
    },
    blue: {
      bg: "bg-blue-500/10",
      text: "text-blue-500",
      border: "border-blue-500/20",
      accent: "bg-blue-500",
    },
    violet: {
      bg: "bg-violet-500/10",
      text: "text-violet-500",
      border: "border-violet-500/20",
      accent: "bg-violet-500",
    },
    amber: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/20",
      accent: "bg-amber-500",
    },
    rose: {
      bg: "bg-rose-500/10",
      text: "text-rose-500",
      border: "border-rose-500/20",
      accent: "bg-rose-500",
    },
    cyan: {
      bg: "bg-cyan-500/10",
      text: "text-cyan-500",
      border: "border-cyan-500/20",
      accent: "bg-cyan-500",
    },
    red: {
      bg: "bg-red-500/10",
      text: "text-red-500",
      border: "border-red-500/20",
      accent: "bg-red-500",
    },
  };
  return map[color] || map.emerald;
}

/* ── Component ───────────────────────────────────────────────────── */

export default function AssetsPage() {
  const { user } = useAuth();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "real-assets",
  );
  const [showIdentity, setShowIdentity] = useState(false);

  // Identity document state
  const [identityDocs, setIdentityDocs] = useState<
    Record<
      string,
      {
        status: string;
        document_id?: string;
        filename?: string;
        extracted_fields?: { key: string; value: string; label: string }[];
      }
    >
  >({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadIdentityDocs = async () => {
    try {
      const res = await fetch(`${API}/api/account/documents`);
      if (res.ok) {
        const data = await res.json();
        const map: typeof identityDocs = {};
        for (const doc of data) {
          map[doc.key] = doc;
        }
        setIdentityDocs(map);
      }
    } catch (err) {
      console.error("Failed to load identity docs:", err);
    }
  };

  useEffect(() => {
    loadIdentityDocs();
  }, []);

  const startIdentityUpload = (key: string) => {
    pendingKey.current = key;
    fileRef.current?.click();
  };

  const handleIdentityFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = pendingKey.current;
    if (!file || !key) return;
    e.target.value = "";
    setUploadingKey(key);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/account/documents/${key}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await loadIdentityDocs();
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploadingKey(null);
    }
  };

  const photoUrl = user?.photo_url ? `${API}${user.photo_url}` : null;
  const uploadedCount = Object.values(identityDocs).filter(
    (d) => d.status === "uploaded",
  ).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hidden file input for identity document uploads */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={handleIdentityFile}
      />

      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl tracking-tight">Assets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your complete financial inventory — real assets, financial accounts,
          compensation, insurance, legal documents, and debt.
        </p>
      </div>

      {/* Identity & Profile Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowIdentity(!showIdentity)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={18} className="text-muted-foreground" />
              )}
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold">
                {user?.name || "Your Profile"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Identity documents, passport, ID — {uploadedCount}/
                {IDENTITY_DOCS.length} uploaded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/account"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border transition-colors"
            >
              Edit Profile
            </Link>
            {showIdentity ? (
              <ChevronUp size={16} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={16} className="text-muted-foreground" />
            )}
          </div>
        </button>

        {showIdentity && (
          <div className="border-t border-border px-5 py-4">
            <div className="grid md:grid-cols-2 gap-3">
              {IDENTITY_DOCS.map((doc) => {
                const docState = identityDocs[doc.key];
                const isUploaded = docState?.status === "uploaded";
                const isUploading = uploadingKey === doc.key;

                return (
                  <div
                    key={doc.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isUploaded
                        ? "border-primary/30 bg-primary/5"
                        : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isUploaded ? "bg-primary/10" : "bg-muted"
                      }`}
                    >
                      {isUploaded ? (
                        <Check size={14} className="text-primary" />
                      ) : (
                        <Lock size={14} className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{doc.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {isUploaded
                          ? `Uploaded • ${docState.extracted_fields?.filter((f) => f.value).length || 0} fields extracted`
                          : doc.description}
                      </p>
                    </div>
                    <button
                      onClick={() => startIdentityUpload(doc.key)}
                      disabled={isUploading}
                      className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                        isUploading
                          ? "text-muted-foreground border-border cursor-wait"
                          : isUploaded
                            ? "text-primary hover:text-primary border-primary/30 hover:bg-primary/10"
                            : "text-muted-foreground hover:text-foreground border-border"
                      }`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />
                          Uploading…
                        </>
                      ) : isUploaded ? (
                        <>
                          <Upload size={11} />
                          Replace
                        </>
                      ) : (
                        <>
                          <Upload size={11} />
                          Upload
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
              <Lock size={10} />
              Identity documents are encrypted and never shared. Manage full
              profile in{" "}
              <Link
                href="/dashboard/account"
                className="underline hover:text-foreground"
              >
                Account Settings
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      {/* Asset Categories */}
      <div className="space-y-3">
        {ASSET_CATEGORIES.map((category) => {
          const cc = colorClasses(category.color);
          const isExpanded = expandedCategory === category.id;
          return (
            <div
              key={category.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedCategory(isExpanded ? null : category.id)
                }
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center border ${cc.bg} ${cc.text} ${cc.border}`}
                  >
                    <category.icon size={18} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold">{category.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {category.items.length} types
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={16} className="text-muted-foreground" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border px-5 py-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    {category.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.key}
                          href={`/dashboard/assets/${item.key}`}
                          className="group flex items-center gap-3 p-3 rounded-lg border border-border hover:border-foreground/10 hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${cc.bg} shrink-0`}
                          >
                            <ItemIcon size={14} className={cc.text} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium group-hover:text-foreground transition-colors">
                              {item.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                          <ChevronRight
                            size={14}
                            className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0"
                          />
                        </Link>
                      );
                    })}
                  </div>

                  {/* Add new item button */}
                  <Link
                    href={`/dashboard/assets/${category.items[0]?.key || ""}`}
                    className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg border border-dashed border-border hover:border-foreground/20"
                  >
                    <Plus size={12} />
                    Add {category.label.toLowerCase().replace("&", "or")} item
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="rounded-xl border border-dashed border-muted-foreground/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {ASSET_CATEGORIES.reduce((s, c) => s + c.items.length, 0)} asset types
          across {ASSET_CATEGORIES.length} categories · {IDENTITY_DOCS.length}{" "}
          identity document types
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Each asset type supports document uploads, OCR extraction, and
          AI-powered field detection
        </p>
      </div>
    </div>
  );
}
