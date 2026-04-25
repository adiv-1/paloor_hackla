"use client";

import { useEffect, useState } from "react";
import { useAdminAuth, adminFetch } from "@/lib/admin-auth";
import { AdminInfoPopover } from "@/components/AdminInfoPopover";
import {
  Search,
  ChevronRight,
  X,
  Send,
  Brain,
  MessageSquare,
  Landmark,
  MapPin,
  Briefcase,
  Calendar,
  Target,
  Shield,
  FileText,
  Trash2,
  User as UserIcon,
} from "lucide-react";

interface UserSummary {
  id: string;
  name: string;
  email: string;
  state: string | null;
  age: number | null;
  occupation: string | null;
  annual_income: string | null;
  net_worth_estimate: string | null;
  risk_tolerance: string | null;
  profile_completed: boolean;
  email_verified: boolean;
  created_at: string | null;
  message_count: number;
  memory_count: number;
  linked_accounts: number;
  total_balance: number;
}

interface CRMNote {
  id: string;
  user_id: string;
  admin_id: string;
  admin_name: string;
  content: string;
  note_type: string;
  created_at: number;
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  state: string | null;
  age: number | null;
  gender: string | null;
  occupation: string | null;
  annual_income: string | null;
  net_worth_estimate: string | null;
  risk_tolerance: string | null;
  financial_goals: string[] | null;
  dependents: number | null;
  profile_completed: number | null;
  email_verified: number | null;
  created_at: string | null;
  message_count: number;
  memory_stats: { total_memories: number; document_chunks: number; categories: Record<string, number> };
  linked_accounts: { id: string; institution: string; account_type: string; account_name: string; balance: number }[];
  total_balance: number;
  ai_summary: string;
  crm_notes: CRMNote[];
  conversations: { id: string; type: string; name: string; created_at: number }[];
}

export default function UsersPage() {
  const { token } = useAdminAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [noteType, setNoteType] = useState("general");

  useEffect(() => {
    if (!token) return;
    adminFetch(token, "/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [token]);

  function openUser(userId: string) {
    if (!token) return;
    setSelectedUserId(userId);
    setDetailLoading(true);
    adminFetch(token, `/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setUserDetail)
      .finally(() => setDetailLoading(false));
  }

  async function addNote() {
    if (!token || !selectedUserId || !noteInput.trim()) return;
    const res = await adminFetch(token, `/api/admin/users/${selectedUserId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: noteInput.trim(), note_type: noteType }),
    });
    if (res.ok) {
      const note = await res.json();
      setUserDetail((prev) => prev ? { ...prev, crm_notes: [note, ...prev.crm_notes] } : prev);
      setNoteInput("");
    }
  }

  async function deleteNote(noteId: string) {
    if (!token) return;
    await adminFetch(token, `/api/admin/notes/${noteId}`, { method: "DELETE" });
    setUserDetail((prev) =>
      prev ? { ...prev, crm_notes: prev.crm_notes.filter((n) => n.id !== noteId) } : prev
    );
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.state && u.state.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Users & CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {users.length} total users — click any user for full details and CRM notes
          </p>
        </div>
        <AdminInfoPopover
          title="User Management"
          description="View all registered users, their financial profiles, engagement metrics, and manage CRM notes."
          tips={["Search by name, email, or state", "Click a row to view full profile + CRM", "CRM notes are private to admin team"]}
        />
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, email, or state..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="flex gap-6">
        {/* User List */}
        <div className={`${selectedUserId ? "w-1/2" : "w-full"} transition-all`}>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">State</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Income</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Balance</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Msgs</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">AI Mem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => openUser(u.id)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selectedUserId === u.id ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{u.state || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{u.annual_income || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      {u.total_balance > 0 ? `$${u.total_balance.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">{u.message_count}</td>
                    <td className="px-4 py-3 text-right">{u.memory_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No users found</div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedUserId && (
          <div className="w-1/2 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <span className="text-sm font-medium">User Detail</span>
              <button onClick={() => { setSelectedUserId(null); setUserDetail(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading || !userDetail ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[calc(100vh-200px)] p-5 space-y-5">
                {/* Profile Header */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
                    {userDetail.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-serif text-lg font-semibold">{userDetail.name}</h2>
                    <p className="text-sm text-muted-foreground">{userDetail.email}</p>
                    <div className="flex gap-2 mt-1.5">
                      {userDetail.email_verified ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Verified</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>
                      )}
                      {userDetail.profile_completed ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Profile Complete</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Incomplete Profile</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <StatPill icon={MessageSquare} label="Messages" value={userDetail.message_count.toString()} />
                  <StatPill icon={Brain} label="Memories" value={userDetail.memory_stats.total_memories.toString()} />
                  <StatPill icon={Landmark} label="Balance" value={userDetail.total_balance > 0 ? `$${userDetail.total_balance.toLocaleString()}` : "—"} />
                </div>

                {/* Profile Details */}
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Profile</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <DetailRow icon={Calendar} label="Age" value={userDetail.age ? `${userDetail.age} years` : "—"} />
                    <DetailRow icon={MapPin} label="State" value={userDetail.state || "—"} />
                    <DetailRow icon={Briefcase} label="Occupation" value={userDetail.occupation || "—"} />
                    <DetailRow icon={UserIcon} label="Gender" value={userDetail.gender || "—"} />
                    <DetailRow icon={Target} label="Risk" value={userDetail.risk_tolerance || "—"} />
                    <DetailRow icon={UserIcon} label="Dependents" value={userDetail.dependents !== null ? userDetail.dependents.toString() : "—"} />
                  </div>
                  {userDetail.financial_goals && userDetail.financial_goals.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Goals:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {userDetail.financial_goals.map((g, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Linked Accounts */}
                {userDetail.linked_accounts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Linked Accounts</h3>
                    <div className="space-y-1.5">
                      {userDetail.linked_accounts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-muted/50">
                          <div>
                            <span className="font-medium">{a.institution}</span>
                            <span className="text-muted-foreground ml-1.5 text-xs">{a.account_type}</span>
                          </div>
                          <span className="font-mono text-xs">${a.balance.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Memory Categories */}
                {userDetail.memory_stats.total_memories > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Memory Categories</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(userDetail.memory_stats.categories).map(([cat, count]) => (
                        <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {cat.replace(/_/g, " ")} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Summary */}
                {userDetail.ai_summary && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Context Summary</h3>
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {userDetail.ai_summary}
                    </div>
                  </div>
                )}

                {/* CRM Notes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">CRM Notes</h3>
                    <AdminInfoPopover
                      title="CRM Notes"
                      description="Private notes about this user, visible only to admin team."
                      tips={["Select note type: general, follow-up, issue, opportunity"]}
                    />
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={noteType}
                      onChange={(e) => setNoteType(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs"
                    >
                      <option value="general">General</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="issue">Issue</option>
                      <option value="opportunity">Opportunity</option>
                    </select>
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                      placeholder="Add a note..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={addNote}
                      disabled={!noteInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {userDetail.crm_notes.map((note) => (
                      <div key={note.id} className="bg-muted/50 rounded-lg px-3 py-2 group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {note.note_type.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{note.admin_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(note.created_at * 1000).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => deleteNote(note.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs">{note.content}</p>
                      </div>
                    ))}
                    {userDetail.crm_notes.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No notes yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div>
        <p className="text-xs font-medium">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
