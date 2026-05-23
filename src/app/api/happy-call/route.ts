import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token = String(body.token ?? "");
    const customerAmount = Number(body.customer_amount ?? 0);
    const serviceScore = Number(body.service_score ?? 5);
const gasCharged = body.gas_charged === true;
const gasExplained =
  body.gas_explained === true
    ? true
    : body.gas_explained === false
      ? false
      : null;

const customerMemo = body.memo?.toString() ?? null;

    if (!token) {
      return NextResponse.json(
        { error: "확인 링크가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    if (!customerAmount || customerAmount < 0) {
      return NextResponse.json(
        { error: "결제 금액을 올바르게 입력해주세요." },
        { status: 400 },
      );
    }

    const supabase = createClient();

    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("id, technician_amount")
      .eq("happy_call_token", token)
      .single();

    if (fetchError || !call) {
      return NextResponse.json(
        { error: "확인할 작업을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const technicianAmount = Number(call.technician_amount ?? 0);
    const isMismatch =
      technicianAmount > 0 && technicianAmount !== customerAmount;

    const { error: updateError } = await supabase
      .from("calls")
      .update({
        customer_amount: customerAmount,
        happy_call_checked: true,
        happy_call_checked_at: new Date().toISOString(),
        customer_confirmed_at: new Date().toISOString(),
        amount_mismatch_checked: !isMismatch,
        
        customer_service_score: serviceScore,
        customer_gas_charged: gasCharged,
        customer_gas_explained: gasExplained,
        customer_happycall_memo: customerMemo,
      })
      .eq("id", call.id);

    if (updateError) {
      return NextResponse.json(
        { error: "금액 확인 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      is_mismatch: isMismatch,
    });
  } catch {
    return NextResponse.json(
      { error: "요청 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}