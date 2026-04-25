import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/components/Onboarding";
import { Spotlight } from "@/components/Spotlight";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pl-56" style={{ overflowX: "clip" }}>
      <Sidebar />
      <main className="min-w-0 w-full">{children}</main>
      <Onboarding />
      <Spotlight />
    </div>
  );
}
