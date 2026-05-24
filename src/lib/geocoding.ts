// 클라이언트 컴포넌트에서 실수로 import하면 Next.js 빌드가 실패합니다.
// (KAKAO_REST_API_KEY가 client bundle에 들어가는 것을 차단)
import "server-only";

// 카카오 로컬 API: 주소 검색 (Geocoding)
// 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord
const KAKAO_GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json";

export interface GeocodeResult {
  lat: number;
  lng: number;
  addressName?: string;
}

interface KakaoAddressDocument {
  address_name?: string;
  x?: string; // 경도 (longitude) — 문자열로 옴
  y?: string; // 위도 (latitude)
}

interface KakaoAddressResponse {
  documents?: KakaoAddressDocument[];
}

/**
 * 주소 문자열을 좌표로 변환.
 *
 * 어떠한 실패도 throw하지 않음 (콜 등록 흐름을 방해하지 않기 위함):
 *   - API key 미설정 → null
 *   - 빈 주소 → null
 *   - 카카오 API 비정상 응답 → null
 *   - 검색 결과 없음 → null
 *   - 좌표 파싱 실패 → null
 *   - 네트워크 오류 → null
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return null;
  }

  const query = address?.trim();
  if (!query) {
    return null;
  }

  try {
    const url = `${KAKAO_GEOCODE_URL}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as KakaoAddressResponse;
    const first = data.documents?.[0];
    if (!first?.x || !first?.y) {
      return null;
    }

    const lat = Number.parseFloat(first.y);
    const lng = Number.parseFloat(first.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      lat,
      lng,
      addressName: first.address_name,
    };
  } catch {
    return null;
  }
}
