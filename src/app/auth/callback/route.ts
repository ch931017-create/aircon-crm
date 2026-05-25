import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth PKCE 콜백.
// 비밀번호 재설정 메일 / 이메일 인증 등에서 발급된 code를 세션으로 교환한 뒤
// next 파라미터로 지정된 경로로 리다이렉트한다.
//
// 흐름:
//   메일 링크 → /auth/callback?code=...&next=/update-password
//   → exchangeCodeForSession(code) (cookie에 세션 저장)
//   → 302 to /update-password (또는 next로 지정된 경로)
//
// 실패 시:
//   /forgot-password?error=callback_failed 로 리다이렉트하여 사용자 재시도 유도
//
// next 파라미터는 path-only로 제한 (open redirect 방지).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";

  // open redirect 방지: 외부 URL/protocol-relative URL 차단. path만 허용.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/forgot-password?error=callback_failed`,
  );
}
