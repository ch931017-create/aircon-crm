import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { PWAInstallPrompt } from "@/components/layout/PWAInstallPrompt";
import { LocationUpdater } from "@/components/layout/LocationUpdater";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // 승인 가드: pending/rejected 사용자는 앱 기능 접근 차단.
  // admin은 본인이 'pending'이면 안 되지만 (012 migration에서 백필) 만일을 위해 우회.
  if (
    user.profile.role !== "admin" &&
    user.profile.approval_status !== "approved"
  ) {
    redirect("/pending-approval");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header profile={user.profile} />
      <div className="mx-auto w-full max-w-screen-md flex-1 px-4 pb-24 pt-4 lg:max-w-screen-2xl lg:px-6">
        {children}
      </div>
      <PWAInstallPrompt />
      <BottomNav role={user.profile.role} />
      {user.profile.role === "technician" ? <LocationUpdater /> : null}
    </div>
  );
}
