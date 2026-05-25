// 전체콜 페이지 스켈레톤 — server fetch 진행 중 즉시 표시.
// CSS only(animate-pulse) — 가벼움.
export default function Loading() {
  return (
    <section className="space-y-4">
      {/* 헤더: 제목 + 건수 + 등록/지도 버튼 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-8 w-20 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>

      {/* 필터 카드 (상태 배지 + 필터 설정 버튼) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[14, 14, 14, 14, 14].map((w, i) => (
            <div
              key={i}
              className={`h-6 animate-pulse rounded-full bg-slate-200`}
              style={{ width: `${w * 4}px` }}
            />
          ))}
          <div className="ml-auto h-6 w-32 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>

      {/* 콜 카드 7개 */}
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm sm:h-24 sm:rounded-2xl"
          />
        ))}
      </div>
    </section>
  );
}
