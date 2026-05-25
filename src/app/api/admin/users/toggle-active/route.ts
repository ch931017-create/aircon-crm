import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const isActive = typeof body?.is_active === "boolean" ? body.is_active : null;

  if (!userId || isActive === null) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // 본인이 본인 비활성화하는 사고 방지
  if (userId === me.id && !isActive) {
    return NextResponse.json(
      { error: "CANNOT_DEACTIVATE_SELF" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
