import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/timing";
import type { ProfileRow, UserRole } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string;
  profile: ProfileRow;
}

// React cache(): same-request 메모이즈. layout → page에서 중복 호출되어도
// auth.getUser() + profiles.select(*)는 1회만 실행됨.
// request 간에는 격리(별도 cache instance) → 사용자별 데이터 누출 없음.
// 진단 로그: "getCurrentUser EXEC" 가 1 request에서 1번만 찍히면 cache 동작 중.
// 2회 이상 찍히면 cache가 hit되지 않는 것 (request scope 분리됨).
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const tStart = Date.now();
  console.log("[timing] getCurrentUser EXEC start");
  const supabase = createClient();

  const {
    data: { user },
  } = await timed("getCurrentUser auth.getUser", supabase.auth.getUser());
  if (!user) {
    console.log(
      `[timing] getCurrentUser EXEC end: ${Date.now() - tStart}ms (no user)`,
    );
    return null;
  }

  const { data: profile } = await timed(
    "getCurrentUser profiles.select",
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  );
  console.log(`[timing] getCurrentUser EXEC end: ${Date.now() - tStart}ms`);

  if (!profile) return null;
  return { id: user.id, email: user.email ?? "", profile };
});

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
