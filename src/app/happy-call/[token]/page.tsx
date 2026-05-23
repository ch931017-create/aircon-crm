import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HappyCallForm } from "./HappyCallForm";

interface Props {
  params: {
    token: string;
  };
}

export default async function HappyCallPage({ params }: Props) {
  const supabase = createClient();

  const { data: call } = await supabase
    .from("calls")
    .select("*")
    .eq("happy_call_token", params.token)
    .single();

  if (!call) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">
            작업 금액 확인
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            아래 작업 정보가 맞는지 확인해주세요.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">고객명</p>
            <p className="text-sm font-semibold text-slate-900">
              {call.customer_name}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">주소</p>
            <p className="text-sm text-slate-700">
              {call.address}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">
              기사 입력 금액
            </p>

            <p className="text-xl font-extrabold text-emerald-600">
              {call.technician_amount?.toLocaleString()}원
            </p>
          </div>
        </div>

        <HappyCallForm token={params.token} />
      </div>
    </main>
  );
}