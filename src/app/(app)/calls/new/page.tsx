import { requireRole } from "@/lib/auth";
import { CallForm } from "@/components/calls/CallForm";

export const metadata = { title: "콜 등록 — 에어컨 콜풀 CRM" };

export default async function NewCallPage() {
  await requireRole("dispatcher", "admin");

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">콜 등록</h1>
      <CallForm />
    </section>
  );
}
