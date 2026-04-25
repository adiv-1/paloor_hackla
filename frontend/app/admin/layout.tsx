import { AdminAuthProvider } from "@/lib/admin-auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
