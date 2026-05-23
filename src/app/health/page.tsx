import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const envOk =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let authOk = false;
  let authMessage = "환경변수 누락으로 시도하지 않음";

  if (envOk) {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.getSession();
      authOk = !error;
      authMessage = error ? error.message : "Supabase 연결 OK";
    } catch (e) {
      authMessage = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold">헬스체크</h1>

      <Row label="환경변수" ok={envOk}>
        {envOk
          ? "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 로드됨"
          : ".env.local 파일에 SUPABASE 변수를 채워주세요."}
      </Row>

      <Row label="Supabase 클라이언트" ok={authOk}>
        {authMessage}
      </Row>

      <a
        href="/"
        className="mt-4 self-start text-sm text-brand-600 underline"
      >
        ← 홈으로
      </a>
    </main>
  );
}

function Row({
  label,
  ok,
  children,
}: {
  label: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span
          className={
            ok
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
              : "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"
          }
        >
          {ok ? "OK" : "FAIL"}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </div>
  );
}
