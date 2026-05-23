import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallMapView } from "@/components/calls/CallMapView";
import type { CallRow } from "@/types/database";

export default async function CallsMapPage() {
  await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const calls = (data ?? []) as CallRow[];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">콜 지도</h1>
        <p className="mt-2 text-sm text-slate-500">
          좌표가 있는 콜을 시각화하고, 위치 정보 기반으로 콜을 확인하세요.
        </p>
      </div>
      <CallMapView calls={calls} />
    </section>
  );
}
