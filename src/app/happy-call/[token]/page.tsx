import { createAdminClient } from "@/lib/supabase/admin";
import { HappyCallForm } from "./HappyCallForm";

// 고객(비로그인) 공개 페이지.
// middleware 의 PUBLIC_PATHS 에 /happy-call 포함 → 인증 redirect 안 됨.
// 다만 supabase RLS 의 calls SELECT 정책이 'TO authenticated' 이므로,
// cookie 기반 createClient 로는 anon 이 row 를 못 읽음 (data=null → 404 회귀).
// → service_role admin client 로 RLS 우회. token 자체가 UUID v4(32-hex) 라
//    unguessable → 보안상 안전.

interface Props {
  params: {
    token: string;
  };
}

export const dynamic = "force-dynamic";

export default async function HappyCallPage({ params }: Props) {
  const supabase = createAdminClient();

  // 필요한 필드만 select (광범위 SELECT * 회피 + payload 최소화).
  const { data: call } = await supabase
    .from("calls")
    .select("customer_name, address, technician_amount")
    .eq("happy_call_token", params.token)
    .maybeSingle();

  if (!call) {
    // 비로그인 공개 오류 안내 (Next 기본 404 회피).
    // token prefix 6자만 로그 (전체 token 노출 X — PII 보호).
    console.warn(
      "[happy-call-page] token lookup failed tokenPrefix=",
      params.token.slice(0, 6),
    );
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm text-center">
          <h1 className="text-xl font-extrabold text-slate-900">
            유효하지 않은 링크입니다
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            링크가 만료되었거나 잘못되었을 수 있습니다.
            <br />
            발송된 문자의 최신 링크를 확인해주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">
            작업 금액 확인
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            아래 작업 정보가 맞는지 확인해주세요.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">고객명</p>
            <p className="text-sm font-semibold text-slate-900">
              {call.customer_name}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">주소</p>
            <p className="text-sm text-slate-700">{call.address}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">
              기사 입력 금액
            </p>

            <p className="text-xl font-extrabold text-emerald-600">
              {call.technician_amount?.toLocaleString()}원
            </p>
          </div>
        </div>

        <HappyCallForm token={params.token} />
      </div>
    </main>
  );
}
