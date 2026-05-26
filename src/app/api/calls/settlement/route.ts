import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendHappyCallSms } from "@/lib/sms";
import { sendPushToProfiles } from "@/lib/web-push";

function createHappyCallToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const callId = body.call_id?.toString();
  const paymentMethod = body.payment_method?.toString();
  const paidAmount = Number(body.paid_amount ?? null);
  const taxIncluded = body.tax_included === true || body.tax_included === "true";
  const invoiceBusinessId = body.invoice_business_id?.toString() ?? null;
  const invoiceBusinessName = body.invoice_business_name?.toString() ?? null;
  const invoiceCeoName = body.invoice_ceo_name?.toString() ?? null;
  const invoiceEmail = body.invoice_email?.toString() ?? null;
  const taxInvoiceFileUrl = body.tax_invoice_file_url?.toString().trim();
  const settlementNote = body.settlement_note?.toString() ?? null;
  const technicianAmount = Number(body.technician_amount ?? 0);
  const happyCallChecked = body.happy_call_checked === true || body.happy_call_checked === "true";
  const happyCallMemo = body.happy_call_memo?.toString() ?? null;
  const happyCallCheckedAt = happyCallChecked ? new Date().toISOString() : null;
  const beforePhotoUrls = body.before_photo_urls ?? [];
  const afterPhotoUrls = body.after_photo_urls ?? [];

  if (!callId || !paymentMethod || Number.isNaN(paidAmount) || paidAmount <= 0) {
    return NextResponse.json(
      { error: "결제 방식과 결제 금액을 확인해주세요." },
      { status: 400 },
    );
  }

  if (paymentMethod === "tax_invoice") {
    if (!invoiceBusinessId || !invoiceBusinessName || !invoiceCeoName || !invoiceEmail) {
      return NextResponse.json(
        {
          error:
            "세금계산서 발급을 위해 사업자등록번호, 상호, 대표자명, 이메일을 모두 입력해주세요.",
        },
        { status: 400 },
      );
    }
  }

  // mark_paid 분기 (운영 정책):
  //   true  = 결제완료. payment_status='paid' + paid_at 설정. 해피콜 최초 1회 발송.
  //   false = 작업완료(미수). payment_status='unpaid' + paid_at=null. 해피콜 절대 미발송.
  //          happy_call_token / happy_call_sent_at 도 절대 건드리지 않음 (이후 결제완료
  //          누르면 그때 비로소 token 생성).
  const markPaid = body.mark_paid === true || body.mark_paid === "true";

  const supabase = createClient();

  const { data: existingCall, error: callFetchError } = await supabase
    .from("calls")
    .select(
      "phone, happy_call_token, happy_call_sent_at, customer_confirmed_at, payment_status, paid_at",
    )
    .eq("id", callId)
    .single();

  if (callFetchError) {
    return NextResponse.json({ error: callFetchError.message }, { status: 400 });
  }

  const existingHappyCallToken =
    existingCall?.happy_call_token?.toString() ?? null;
  // 해피콜 발송 조건 (안전 가드):
  //   - mark_paid=true 일 때만
  //   - 기존 token 없을 때만 (중복 발송 절대 금지)
  const shouldSendHappyCall = markPaid && !existingHappyCallToken;

  // happy_call_token 결정:
  //   - mark_paid=false: 절대 생성하지 않음. 기존 값이 있으면 유지(드물지만 정합용),
  //                     없으면 null 그대로.
  //   - mark_paid=true: 기존 있으면 그대로, 없으면 새로 생성.
  const happyCallToken = markPaid
    ? (existingHappyCallToken ?? createHappyCallToken())
    : existingHappyCallToken;

  // happy_call_url 은 token 있을 때만 의미 있음. 응답에서 노출 X (UI 정책).
  const happyCallUrl = happyCallToken
    ? `${process.env.NEXT_PUBLIC_APP_URL}/happy-call/${happyCallToken}`
    : null;

  // [diag] happy-call link 생성 진단 — 민감정보 마스킹:
  //   - tokenExists boolean
  //   - host (도메인 — production 일치 여부 확인)
  //   - pathPrefix (/happy-call 인지 확인, 전체 token 노출 X)
  if (happyCallUrl) {
    try {
      const u = new URL(happyCallUrl);
      console.log(
        `[happy-call-link] tokenExists=true host=${u.host} pathPrefix=${u.pathname.split("/").slice(0, 2).join("/")}`,
      );
    } catch {
      console.warn(
        "[happy-call-link] invalid URL — NEXT_PUBLIC_APP_URL 확인 필요",
      );
    }
  } else {
    console.log("[happy-call-link] tokenExists=false (markPaid=false 경로)");
  }

  const updateData: Record<string, unknown> = {
    payment_method: paymentMethod,
    paid_amount: paidAmount,
    technician_amount: technicianAmount,
    tax_included: taxIncluded,
    settlement_note: settlementNote,
    happy_call_checked: happyCallChecked,
    happy_call_memo: happyCallMemo,
    happy_call_checked_at: happyCallCheckedAt,

    customer_confirmed_at: existingCall.customer_confirmed_at,

    before_photo_urls: beforePhotoUrls,
    after_photo_urls: afterPhotoUrls,

    status: "completed",
    completed_at: new Date().toISOString(),
  };

  // happy_call_token / sent_at: 최초 발송 시점에만 update.
  // mark_paid=false 또는 이미 token 있는 결제완료 수정은 두 필드 모두 미터치 →
  // 옛 값 그대로 보존. 중복 발송/덮어쓰기 0.
  if (shouldSendHappyCall) {
    updateData.happy_call_token = happyCallToken;
    updateData.happy_call_sent_at = new Date().toISOString();
  }

  // payment_status / paid_at 분기:
  //   결제완료: payment_status='paid'. paid_at 은 unpaid→paid 전환 시에만 새로 설정.
  //   작업완료: payment_status='unpaid' + paid_at=null.
  if (markPaid) {
    updateData.payment_status = "paid";
    if (existingCall?.payment_status !== "paid") {
      updateData.paid_at = new Date().toISOString();
    }
    // 이미 paid 면 paid_at 미터치 (불필요한 덮어쓰기 회피).
  } else {
    updateData.payment_status = "unpaid";
    updateData.paid_at = null;
  }

  if (paymentMethod === "tax_invoice") {
    updateData.invoice_business_id = invoiceBusinessId;
    updateData.invoice_business_name = invoiceBusinessName;
    updateData.invoice_ceo_name = invoiceCeoName;
    updateData.invoice_email = invoiceEmail;
    updateData.tax_invoice_file_url = taxInvoiceFileUrl ? taxInvoiceFileUrl : null;
  }

  const { error } = await supabase.from("calls").update(updateData).eq("id", callId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const phone = existingCall?.phone?.toString() ?? "";

  // SMS 발송: mark_paid=true + 기존 token 없을 때만 (shouldSendHappyCall 조건).
  // happyCallUrl 은 위에서 token 있을 때만 설정됨 → null 가드.
  if (shouldSendHappyCall && happyCallUrl) {
    await sendHappyCallSms({
      phone,
      url: happyCallUrl,
    });
  }

  // 콜 완료 push: notify_completion=true인 admin/dispatcher에게 (운영 정책: opt-out 가능)
  // settlement API는 항상 status='completed'로 전환하므로 매번 발송 대상
  try {
    const { data: receivers } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "dispatcher"])
      .eq("notify_completion", true)
      .eq("is_active", true);

    if (receivers && receivers.length > 0) {
      const { data: call } = await supabase
        .from("calls")
        .select("customer_name, district")
        .eq("id", callId)
        .maybeSingle();
      const body = call
        ? `${call.district ?? "지역미정"} · ${call.customer_name} 완료 처리됨`
        : "콜이 완료되었습니다";
      await sendPushToProfiles(
        receivers.map((r) => r.id as string),
        {
          title: "콜 완료",
          body,
          url: `/calls/${callId}`,
          tag: `call-${callId}-complete`,
        },
      );
    }
  } catch {
    // push 실패는 무시 — 정산 저장 자체는 성공
  }

  return NextResponse.json({
    success: true,
    // happy_call_url 은 UI 에서 노출하지 않음. 응답에 남겨두지만 클라이언트가 alert 등으로
    // 직접 표시 X (PII + UX 보호). markPaid=false 면 null.
    happy_call_url: happyCallUrl,
    happy_call_sent: shouldSendHappyCall,
    mark_paid: markPaid,
    payment_status: markPaid ? "paid" : "unpaid",
  });
}