/**
 * Mock district-level macro/market snapshot.
 * Real source: 한국부동산원 시장동향 + Bank of Korea regional statistics.
 */

import type {
  MacroMicroConnector,
  MacroMicroSnapshot
} from '@/lib/services/public-data/types';

type DistrictStats = {
  match: RegExp;
  metroRegion: string;
  vacancy: number;
  rentGrowth: number;
  capRate: number;
  constructionPerSqm: number;
  notes: string;
};

const STATS: DistrictStats[] = [
  { match: /강남|서초|송파/, metroRegion: '서울 강남권', vacancy: 4.2, rentGrowth: 3.1, capRate: 4.8, constructionPerSqm: 4_800_000, notes: 'Gangnam triangle — lowest vacancy, 5% rent growth on luxury retail corridors.' },
  { match: /중구|종로|용산/, metroRegion: '서울 도심권', vacancy: 6.5, rentGrowth: 2.2, capRate: 5.2, constructionPerSqm: 4_500_000, notes: 'CBD — stable occupancy, renovation activity in older office stock.' },
  { match: /영등포|여의도/, metroRegion: '서울 여의도권', vacancy: 7.0, rentGrowth: 1.8, capRate: 5.4, constructionPerSqm: 4_600_000, notes: 'Yeouido — finance cluster, new supply pipeline weighing on rents.' },
  { match: /성동|광진/, metroRegion: '서울 성수권', vacancy: 4.8, rentGrowth: 4.5, capRate: 5.5, constructionPerSqm: 4_200_000, notes: 'Seongsu — IT/fashion cluster, strong growth, gentrification premium.' },
  { match: /금천|구로/, metroRegion: '서울 서남권', vacancy: 8.2, rentGrowth: 0.5, capRate: 6.0, constructionPerSqm: 3_800_000, notes: 'G밸리 — IT SME cluster, weak 2025 absorption.' },
  { match: /강서|마곡/, metroRegion: '서울 서남권', vacancy: 6.2, rentGrowth: 2.8, capRate: 5.8, constructionPerSqm: 4_000_000, notes: 'Magok — life science + R&D cluster maturing.' },
  { match: /평택/, metroRegion: '경기 남부', vacancy: 11.5, rentGrowth: 1.2, capRate: 6.5, constructionPerSqm: 3_400_000, notes: 'Pyeongtaek — logistics/semi cluster, absorption tied to Samsung Godeok campus.' },
  { match: /파주/, metroRegion: '경기 서북부', vacancy: 10.8, rentGrowth: 0.8, capRate: 6.8, constructionPerSqm: 3_200_000, notes: 'Paju — display + logistics belt, LG 의존도 높음.' },
  { match: /안성|이천|용인/, metroRegion: '경기 남부', vacancy: 9.5, rentGrowth: 2.5, capRate: 6.3, constructionPerSqm: 3_300_000, notes: 'SK/Samsung semi corridor — DC/logistics co-location advantage.' },
  { match: /인천/, metroRegion: '인천', vacancy: 8.5, rentGrowth: 2.0, capRate: 6.0, constructionPerSqm: 3_500_000, notes: 'IFEZ (Songdo) premium; legacy industrial districts softer.' }
];

export class MockMacroMicro implements MacroMicroConnector {
  async fetch(district: string, _metroHint: string): Promise<MacroMicroSnapshot> {
    const stat = STATS.find((s) => s.match.test(district)) ?? {
      metroRegion: '전국',
      vacancy: 9.0,
      rentGrowth: 1.5,
      capRate: 6.5,
      constructionPerSqm: 3_200_000,
      notes: 'Default national benchmark.'
    };
    return {
      district,
      metroRegion: stat.metroRegion,
      submarketVacancyPct: stat.vacancy,
      submarketRentGrowthPct: stat.rentGrowth,
      submarketCapRatePct: stat.capRate,
      submarketInflationPct: 2.3,
      constructionCostPerSqmKrw: stat.constructionPerSqm,
      notes: stat.notes
    };
  }
}
