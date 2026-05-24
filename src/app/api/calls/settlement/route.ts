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

  const supabase = createClient();

  const { data: existingCall, error: callFetchError } = await supabase
    .from("calls")
    .select("phone, happy_call_token, happy_call_sent_at, customer_confirmed_at")
    .eq("id", callId)
    .single();

  if (callFetchError) {
    return NextResponse.json({ error: callFetchError.message }, { status: 400 });
  }

  const existingHappyCallToken = existingCall?.happy_call_token?.toString() ?? null;
  const shouldSendHappyCall = !existingHappyCallToken;

  const happyCallToken = shouldSendHappyCall
    ? createHappyCallToken()
    : existingHappyCallToken;

  const happyCallUrl = `${process.env.NEXT_PUBLIC_APP_URL}/happy-call/${happyCallToken}`;

  const updateData: Record<string, unknown> = {
    payment_method: paymentMethod,
    paid_amount: paidAmount,
    technician_amount: technicianAmount,
    tax_included: taxIncluded,
    settlement_note: settlementNote,
    happy_call_checked: happyCallChecked,
    happy_call_memo: happyCallMemo,
    happy_call_checked_at: happyCallCheckedAt,

    happy_call_token: happyCallToken,
    happy_call_sent_at: shouldSendHappyCall
      ? new Date().toISOString()
      : existingCall.happy_call_sent_at,

    customer_confirmed_at: existingCall.customer_confirmed_at,

    before_photo_urls: beforePhotoUrls,
    after_photo_urls: afterPhotoUrls,

    status: "completed",
    completed_at: new Date().toISOString(),
  };

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

  if (shouldSendHappyCall) {
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
    happy_call_url: happyCallUrl,
    happy_call_sent: shouldSendHappyCall,
  });
}