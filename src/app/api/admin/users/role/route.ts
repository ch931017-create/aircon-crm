import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

const ALLOWED_ROLES: UserRole[] = ["admin", "dispatcher", "technician"];

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const role = body?.role as UserRole | undefined;

  if (!userId || !role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // 본인이 본인 admin 권한을 떨어뜨려서 잠기는 사고 방지
  if (userId === me.id && role !== "admin") {
    return NextResponse.json(
      { error: "CANNOT_DEMOTE_SELF" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
