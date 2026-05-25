import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// /update-password 는 callback 후 recovery 세션이 있는 상태에서 접근하므로
// 일반 보호 라우트와 동일하게 처리해도 동작함. 다만 reset 흐름을 명시적으로
// 공용 경로로 두어 cookie 손실 등 edge case에서도 접근 가능하게 한다.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/health",
  "/forgot-password",
  "/update-password",
  "/auth",
];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth");

  // 미인증 → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // 이미 로그인 했는데 /login 또는 /signup → 홈으로
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
