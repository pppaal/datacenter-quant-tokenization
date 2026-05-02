import {
  AssetClass,
  ResearchApprovalStatus,
  ResearchViewType,
  SourceStatus,
  type Prisma,
  type PrismaClient
} from '@prisma/client';

/**
 * Seeds the research workspace (market universes, submarkets, snapshots,
 * macro factors). Depends on assets being seeded first; mappings are
 * resolved by `Asset.name`.
 */
export async function seedResearchAndMacro(prisma: PrismaClient): Promise<void> {
  const assets = await prisma.asset.findMany({ select: { id: true, name: true } });
  const assetByName = Object.fromEntries(assets.map((a) => [a.name, a.id]));

  // --- MarketUniverse ---
  const muOffice = await prisma.marketUniverse.create({
    data: {
      marketKey: 'kr-office',
      label: 'Korea Prime Office',
      country: 'KR',
      assetClass: AssetClass.OFFICE,
      thesis:
        'Grade-A offices across Seoul metro, anchored by Yeouido, CBD, and Gangnam. Rent growth 3-5% with vacancy compression through 2026.',
      statusLabel: 'ACTIVE'
    }
  });
  const muDc = await prisma.marketUniverse.create({
    data: {
      marketKey: 'kr-datacenter',
      label: 'Korea Hyperscale Data Center',
      country: 'KR',
      assetClass: AssetClass.DATA_CENTER,
      thesis:
        'Hyperscale AI training and cloud-infrastructure demand absorbed 340MW in 2025. Power queue and cost inflation are the binding constraints.',
      statusLabel: 'ACTIVE'
    }
  });
  const muInd = await prisma.marketUniverse.create({
    data: {
      marketKey: 'kr-industrial',
      label: 'Korea Logistics & Industrial',
      country: 'KR',
      assetClass: AssetClass.INDUSTRIAL,
      thesis:
        'Cold-chain and last-mile demand remain supportive; new supply wave digesting in Gyeonggi-do through 2026.',
      statusLabel: 'ACTIVE'
    }
  });

  // --- Submarkets ---
  const smCbd = await prisma.submarket.create({
    data: {
      marketUniverseId: muOffice.id,
      submarketKey: 'seoul-cbd',
      label: 'Seoul CBD',
      city: 'Seoul',
      district: 'Jung-gu',
      assetClass: AssetClass.OFFICE,
      thesis: 'Prime legacy office core. Stable anchor tenants, limited new supply through 2027.',
      statusLabel: 'ACTIVE'
    }
  });
  const smYdp = await prisma.submarket.create({
    data: {
      marketUniverseId: muOffice.id,
      submarketKey: 'seoul-yeouido',
      label: 'Seoul Yeouido',
      city: 'Seoul',
      district: 'Yeongdeungpo-gu',
      assetClass: AssetClass.OFFICE,
      thesis:
        'Financial district, vacancy below 5%, domestic tenant rotation from Gangnam improving absorption.',
      statusLabel: 'ACTIVE'
    }
  });
  const smGng = await prisma.submarket.create({
    data: {
      marketUniverseId: muOffice.id,
      submarketKey: 'seoul-gangnam',
      label: 'Seoul Gangnam',
      city: 'Seoul',
      district: 'Gangnam-gu',
      assetClass: AssetClass.OFFICE,
      thesis: 'Tech tenant rotation driving 4.8% vacancy, rent resistance past KRW 160k/pyeong.',
      statusLabel: 'ACTIVE'
    }
  });
  const smPgy = await prisma.submarket.create({
    data: {
      marketUniverseId: muOffice.id,
      submarketKey: 'seongnam-pangyo',
      label: 'Seongnam Pangyo',
      city: 'Seongnam',
      district: 'Bundang-gu',
      assetClass: AssetClass.OFFICE,
      thesis:
        'Tech-campus submarket, dominated by Naver, Kakao, and Nexon tenants. 10% discount to CBD face rents.',
      statusLabel: 'ACTIVE'
    }
  });
  const smInc = await prisma.submarket.create({
    data: {
      marketUniverseId: muDc.id,
      submarketKey: 'incheon-cheongna',
      label: 'Incheon Cheongna',
      city: 'Incheon',
      district: 'Seo-gu',
      assetClass: AssetClass.DATA_CENTER,
      thesis:
        'Greenfield hyperscale cluster, grid allocations prioritized under 2025 MOTIE framework.',
      statusLabel: 'ACTIVE'
    }
  });
  const smGyg = await prisma.submarket.create({
    data: {
      marketUniverseId: muDc.id,
      submarketKey: 'gyeonggi-anseong',
      label: 'Gyeonggi Anseong',
      city: 'Anseong',
      assetClass: AssetClass.DATA_CENTER,
      thesis:
        'Power-abundant second-ring submarket, 18-month substation lead time is the binding constraint.',
      statusLabel: 'ACTIVE'
    }
  });
  const smBsn = await prisma.submarket.create({
    data: {
      marketUniverseId: muDc.id,
      submarketKey: 'busan-myeongji',
      label: 'Busan Myeongji',
      city: 'Busan',
      district: 'Gangseo-gu',
      assetClass: AssetClass.DATA_CENTER,
      thesis: 'Secondary edge-compute cluster for content delivery and telco MEC workloads.',
      statusLabel: 'ACTIVE'
    }
  });

  // --- Official-source snapshots (Macro tab) ---
  await prisma.researchSnapshot.createMany({
    data: [
      {
        snapshotKey: 'kr/official/bok-base-rate/2026-03',
        snapshotType: 'official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'BOK Base Rate Hold — March 2026',
        summary:
          'Bank of Korea held the base rate at 3.25% on March 13, 2026. Guidance shifted dovish; 25bp cut now priced for May meeting. Core CPI 2.9% YoY.',
        snapshotDate: new Date('2026-03-13'),
        sourceSystem: 'bok',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Official release 2026-03-13',
        approvedAt: new Date('2026-03-14'),
        metrics: { base_rate_pct: 3.25, core_cpi_yoy_pct: 2.9 },
        provenance: { sources: ['BOK MPB Minutes'], document_id: 'BOK-MPB-2026-03' }
      },
      {
        snapshotKey: 'kr/official/kosis-office-vacancy/2026-03',
        snapshotType: 'official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'KOSIS — Seoul Metro Office Vacancy Q1 2026',
        summary:
          'KOSIS/REB Q1 2026: Seoul metro Grade-A vacancy 5.8% (-40bps YoY). Face rent index 118.4 (2020=100), +3.9% YoY. Pipeline 2026-2028 limited to 410k sqm.',
        snapshotDate: new Date('2026-03-28'),
        sourceSystem: 'kosis',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Official release 2026-03-28',
        approvedAt: new Date('2026-03-29'),
        metrics: { vacancy_pct: 5.8, rent_index: 118.4, pipeline_sqm: 410000 },
        provenance: { sources: ['KOSIS', 'REB'], release_id: 'REB-2026Q1-OFFICE' }
      },
      {
        snapshotKey: 'kr/official/motie-dc-grid/2026-03',
        snapshotType: 'official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'MOTIE — Data Center Grid Allocation Framework',
        summary:
          'MOTIE finalized 2025 framework for hyperscale DC grid allocations. Incheon/Gyeonggi priority queues confirmed. Substation approvals 18-month lead time.',
        snapshotDate: new Date('2026-03-20'),
        sourceSystem: 'motie',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Official release 2026-03-20',
        approvedAt: new Date('2026-03-21'),
        metrics: { queue_months: 18, priority_zones: 3 },
        provenance: { sources: ['MOTIE Notice 2026-0312'] }
      }
    ]
  });

  // --- Market-official-source snapshots (linked to MarketUniverse) ---
  await prisma.researchSnapshot.createMany({
    data: [
      {
        snapshotKey: 'kr-office/macro/2026-03',
        snapshotType: 'market-official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muOffice.id,
        title: 'Korea Office — Macro Snapshot',
        summary:
          'BOK base rate 3.25%. Seoul metro Grade-A vacancy 5.8%, down 40bps YoY. Face rent growth 4.3% YoY. Cap rate 4.4% on prime stock.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'kosis',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { base_rate_pct: 3.25, metro_vacancy_pct: 5.8, prime_cap_rate_pct: 4.4 },
        provenance: { sources: ['KOSIS', 'REB'] }
      },
      {
        snapshotKey: 'kr-datacenter/macro/2026-03',
        snapshotType: 'market-official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muDc.id,
        title: 'Korea Hyperscale DC — Macro Snapshot',
        summary:
          '1.2GW commissioned metro capacity. 340MW absorbed in 2025. Substation queue 18 months. MEP construction cost 7.2% YoY.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'seed',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { commissioned_mw: 1200, absorbed_mw_2025: 340, power_queue_months: 18 },
        provenance: { sources: ['KPX', 'Internal'] }
      },
      {
        snapshotKey: 'kr-industrial/macro/2026-03',
        snapshotType: 'market-official-source',
        viewType: ResearchViewType.SOURCE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muInd.id,
        title: 'Korea Logistics — Macro Snapshot',
        summary:
          'Gyeonggi vacancy 9.1% with new supply digesting; cold-chain demand keeps prime below 4%. Avg rent KRW 32k/pyeong/mo.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'seed',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { gyeonggi_vacancy_pct: 9.1, avg_rent_krw_pyeong: 32000 },
        provenance: { sources: ['JLL', 'Internal'] }
      }
    ]
  });

  // --- Market-thesis snapshots ---
  await prisma.researchSnapshot.createMany({
    data: [
      {
        snapshotKey: 'kr-office/thesis/2026-03',
        snapshotType: 'market-thesis',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muOffice.id,
        title: 'Korea Office — House Thesis Q1 2026',
        summary:
          'Overweight Seoul CBD and Yeouido. Tenant rotation from Gangnam sustainable through 2027. Underwrite effective rent growth at 3.5%.',
        snapshotDate: new Date('2026-03-26'),
        sourceSystem: 'internal',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Approved 2026-03-26',
        approvedAt: new Date('2026-03-27'),
        metrics: { rating: 'overweight', conviction: 4 },
        provenance: { sources: ['Internal research'] }
      },
      {
        snapshotKey: 'kr-datacenter/thesis/2026-03',
        snapshotType: 'market-thesis',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muDc.id,
        title: 'Korea Hyperscale DC — House Thesis Q1 2026',
        summary:
          'Strong overweight on power-secured greenfield. Avoid speculative land without grid allocation. Target 7.0% development yield on cost.',
        snapshotDate: new Date('2026-03-26'),
        sourceSystem: 'internal',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Approved 2026-03-26',
        approvedAt: new Date('2026-03-27'),
        metrics: { rating: 'strong_overweight', target_doc_pct: 7.0 },
        provenance: { sources: ['Internal research'] }
      },
      {
        snapshotKey: 'kr-industrial/thesis/2026-03',
        snapshotType: 'market-thesis',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        marketUniverseId: muInd.id,
        title: 'Korea Logistics — House Thesis Q1 2026',
        summary:
          'Neutral. Cold-chain prime remains attractive but Gyeonggi new supply wave extends lease-up to 9 months. Selective acquisition only.',
        snapshotDate: new Date('2026-03-26'),
        sourceSystem: 'internal',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Approved 2026-03-26',
        approvedAt: new Date('2026-03-27'),
        metrics: { rating: 'neutral', conviction: 3 },
        provenance: { sources: ['Internal research'] }
      }
    ]
  });

  // --- Submarket-thesis snapshots ---
  const smDefs = [
    {
      id: smCbd.id,
      key: 'seoul-cbd',
      label: 'Seoul CBD',
      metrics: { vacancy_pct: 6.4, face_rent_krw_pyeong: 158000 }
    },
    {
      id: smYdp.id,
      key: 'seoul-yeouido',
      label: 'Yeouido',
      metrics: { vacancy_pct: 4.2, face_rent_krw_pyeong: 142000 }
    },
    {
      id: smGng.id,
      key: 'seoul-gangnam',
      label: 'Gangnam',
      metrics: { vacancy_pct: 4.8, face_rent_krw_pyeong: 162000 }
    },
    {
      id: smPgy.id,
      key: 'seongnam-pangyo',
      label: 'Pangyo',
      metrics: { vacancy_pct: 5.1, in_place_rent_krw_pyeong: 118000 }
    },
    {
      id: smInc.id,
      key: 'incheon-cheongna',
      label: 'Incheon Cheongna',
      metrics: { pipeline_mw: 120 }
    },
    {
      id: smGyg.id,
      key: 'gyeonggi-anseong',
      label: 'Gyeonggi Anseong',
      metrics: { substation_queue_months: 18 }
    },
    { id: smBsn.id, key: 'busan-myeongji', label: 'Busan Myeongji', metrics: { planned_mw: 80 } }
  ];
  const submarketSnapshots: Prisma.ResearchSnapshotCreateManyInput[] = smDefs.map((s) => ({
    snapshotKey: `${s.key}/submarket/2026-03`,
    snapshotType: 'submarket-thesis',
    viewType: ResearchViewType.SOURCE,
    approvalStatus: ResearchApprovalStatus.APPROVED,
    submarketId: s.id,
    title: `${s.label} — Submarket Snapshot`,
    summary: `${s.label} submarket data seeded for research workspace.`,
    snapshotDate: new Date('2026-03-25'),
    sourceSystem: 'seed',
    freshnessStatus: SourceStatus.FRESH,
    freshnessLabel: 'Updated 2026-03-25',
    approvedAt: new Date('2026-03-26'),
    metrics: s.metrics,
    provenance: { sources: ['Seed'] }
  }));
  await prisma.researchSnapshot.createMany({ data: submarketSnapshots });

  // --- Asset dossier snapshots ---
  const ydpId = assetByName['Yeouido Core Office Tower'];
  const shcId = assetByName['Seoul Hyperscale Campus I'];
  const incId = assetByName['Incheon AI Colocation Campus'];
  const pgyId = assetByName['Pangyo Innovation Office Park'];
  const becId = assetByName['Busan Edge Compute Park'];

  const assetDossiers: Prisma.ResearchSnapshotCreateManyInput[] = [];
  if (ydpId) {
    assetDossiers.push(
      {
        snapshotKey: 'yeouido-core-office-tower/macro/2026-03',
        assetId: ydpId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Seoul CBD Macro View — Q1 2026',
        summary:
          'BOK base rate held at 3.25%. Office vacancy compressed 30bps QoQ to 6.4%. Construction cost index up 6.1% YoY.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'kosis',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { vacancy_pct: 6.4, rental_growth_yoy_pct: 3.8, construction_cost_yoy_pct: 6.1 },
        provenance: { sources: ['KOSIS', 'REB'] }
      },
      {
        snapshotKey: 'yeouido-core-office-tower/submarket/2026-03',
        assetId: ydpId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Yeouido Submarket Brief — Q1 2026',
        summary:
          'Grade-A stock 1.28M sqm with 4.2% vacancy. Average face rent KRW 142k/pyeong/mo, up 5.1% YoY.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'seed',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { grade_a_vacancy_pct: 4.2, face_rent_krw_pyeong: 142000 },
        provenance: { sources: ['JLL Seoul', 'CBRE Research'] }
      },
      {
        snapshotKey: 'yeouido-core-office-tower/dossier/2026-03',
        assetId: ydpId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Yeouido Core — Asset Underwriting Memo',
        summary:
          'Stabilized NOI KRW 21.3bn, in-place cap rate 4.35%, 3-year WALT. Anchor tenant renewal at +7% in March 2026.',
        snapshotDate: new Date('2026-03-20'),
        sourceSystem: 'internal',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Approved 2026-03-20',
        approvedAt: new Date('2026-03-21'),
        metrics: { stabilized_noi_krw_bn: 21.3, in_place_cap_rate_pct: 4.35, walt_years: 3.0 },
        provenance: { sources: ['Internal underwriting'], review_packet: 'RP-YDP-2026Q1' }
      }
    );
  }
  if (shcId) {
    assetDossiers.push(
      {
        snapshotKey: 'seoul-hyperscale-campus-i/macro/2026-03',
        assetId: shcId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Korea Hyperscale Macro — Q1 2026',
        summary:
          'AI training demand absorbed 340MW in 2025. Power approval queue tightened — 18-month critical path. MEP cost 7.2% YoY.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'seed',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { absorbed_mw_2025: 340, power_queue_months: 18, mep_cost_yoy_pct: 7.2 },
        provenance: { sources: ['KPX', 'Internal origination'] }
      },
      {
        snapshotKey: 'seoul-hyperscale-campus-i/submarket/2026-03',
        assetId: shcId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Seoul Metro Hyperscale Cluster Brief',
        summary:
          'Gyeonggi-Incheon cluster 1.2GW commissioned. Vacancy sub-2%. PUE leaders 1.32, laggards 1.51.',
        snapshotDate: new Date('2026-03-25'),
        sourceSystem: 'seed',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Updated 2026-03-25',
        approvedAt: new Date('2026-03-26'),
        metrics: { commissioned_mw: 1200, vacancy_pct: 1.8, best_pue: 1.32 },
        provenance: { sources: ['Structure Research', 'Internal'] }
      },
      {
        snapshotKey: 'seoul-hyperscale-campus-i/dossier/2026-03',
        assetId: shcId,
        snapshotType: 'asset-dossier',
        viewType: ResearchViewType.HOUSE,
        approvalStatus: ResearchApprovalStatus.APPROVED,
        title: 'Seoul Hyperscale I — Underwriting Memo',
        summary:
          'Phase-1 72MW commissioned Jan 2026, 95% pre-let. Stabilized NOI KRW 48bn, entry yield 6.15%.',
        snapshotDate: new Date('2026-03-22'),
        sourceSystem: 'internal',
        freshnessStatus: SourceStatus.FRESH,
        freshnessLabel: 'Approved 2026-03-22',
        approvedAt: new Date('2026-03-23'),
        metrics: { phase1_mw: 72, stabilized_noi_krw_bn: 48, entry_yield_pct: 6.15 },
        provenance: { sources: ['Internal underwriting'], review_packet: 'RP-SHC-2026Q1' }
      }
    );
  }
  if (incId) {
    assetDossiers.push({
      snapshotKey: 'incheon-ai-colocation-campus/dossier/2026-03',
      assetId: incId,
      snapshotType: 'asset-dossier',
      viewType: ResearchViewType.HOUSE,
      approvalStatus: ResearchApprovalStatus.APPROVED,
      title: 'Incheon AI Colocation — Underwriting Memo',
      summary:
        'Greenfield 120MW planned. Grid allocation confirmed Feb 2026; LOI covers 45MW. Development yield target 6.8%.',
      snapshotDate: new Date('2026-03-18'),
      sourceSystem: 'internal',
      freshnessStatus: SourceStatus.FRESH,
      freshnessLabel: 'Approved 2026-03-18',
      approvedAt: new Date('2026-03-19'),
      metrics: { planned_mw: 120, loi_coverage_mw: 45, development_yield_pct: 6.8 },
      provenance: { sources: ['Internal origination'] }
    });
  }
  if (pgyId) {
    assetDossiers.push({
      snapshotKey: 'pangyo-innovation-office-park/dossier/2026-03',
      assetId: pgyId,
      snapshotType: 'asset-dossier',
      viewType: ResearchViewType.HOUSE,
      approvalStatus: ResearchApprovalStatus.APPROVED,
      title: 'Pangyo Innovation Office — Underwriting Memo',
      summary:
        'Tech-heavy tenant mix. In-place rent KRW 118k/pyeong, 10% below CBD. 91% occupancy.',
      snapshotDate: new Date('2026-03-15'),
      sourceSystem: 'internal',
      freshnessStatus: SourceStatus.FRESH,
      freshnessLabel: 'Approved 2026-03-15',
      approvedAt: new Date('2026-03-16'),
      metrics: { occupancy_pct: 91, in_place_rent_krw_pyeong: 118000 },
      provenance: { sources: ['Internal underwriting'] }
    });
  }
  if (becId) {
    assetDossiers.push({
      snapshotKey: 'busan-edge-compute-park/dossier/2026-03',
      assetId: becId,
      snapshotType: 'asset-dossier',
      viewType: ResearchViewType.HOUSE,
      approvalStatus: ResearchApprovalStatus.DRAFT,
      title: 'Busan Edge Compute Park — Early Screen',
      summary:
        'Secondary metro edge-compute play. Land basis attractive but tenant demand thinner — 18-month lease-up.',
      snapshotDate: new Date('2026-03-10'),
      sourceSystem: 'internal',
      freshnessStatus: SourceStatus.FRESH,
      freshnessLabel: 'Draft 2026-03-10',
      metrics: { planned_mw: 36, tenant_demand_score: 4 },
      provenance: { sources: ['Internal origination'] }
    });
  }
  if (assetDossiers.length > 0) {
    await prisma.researchSnapshot.createMany({ data: assetDossiers });
  }

  // --- MacroFactor seed ---
  const macroFactorData: Prisma.MacroFactorCreateManyInput[] = [];
  const factorDefs = [
    { key: 'inflation_trend', label: 'CPI YoY', unit: '%' },
    { key: 'rate_level', label: 'Base Rate', unit: '%' },
    { key: 'rate_momentum_bps', label: 'Rate Momentum', unit: 'bps' },
    { key: 'credit_stress', label: 'Credit Spread', unit: 'bps' },
    { key: 'liquidity', label: 'Liquidity Index', unit: 'idx' },
    { key: 'growth_momentum', label: 'GDP Nowcast', unit: '%' },
    { key: 'construction_pressure', label: 'Construction Cost', unit: '%' },
    { key: 'property_demand', label: 'Prime Demand Score', unit: 'score' }
  ] as const;
  const marketFactors: Record<
    string,
    { values: number[]; directions: string[]; commentaries: string[] }
  > = {
    'Seoul CBD': {
      values: [2.9, 3.25, -25, 135, 112, 2.4, 6.1, 18],
      directions: [
        'NEGATIVE',
        'NEGATIVE',
        'POSITIVE',
        'NEGATIVE',
        'POSITIVE',
        'POSITIVE',
        'NEGATIVE',
        'POSITIVE'
      ],
      commentaries: [
        'CPI trending above BOK target',
        'BOK base rate held at 3.25%',
        'Rate cuts now priced into the curve',
        'IG spreads widening on offshore supply',
        'Offshore dry powder still rotating into Seoul',
        'Service sector drove Q1 upside surprise',
        'Steel and labor still elevated vs 2024',
        'Core A-grade tenant demand remains thick'
      ]
    },
    Yeouido: {
      values: [2.9, 3.25, -25, 120, 104, 2.4, 5.8, 14],
      directions: [
        'NEGATIVE',
        'NEGATIVE',
        'POSITIVE',
        'NEGATIVE',
        'POSITIVE',
        'POSITIVE',
        'NEGATIVE',
        'POSITIVE'
      ],
      commentaries: [
        'Inflation slightly sticky but improving',
        'Same as national policy',
        'Easing bias supportive for financial district',
        'Financial sector spreads narrowing',
        'Domestic institutions active in Yeouido',
        'Q1 nowcast above trend',
        'Cost index elevated but stabilizing',
        'Financial tenant rotation supports rents'
      ]
    },
    Incheon: {
      values: [2.9, 3.25, -25, 140, 98, 2.4, 7.2, 22],
      directions: [
        'NEGATIVE',
        'NEGATIVE',
        'POSITIVE',
        'NEGATIVE',
        'NEGATIVE',
        'POSITIVE',
        'NEGATIVE',
        'POSITIVE'
      ],
      commentaries: [
        'Same national CPI read',
        'National policy',
        'Easing bias improves data center WACC',
        'Project-finance spreads still wide',
        'PF lenders selective on new starts',
        'National momentum supports demand',
        'Hyperscale build costs still under pressure',
        'AI training workloads drive hyperscale intake'
      ]
    }
  };

  for (const [market, data] of Object.entries(marketFactors)) {
    factorDefs.forEach((def, i) => {
      macroFactorData.push({
        market,
        factorKey: def.key,
        label: def.label,
        observationDate: new Date('2026-03-25'),
        value: data.values[i]!,
        unit: def.unit,
        direction: data.directions[i]!,
        commentary: data.commentaries[i]!,
        sourceSystem: 'seed',
        sourceStatus: SourceStatus.MANUAL,
        sourceUpdatedAt: new Date('2026-03-25')
      });
    });
  }
  await prisma.macroFactor.createMany({ data: macroFactorData });

  console.log(
    `Research seed: 3 markets, 7 submarkets, ${3 + 3 + 3 + submarketSnapshots.length + assetDossiers.length} snapshots, ${macroFactorData.length} macro factors.`
  );
}
