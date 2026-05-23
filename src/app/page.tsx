import { redirect } from "next/navigation";
import { getCurrentUser, defaultRouteFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(defaultRouteFor(user.profile.role));
}
