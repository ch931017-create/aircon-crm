// 카카오맵 JavaScript SDK 동적 로더.
// - 한 번만 <script>를 head에 추가하고, 같은 promise를 캐싱하여 중복 로드 방지
// - window.kakao.maps.load() 콜백 안에서 resolve하므로
//   호출자는 안전하게 kakao.maps.* 객체를 즉시 사용 가능
//
// NEXT_PUBLIC_KAKAO_MAP_KEY (JavaScript 키)만 사용. REST 키 사용 금지.

let loadingPromise: Promise<void> | null = null;

export function loadKakaoMap(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadKakaoMap called on server"));
  }

  const w = window as unknown as { kakao?: { maps?: unknown } };
  if (w.kakao?.maps) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!apiKey) {
      reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY is not configured"));
      loadingPromise = null;
      return;
    }

    const existing = document.querySelector(
      'script[data-kakao-map="sdk"]',
    ) as HTMLScriptElement | null;

    const onScriptLoaded = () => {
      const kakao = (window as unknown as {
        kakao?: { maps: { load: (cb: () => void) => void } };
      }).kakao;
      if (!kakao?.maps) {
        reject(new Error("kakao.maps not present after SDK load"));
        return;
      }
      kakao.maps.load(() => resolve());
    };

    if (existing) {
      existing.addEventListener("load", onScriptLoaded, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Kakao SDK script error")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.dataset.kakaoMap = "sdk";
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
    script.addEventListener("load", onScriptLoaded, { once: true });
    script.addEventListener(
      "error",
      () => {
        reject(new Error("Kakao SDK script error"));
        loadingPromise = null;
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return loadingPromise;
}
