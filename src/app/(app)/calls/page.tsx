import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/calls/CallList";
import { CallForm } from "@/components/calls/CallForm";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const user = await requireUser();
  const supabase = createClient();

  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400),
    supabase.from("profiles").select("id, name, role"),
  ]);

  const calls = (callsData ?? []) as CallRow[];
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
          <aside className="mt-6 hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:mt-0 lg:block">
            <h2 className="mb-3 text-base font-semibold text-slate-900">콜 등록</h2>
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
