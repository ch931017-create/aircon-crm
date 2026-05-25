import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

const ALLOWED_ROLES: UserRole[] = ["admin", "dispatcher", "technician"];

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const role = body?.role as UserRole | undefined;

  if (!email || !password || !name || !phone || !role) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "INVALID_ROLE" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. auth.users 생성 (이메일 인증 스킵 → 즉시 로그인 가능)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone },
  });

  if (createError || !created.user) {
    const message = /already|registered|exists/i.test(createError?.message ?? "")
      ? "ALREADY_REGISTERED"
      : createError?.message ?? "CREATE_FAILED";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 2. handle_new_user 트리거가 profiles row를 default('technician', pending) 로 생성.
  //    여기서 role, approval_status, name, phone을 일괄 업데이트.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      name,
      phone,
      role,
      is_active: true,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: me.id,
    })
    .eq("id", created.user.id);

  if (profileError) {
    // 정합성: profile update 실패 시 auth user도 롤백
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  revalidateTag("profiles");
  return NextResponse.json({ success: true, user_id: created.user.id });
}
