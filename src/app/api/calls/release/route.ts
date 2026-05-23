import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const callId = body.call_id?.toString();
  if (!callId) {
    return NextResponse.json({ error: "call_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("release_call", { p_call_id: callId } as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
