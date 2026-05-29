import { getMapProviderConfig } from '@/lib/maps/config';
import PropertyAnalyzePage from './analyze-client';

export default function Page() {
  return <PropertyAnalyzePage mapConfig={getMapProviderConfig()} />;
}
