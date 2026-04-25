"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Upload,
  Download,
  Check,
  Link2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil,
  AlertTriangle,
  X,
  Trash2,
  FileText,
  Eye,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Types ───────────────────────────────────────────────────────── */

interface CreateField {
  key: string;
  label: string;
  placeholder: string;
}

interface ChecklistDef {
  key: string;
  label: string;
  description: string;
  required: boolean;
  account_level: boolean;
}

interface AssetClassDetail {
  key: string;
  label: string;
  description: string;
  overview: string;
  checklist: ChecklistDef[];
  create_fields: CreateField[];
  name_template: string;
}

interface AssetSummary {
  id: string;
  name: string;
  details: Record<string, string>;
  progress: string;
}

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  account_level: boolean;
  status: string;
  document_id: string | null;
  filename: string | null;
  extracted_fields: { key: string; value: string; label?: string }[] | null;
}

interface AssetDetail {
  id: string;
  name: string;
  details: Record<string, string>;
  checklist: ChecklistItem[];
}

/* ── Component ───────────────────────────────────────────────────── */

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetKey = params.key as string;

  const [classInfo, setClassInfo] = useState<AssetClassDetail | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Upload state
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingDocKey = useRef<string | null>(null);

  // In-line editing
  const [editingField, setEditingField] = useState<{
    docId: string;
    key: string;
    value: string;
  } | null>(null);

  /* ── Data fetching ─────────────────────────────────────────────── */

  const loadClass = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/asset-classes/${assetKey}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data: AssetClassDetail = await res.json();
      setClassInfo(data);
      // init form fields
      const initial: Record<string, string> = {};
      for (const f of data.create_fields) initial[f.key] = "";
      setForm(initial);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [assetKey]);

  const loadAssets = useCallback(async () => {
    const res = await fetch(`${API}/api/assets?asset_class=${assetKey}`);
    if (res.ok) setAssets(await res.json());
  }, [assetKey]);

  const loadAsset = useCallback(async (id: string) => {
    const res = await fetch(`${API}/api/assets/${id}`);
    if (res.ok) setAsset(await res.json());
  }, []);

  useEffect(() => {
    loadClass();
    loadAssets();
  }, [loadClass, loadAssets]);

  useEffect(() => {
    if (assets.length > 0 && !selectedId) setSelectedId(assets[0].id);
  }, [assets, selectedId]);

  useEffect(() => {
    if (selectedId) loadAsset(selectedId);
  }, [selectedId, loadAsset]);

  /* ── Create asset ──────────────────────────────────────────────── */

  const buildName = () => {
    if (!classInfo) return "New Item";
    return classInfo.name_template.replace(
      /\{(\w+)\}/g,
      (_, k) => form[k]?.trim() || "",
    );
  };

  const addAsset = async () => {
    if (!classInfo) return;
    const name = buildName().trim();
    if (!name) return;
    const res = await fetch(`${API}/api/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_class: assetKey,
        name,
        details: { ...form },
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setShowAdd(false);
      const resetForm: Record<string, string> = {};
      for (const f of classInfo.create_fields) resetForm[f.key] = "";
      setForm(resetForm);
      setSelectedId(created.id);
      await loadAssets();
    }
  };

  /* ── Upload/download/edit/delete ───────────────────────────────── */

  const startUpload = (docKey: string) => {
    pendingDocKey.current = docKey;
    fileRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const docKey = pendingDocKey.current;
    if (!file || !docKey || !selectedId) return;
    e.target.value = "";
    setUploadingKey(docKey);
    setUploadWarning(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(
        `${API}/api/assets/${selectedId}/documents/${docKey}`,
        { method: "POST", body: fd },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.warning) setUploadWarning(data.warning);
        await loadAsset(selectedId);
        await loadAssets();
        setExpandedKey(docKey);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingKey(null);
    }
  };

  const saveField = async () => {
    if (!editingField || !selectedId) return;
    try {
      await fetch(
        `${API}/api/documents/${editingField.docId}/fields/${editingField.key}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: editingField.value }),
        },
      );
      await loadAsset(selectedId);
    } catch (err) {
      console.error(err);
    }
    setEditingField(null);
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await fetch(`${API}/api/documents/${docId}`, { method: "DELETE" });
      if (selectedId) {
        await loadAsset(selectedId);
        await loadAssets();
      }
      setExpandedKey(null);
    } catch (err) {
      console.error(err);
    }
  };

  /* ── Status icon ───────────────────────────────────────────────── */

  const statusIcon = (item: ChecklistItem) => {
    if (item.status === "linked")
      return <Link2 size={14} className="text-blue-600" />;
    if (item.status === "uploaded")
      return <Check size={14} className="text-primary" />;
    return <div className="w-3.5 h-3.5 rounded-full border border-border" />;
  };

  const completed = asset
    ? asset.checklist.filter((i) => i.status !== "missing").length
    : 0;
  const total = asset ? asset.checklist.length : 0;

  /* ── Loading / not-found states ────────────────────────────────── */

  if (loading) {
    return (
      <div className="p-8 max-w-5xl flex items-center justify-center min-h-[300px]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !classInfo) {
    return (
      <div className="p-8 max-w-5xl">
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft size={14} /> Back to Assets
        </Link>
        <p className="text-sm text-muted-foreground">
          Asset class &ldquo;{assetKey}&rdquo; not found.
        </p>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="p-8 max-w-5xl">
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleFileSelect}
      />

      {/* Back + Header */}
      <Link
        href="/dashboard/assets"
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 w-fit"
      >
        <ArrowLeft size={14} /> All Assets
      </Link>

      <header className="mb-6">
        <h1 className="font-serif text-2xl tracking-tight mb-1">
          {classInfo.label}
        </h1>
        <p className="text-sm text-muted-foreground">{classInfo.overview}</p>
      </header>

      {/* Warning banner */}
      {uploadWarning && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800">
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

      {/* Instance selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {assets.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              selectedId === a.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-accent/50"
            }`}
          >
            {a.name}
            <span className="ml-2 text-xs opacity-70">{a.progress}</span>
          </button>
        ))}
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1"
        >
          <Plus size={14} /> Add {classInfo.label}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30">
          <div className="flex items-end gap-3 flex-wrap">
            {classInfo.create_fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium block mb-1">
                  {field.label}
                </label>
                <input
                  value={form[field.key] || ""}
                  onChange={(e) =>
                    setForm({ ...form, [field.key]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  className="px-2 py-1.5 text-sm border border-border rounded-md bg-background min-w-[120px]"
                  onKeyDown={(e) => e.key === "Enter" && addAsset()}
                />
              </div>
            ))}
            <button
              onClick={addAsset}
              className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground border border-primary/80 shadow-sm hover:bg-primary/90 hover:shadow transition-all"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {/* Preview name */}
          {Object.values(form).some((v) => v.trim()) && (
            <p className="text-xs text-muted-foreground mt-2">
              Name preview:{" "}
              <span className="font-medium text-foreground">{buildName()}</span>
            </p>
          )}
        </div>
      )}

      {/* Asset checklist */}
      {asset && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
            <div>
              <span className="text-sm font-medium">{asset.name}</span>
              <span className="ml-3 text-xs text-muted-foreground">
                {completed}/{total} documents
              </span>
            </div>
            <div className="w-32 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: total > 0 ? `${(completed / total) * 100}%` : "0%",
                }}
              />
            </div>
          </div>

          {asset.checklist.map((item) => (
            <div key={item.key} className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(item)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.required && (
                        <span className="text-[10px] text-muted-foreground border border-border px-1 rounded">
                          Required
                        </span>
                      )}
                      {item.account_level && item.status === "linked" && (
                        <span className="text-[10px] text-blue-600 border border-blue-200 px-1 rounded bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                          Account
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                    {item.filename && (
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {item.filename}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {item.status === "missing" && !item.account_level && (
                    <button
                      onClick={() => startUpload(item.key)}
                      disabled={uploadingKey === item.key}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
                    >
                      {uploadingKey === item.key ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />{" "}
                          Processing…
                        </>
                      ) : (
                        <>
                          <Upload size={12} /> Upload
                        </>
                      )}
                    </button>
                  )}
                  {item.status === "missing" && item.account_level && (
                    <Link
                      href="/dashboard/account"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Upload in Account
                    </Link>
                  )}
                  {item.document_id && (
                    <>
                      <button
                        onClick={() => startUpload(item.key)}
                        disabled={uploadingKey === item.key}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
                        title="Re-upload / Replace"
                      >
                        {uploadingKey === item.key ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Upload size={12} />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          setExpandedKey(
                            expandedKey === item.key ? null : item.key,
                          )
                        }
                        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                      >
                        {expandedKey === item.key ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                      <a
                        href={`${API}/api/documents/${item.document_id}/preview`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                        title="Preview"
                      >
                        <Eye size={13} />
                      </a>
                      <a
                        href={`${API}/api/documents/${item.document_id}/download`}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors"
                      >
                        <Download size={12} /> Download
                      </a>
                      <button
                        onClick={() =>
                          item.document_id && deleteDoc(item.document_id)
                        }
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Delete document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Extracted fields panel */}
              {expandedKey === item.key && item.extracted_fields && (
                <div className="px-4 pb-3">
                  <div className="ml-7 p-3 rounded-md bg-muted/50 space-y-1">
                    <p className="text-[11px] tabular-nums text-muted-foreground uppercase tracking-wider mb-2">
                      Extracted Fields
                    </p>
                    {item.extracted_fields.map((f) => {
                      const isEditing =
                        editingField &&
                        editingField.docId === item.document_id &&
                        editingField.key === f.key;
                      return (
                        <div
                          key={f.key}
                          className="flex items-center justify-between text-xs gap-2"
                        >
                          <span className="text-muted-foreground shrink-0">
                            {(f.label || f.key).replace(/_/g, " ")}
                          </span>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
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
                                  if (e.key === "Escape") setEditingField(null);
                                }}
                                className="px-1.5 py-0.5 text-xs border border-border rounded bg-background w-48"
                              />
                              <button
                                onClick={saveField}
                                className="text-primary hover:text-primary text-[10px] font-medium"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span
                              className="group flex items-center gap-1 cursor-pointer hover:text-foreground text-right"
                              onClick={() =>
                                item.document_id &&
                                setEditingField({
                                  docId: item.document_id,
                                  key: f.key,
                                  value: f.value || "",
                                })
                              }
                            >
                              {f.value || (
                                <span className="italic text-muted-foreground/50">
                                  empty
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
          ))}
        </div>
      )}

      {/* Empty state */}
      {!asset && assets.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <FileText
            size={32}
            className="mx-auto mb-3 text-muted-foreground/30"
          />
          <p className="text-sm text-muted-foreground mb-3">
            No {classInfo.label.toLowerCase()} added yet.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground"
          >
            Add Your First {classInfo.label}
          </button>
        </div>
      )}
    </div>
  );
}
