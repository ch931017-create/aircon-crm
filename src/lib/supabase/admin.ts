import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// service_role 키로 작동하는 admin 클라이언트.
// auth.users 직접 조작 / RLS 우회가 필요한 server-only 작업에서만 사용.
// 절대 client-side import 금지.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not configured",
    );
  }
  return createClient<Database>(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
