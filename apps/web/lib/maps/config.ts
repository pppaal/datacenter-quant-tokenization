import { env } from '@/lib/env';

export type MapProviderConfig =
  | { provider: 'kakao'; kakaoApiKey: string }
  | { provider: 'leaflet' };

/**
 * Resolves which map provider the property explorer should render with.
 * Kakao wins when a public JS key is configured (best Korean coverage);
 * otherwise we fall back to Leaflet + OpenStreetMap, which needs no key.
 */
export function getMapProviderConfig(): MapProviderConfig {
  const kakaoApiKey = env().KAKAO_MAP_API_KEY;
  if (kakaoApiKey) {
    return { provider: 'kakao', kakaoApiKey };
  }
  return { provider: 'leaflet' };
}
