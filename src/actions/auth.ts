"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultRouteFor } from "@/lib/auth";
import type { UserRole } from "@/types/database";

export interface SignInState {
  error?: string;
}

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  const supabase = createClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !signIn.user) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // role 조회 후 역할별 기본 페이지로
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", signIn.user.id)
    .maybeSingle();
  const profile = data as { role: UserRole } | null;

  redirect(profile ? defaultRouteFor(profile.role) : "/");
}

export interface SignUpState {
  error?: string;
  notice?: string;
}

export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !password || !name || !phone) {
    return { error: "모든 항목을 입력하세요." };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }

  const supabase = createClient();
  // handle_new_user 트리거가 raw_user_meta_data의 name/phone을 읽어
  // profiles(role 기본값 'technician')을 자동 insert. 별도 insert 불필요.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone } },
  });

  if (error) {
    const message = /already|registered|exists/i.test(error.message)
      ? "이미 등록된 이메일입니다."
      : `회원가입에 실패했습니다: ${error.message}`;
    return { error: message };
  }

  // 이메일 확인이 켜져 있으면 세션 없음 → 메일 인증 + 관리자 승인 둘 다 안내
  if (!data.session) {
    return {
      notice:
        "가입 요청이 접수되었습니다. 받은 메일함의 인증 메일을 확인하고, 관리자 승인이 완료되면 로그인할 수 있습니다.",
    };
  }

  // 이메일 확인 OFF인 경우: 즉시 로그인 상태이지만 approval_status='pending' 이므로
  // app layout 가드가 /pending-approval 로 보냄. 일관성을 위해 명시적 리다이렉트.
  redirect("/pending-approval");
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// =========================================================
// 비밀번호 재설정 — 메일 전송 요청
// =========================================================
export interface RequestPasswordResetState {
  error?: string;
  notice?: string;
}

export async function requestPasswordResetAction(
  _prev: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력하세요." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { error: "서버 설정 오류입니다. 관리자에게 문의하세요." };
  }

  const supabase = createClient();
  // 보안: 등록되지 않은 이메일도 동일한 응답 (account enumeration 방지)
  // Supabase가 내부적으로 등록 여부 확인 후 발송. 실패해도 error UI에 노출 X.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/update-password`,
  });

  return {
    notice:
      "비밀번호 재설정 메일을 전송했습니다. 메일함(스팸함 포함)을 확인하고 링크를 눌러주세요.",
  };
}

// =========================================================
// 새 비밀번호 설정 (재설정 링크 도달 후 세션 보유 상태에서 호출)
// =========================================================
export interface UpdatePasswordState {
  error?: string;
}

export async function updatePasswordAction(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (password !== confirm) {
    return { error: "두 비밀번호가 일치하지 않습니다." };
  }

  const supabase = createClient();
  // 세션 검증: callback에서 exchangeCodeForSession 후 세션 존재해야 함.
  // 링크 만료/이미 사용/직접 접근 등 세션 없는 경우 명시적 안내.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "재설정 링크가 만료되었거나 유효하지 않습니다. /forgot-password 에서 다시 시도해주세요.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `변경에 실패했습니다: ${error.message}` };
  }

  // 안전: 새 비밀번호로 다시 로그인하도록 세션 종료 후 로그인 페이지로
  await supabase.auth.signOut();
  redirect("/login?reset=ok");
}
