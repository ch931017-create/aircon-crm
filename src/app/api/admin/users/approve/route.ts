import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ApprovalStatus } from "@/types/database";

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const action = body?.action;

  if (!userId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const nextStatus: ApprovalStatus =
    action === "approve" ? "approved" : "rejected";
  const supabase = createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      approval_status: nextStatus,
      approved_at: action === "approve" ? new Date().toISOString() : null,
      approved_by: action === "approve" ? me.id : null,
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
