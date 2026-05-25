import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

// CallList 등에서 사용하는 profiles 목록 (id/name/role만).
// 변경 빈도가 매우 낮음 (신규 가입 승인, role 변경, 이름 변경, is_active 토글 시에만).
// 60초 TTL + tag invalidation 조합:
//   - 매 nav마다 DB 왕복(229~696ms) 제거
//   - admin 측 user 변경 API들이 revalidateTag("profiles")로 즉시 무효화
//   - tag 누락된 경로에서도 최대 60초 후 자동 갱신
export type ProfilesListItem = Pick<ProfileRow, "id" | "name" | "role">;

export const getProfilesList = unstable_cache(
  async (): Promise<ProfilesListItem[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role");
    return (data ?? []) as ProfilesListItem[];
  },
  ["profiles-list-v1"],
  { revalidate: 60, tags: ["profiles"] },
);
