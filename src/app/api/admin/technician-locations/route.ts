import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 기사 위치 조회는 admin / dispatcher만 가능.
// 컬럼 단위 RLS는 PostgreSQL이 지원하지 않으므로 이 API에서 role 가드.
// 일반 client(브라우저) 코드는 supabase JS로 직접 profiles.current_lat/lng를
// select 하지 않는 것을 운영 규약으로 함.
export async function GET() {
  const me = await getCurrentUser();
  if (
    !me ||
    (me.profile.role !== "admin" && me.profile.role !== "dispatcher")
  ) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, current_lat, current_lng, location_updated_at")
    .eq("role", "technician")
    .eq("is_active", true)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ technicians: data ?? [] });
}
