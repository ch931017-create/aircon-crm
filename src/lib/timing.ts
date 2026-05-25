// 비동기 작업 소요 시간을 console.log로 측정하는 thin wrapper.
// server component / API route 에서 호출 시 Vercel Functions Logs에 남음.
// 형식: [timing] <label>: <ms>ms  (실패는 [timing] <label>: <ms>ms (failed) <error>)
//
// Promise.all 안의 각 query를 wrap하면 병렬성을 깨지 않고 개별 시간 측정 가능.
//   const [a, b] = await Promise.all([
//     timed("calls", supabase.from("calls").select(...)),
//     timed("profiles", supabase.from("profiles").select(...)),
//   ]);
// Supabase PostgrestBuilder는 Promise가 아니라 thenable이라
// 두 번째 인자를 PromiseLike<T>로 받아야 호환됨.
export async function timed<T>(label: string, p: PromiseLike<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await p;
    console.log(`[timing] ${label}: ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.warn(`[timing] ${label}: ${Date.now() - t0}ms (failed)`, err);
    throw err;
  }
}
