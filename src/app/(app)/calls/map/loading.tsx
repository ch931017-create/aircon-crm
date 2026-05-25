// 콜 지도 페이지 스켈레톤
export default function Loading() {
  return (
    <section className="space-y-6">
      {/* 헤더 */}
      <div>
        <div className="h-6 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-80 animate-pulse rounded bg-slate-200" />
      </div>

      {/* 지도 영역 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-60 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
        {/* 지도 큰 박스 */}
        <div
          className="animate-pulse rounded-3xl border border-slate-200 bg-slate-100"
          style={{ height: 520 }}
        />
      </div>

      {/* 좌표 없는 콜 영역 (선택적으로 표시되지만 자리만 둠) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
