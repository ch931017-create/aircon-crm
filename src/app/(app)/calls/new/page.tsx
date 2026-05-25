import { requireRole } from "@/lib/auth";
import { CallForm } from "@/components/calls/CallForm";

export const metadata = { title: "콜 등록" };

export default async function NewCallPage() {
  await requireRole("dispatcher", "admin");

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">콜 등록</h1>
      {/* 단독 페이지에선 등록 후 /calls로 이동. PC split view(/calls)는 prop 미지정 → 그 자리에 머무름 */}
      <CallForm redirectAfterSuccess="/calls" />
    </section>
  );
}
