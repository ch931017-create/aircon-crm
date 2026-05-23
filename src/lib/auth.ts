import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserRole } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string;
  profile: ProfileRow;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;
  return { id: user.id, email: user.email ?? "", profile };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) redirect("/");
  return user;
}

export function defaultRouteFor(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "dispatcher":
      return "/calls";
    case "technician":
      return "/my-calls";
  }
}
