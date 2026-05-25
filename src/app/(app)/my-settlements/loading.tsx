// 내 정산 페이지 스켈레톤
export default function Loading() {
  return (
    <section className="space-y-4">
      {/* 헤더 */}
      <div>
        <div className="h-6 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-60 animate-pulse rounded bg-slate-200" />
      </div>

      {/* 필터 (월별 + 입금 상태) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>

      {/* 전체 요약 카드 6개 */}
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-24"
          />
        ))}
      </div>

      {/* 날짜 그룹 카드 4개 */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-28 sm:rounded-3xl"
          />
        ))}
      </div>
    </section>
  );
}
