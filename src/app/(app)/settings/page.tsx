import { requireUser } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <SettingsClient
      role={user.profile.role}
      notifyCompletion={user.profile.notify_completion}
    />
  );
}
