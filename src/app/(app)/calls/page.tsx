import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/calls/CallList";
import { CallForm } from "@/components/calls/CallForm";
import { timed } from "@/lib/timing";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const tPageStart = Date.now();
  const user = await timed("/calls auth", requireUser());
  const supabase = createClient();

  // CallList가 실제 사용하는 18개 컬럼만 select (payload 절반 축소)
  // realtime은 INSERT/UPDATE/DELETE 이벤트로 전체 row를 받지만, 그건 별개 (extra fields 무해)
  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
    timed(
      "/calls fetch.calls",
      supabase
        .from("calls")
        .select(
          "id,customer_name,phone,address,district,symptom," +
            "preferred_time,memo," +
            "estimated_amount,paid_amount,customer_amount," +
            "happy_call_checked," +
            "status,assigned_to,created_at," +
            "scheduled_date," +
            "latitude,longitude",
        )
        .order("created_at", { ascending: false })
        .limit(400),
    ),
    timed(
      "/calls fetch.profiles",
      supabase.from("profiles").select("id, name, role"),
    ),
  ]);
  console.log(`[timing] /calls TOTAL: ${Date.now() - tPageStart}ms`);

  // unknown cast: select 부분 컬럼 string은 supabase-js의 generic narrowing이 안 됨.
  // 운영 컬럼 정합성은 select string으로 보장, 타입은 CallRow로 사용 (인덱스 시그니처로 누락 필드 안전).
  const calls = (callsData ?? []) as unknown as CallRow[];
  const profiles = (profilesData ?? []) as Array<
    Pick<ProfileRow, "id" | "name" | "role">
  >;

  const canCreate =
    user.profile.role === "dispatcher" || user.profile.role === "admin";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">전체 콜</h1>
          <p className="text-xs text-slate-500">{calls.length}건</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Link
              href="/calls/new"
              className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 lg:hidden"
            >
              <Plus size={16} />
              콜 등록
            </Link>
          )}
          <Link
            href="/calls/map"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            지도 보기
          </Link>
        </div>
      </div>

      {/* PC(lg+) + dispatcher/admin: 좌측 리스트 + 우측 등록 폼 split. 그 외엔 기존 단일 컬럼. */}
      {canCreate ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <CallList
              currentUserId={user.id}
              currentUserRole={user.profile.role}
              initialCalls={calls}
              profiles={profiles}
            />
          </div>
          {/* PC sticky: 좌측 콜 리스트 스크롤해도 우측 등록 카드 고정.
              max-h + overflow-auto: 화면 짧을 때 카드 자체 스크롤로 등록 버튼 접근 보장.
              top-4는 layout 헤더 + 여백 고려. */}
          <aside className="mt-6 hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:mt-0 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:p-4">
            <h2 className="mb-2 text-base font-semibold text-slate-900">콜 등록</h2>
            <CallForm />
          </aside>
        </div>
      ) : (
        <CallList
          currentUserId={user.id}
          currentUserRole={user.profile.role}
          initialCalls={calls}
          profiles={profiles}
        />
      )}
    </section>
  );
}
