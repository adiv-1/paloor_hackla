"use client";

import { useEffect, useState } from "react";
import { useAdminAuth, adminFetch } from "@/lib/admin-auth";
import { AdminInfoPopover } from "@/components/AdminInfoPopover";
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Mail,
  Calendar,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

interface Employee {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: number;
}

export default function EmployeesPage() {
  const { token, admin } = useAdminAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "employee" });
  const [error, setError] = useState("");

  const isSuperAdmin = admin?.role === "super_admin";

  useEffect(() => {
    if (!token) return;
    adminFetch(token, "/api/admin/employees")
      .then((r) => r.json())
      .then(setEmployees)
      .finally(() => setLoading(false));
  }, [token]);

  async function addEmployee() {
    if (!token || !form.email || !form.name || !form.password) return;
    setError("");
    const res = await adminFetch(token, "/api/admin/employees", {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const emp = await res.json();
      setEmployees((prev) => [...prev, emp]);
      setShowForm(false);
      setForm({ email: "", name: "", password: "", role: "employee" });
    } else {
      const err = await res.json();
      setError(err.detail || "Failed to create employee");
    }
  }

  async function deactivateEmployee(id: string) {
    if (!token) return;
    const res = await adminFetch(token, `/api/admin/employees/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, is_active: false } : e)));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground">Loading team...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {employees.filter((e) => e.is_active).length} active member{employees.filter((e) => e.is_active).length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminInfoPopover
            title="Employee Management"
            description="Manage your admin team. Super admins can create new employee accounts and deactivate existing ones. Employees get CRM access but cannot manage other employees."
            tips={[
              "Roles: Super Admin (full access) vs Employee (CRM only)",
              "Deactivated accounts cannot log in",
              "Only super admins can manage employees",
            ]}
          />
          {isSuperAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Add Employee Form */}
      {showForm && isSuperAdmin && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-medium mb-3">New Employee</h3>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg mb-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email address"
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Password"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
            >
              <option value="employee">Employee</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={addEmployee}
              disabled={!form.email || !form.name || !form.password}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              Create Account
            </button>
          </div>
        </div>
      )}

      {/* Employee Cards */}
      <div className="grid grid-cols-2 gap-4">
        {employees.map((emp) => (
          <div
            key={emp.id}
            className={`bg-card border border-border rounded-xl p-5 ${
              !emp.is_active ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  {emp.role === "super_admin" ? (
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  ) : (
                    <Shield className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-medium">{emp.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <Mail className="w-3 h-3" />
                    {emp.email}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    emp.role === "super_admin"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {emp.role === "super_admin" ? "Super Admin" : "Employee"}
                </span>
                {!emp.is_active && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                    Deactivated
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                Joined {new Date(emp.created_at * 1000).toLocaleDateString()}
              </div>
              {isSuperAdmin && emp.is_active && emp.id !== admin?.id && (
                <button
                  onClick={() => deactivateEmployee(emp.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {employees.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No team members yet
        </div>
      )}
    </div>
  );
}
