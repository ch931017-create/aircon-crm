"use client";

import { useState } from "react";

export function HappyCallForm({ token }: { token: string }) {
  const [amount, setAmount] = useState("");
  const [serviceScore, setServiceScore] = useState("5");
  const [gasCharged, setGasCharged] = useState("");
  const [gasExplained, setGasExplained] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!amount || Number(amount) <= 0) {
      setError("실제 결제하신 금액을 입력해주세요.");
      return;
    }

    if (!gasCharged) {
      setError("냉매/가스 충전 여부를 선택해주세요.");
      return;
    }

    if (gasCharged === "yes" && !gasExplained) {
      setError("냉매/가스 관련 설명을 들으셨는지 선택해주세요.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/happy-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          customer_amount: Number(amount),
          service_score: Number(serviceScore),
          gas_charged: gasCharged === "yes",
          gas_explained: gasCharged === "yes" ? gasExplained === "yes" : null,
          memo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }

      setDone(true);
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-3xl bg-emerald-50 p-5 text-center">
        <p className="text-lg font-extrabold text-emerald-700">
          확인이 완료되었습니다.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          소중한 확인 감사합니다. 더 나은 서비스로 보답하겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-800">
          고객 보호 안내
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-700">
          실제 결제금액 확인은 과오청구 방지와 서비스 품질관리를 위해 필요합니다.
          30초만 확인 부탁드립니다.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          실제 결제하신 금액
        </label>

        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="예: 80000"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          기사님의 서비스는 만족스러우셨나요?
        </label>

        <select
          value={serviceScore}
          onChange={(event) => setServiceScore(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-emerald-500"
        >
          <option value="5">5점 - 매우 만족</option>
          <option value="4">4점 - 만족</option>
          <option value="3">3점 - 보통</option>
          <option value="2">2점 - 불만족</option>
          <option value="1">1점 - 매우 불만족</option>
        </select>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          냉매/가스 충전을 받으셨나요?
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setGasCharged("yes")}
            className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
              gasCharged === "yes"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            예
          </button>

          <button
            type="button"
            onClick={() => {
              setGasCharged("no");
              setGasExplained("");
            }}
            className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
              gasCharged === "no"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            아니오
          </button>
        </div>
      </div>

      {gasCharged === "yes" && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            냉매/가스는 정상 상태에서 계속 줄어드는 소모품이 아니며,
            부족한 경우 누설 가능성이 있다는 설명을 들으셨나요?
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGasExplained("yes")}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                gasExplained === "yes"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              예
            </button>

            <button
              type="button"
              onClick={() => setGasExplained("no")}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                gasExplained === "no"
                  ? "border-rose-500 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              아니오
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          현장에서 불편했던 점이나 추가 의견이 있으신가요?
        </label>

        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          rows={3}
          placeholder="없으면 비워두셔도 됩니다."
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {error && (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? "저장 중..." : "확인 완료"}
      </button>
    </form>
  );
}