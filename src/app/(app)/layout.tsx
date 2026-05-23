import { requireUser } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { PWAInstallPrompt } from "@/components/layout/PWAInstallPrompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header profile={user.profile} />
      <div className="mx-auto w-full max-w-screen-md flex-1 px-4 pb-24 pt-4">
      {children}
    </div>
      <PWAInstallPrompt />
      <BottomNav role={user.profile.role} />
    </div>
  );
}
