// 내 콜 페이지 스켈레톤
export default function Loading() {
  return (
    <section className="space-y-4">
      {/* 헤더 */}
      <div>
        <div className="h-6 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-200" />
      </div>

      {/* filterMine 필터 카드 (내 콜 / 위치 갱신 / 검색·날짜·정렬) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-44 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-7 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      </div>

      {/* 콜 카드 6개 */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm sm:h-24 sm:rounded-2xl"
          />
        ))}
      </div>
    </section>
  );
}
