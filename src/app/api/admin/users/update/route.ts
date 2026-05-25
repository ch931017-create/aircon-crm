import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// admin 전용 사용자 기본정보(이름/전화) 수정.
// role/approval 변경은 기존 별도 API 유지 (위험도 분리).
// 본인 수정 허용 (이름/전화는 위험 동작 아님). self role downgrade / delete /
// deactivate 같은 위험 동작은 다른 API에서 별도 가드.
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";

  // name / phone — 최소 1개는 와야 함. 두 개 모두 와도 OK.
  // 값은 string | null 로 허용 (phone은 비울 수 있음, name은 비우면 거부).
  const hasName = Object.prototype.hasOwnProperty.call(body ?? {}, "name");
  const hasPhone = Object.prototype.hasOwnProperty.call(body ?? {}, "phone");
  const rawName = hasName ? body.name : undefined;
  const rawPhone = hasPhone ? body.phone : undefined;

  if (!userId) {
    return NextResponse.json({ error: "MISSING_USER_ID" }, { status: 400 });
  }
  if (!hasName && !hasPhone) {
    return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};

  if (hasName) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "NAME_EMPTY" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });
    }
    updates.name = name;
  }

  if (hasPhone) {
    const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";
    if (phone.length > 30) {
      return NextResponse.json({ error: "PHONE_TOO_LONG" }, { status: 400 });
    }
    // 빈 문자열 → null 저장 (선택 항목)
    updates.phone = phone || null;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
