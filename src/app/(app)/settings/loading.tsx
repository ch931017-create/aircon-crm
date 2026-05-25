// 알림 설정 페이지 스켈레톤
export default function Loading() {
  return (
    <section className="mx-auto max-w-xl space-y-5">
      <div>
        <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-200" />
      </div>

      {/* 카드 3개 (Web Push / 새 콜 알림 / 완료 알림) */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ))}
    </section>
  );
}
