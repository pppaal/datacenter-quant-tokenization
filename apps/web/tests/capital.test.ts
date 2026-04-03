import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommitmentMath, buildFundDashboard, buildFundOperatorBriefs } from '@/lib/services/capital';

test('buildCommitmentMath summarizes commitments, calls, distributions, and dry powder', () => {
  const math = buildCommitmentMath({
    targetSizeKrw: 800_000_000_000,
    committedCapitalKrw: null,
    investedCapitalKrw: null,
    dryPowderKrw: null,
    commitments: [
      { commitmentKrw: 320_000_000_000, calledKrw: 208_000_000_000, distributedKrw: 22_000_000_000 },
      { commitmentKrw: 210_000_000_000, calledKrw: 134_000_000_000, distributedKrw: 8_000_000_000 }
    ],
    capitalCalls: [
      { amountKrw: 42_000_000_000, status: 'ISSUED' },
      { amountKrw: 12_000_000_000, status: 'FUNDED' }
    ],
    distributions: [{ amountKrw: 30_000_000_000, status: 'PAID' }, { amountKrw: 5_000_000_000, status: 'PLANNED' }]
  } as any);

  assert.equal(math.totalCommitmentKrw, 530_000_000_000);
  assert.equal(math.totalCalledKrw, 342_000_000_000);
  assert.equal(math.totalDistributedKrw, 30_000_000_000);
  assert.equal(math.unfundedCommitmentKrw, 188_000_000_000);
  assert.equal(math.pendingCallsKrw, 42_000_000_000);
  assert.equal(math.pendingDistributionsKrw, 5_000_000_000);
});

test('buildFundDashboard produces investor-update-ready summary', () => {
  const dashboard = buildFundDashboard({
    id: 'fund-1',
    name: 'Han River Real Estate Fund I',
    commitments: [
      {
        id: 'commitment-1',
        commitmentKrw: 320_000_000_000,
        calledKrw: 208_000_000_000,
        distributedKrw: 22_000_000_000,
        investor: { name: 'Han River Pension' },
        vehicle: null
      },
      {
        id: 'commitment-2',
        commitmentKrw: 210_000_000_000,
        calledKrw: 134_000_000_000,
        distributedKrw: 8_000_000_000,
        investor: { name: 'Seoul Endowment Management' },
        vehicle: null
      }
    ],
    capitalCalls: [{ callDate: new Date('2026-02-10'), amountKrw: 42_000_000_000, purpose: 'Capex and leasing reserves', status: 'ISSUED' }],
    distributions: [{ distributionDate: new Date('2026-03-20'), amountKrw: 30_000_000_000, status: 'PAID' }],
    investorReports: [{ title: 'Q1 2026 Investor Update' }],
    ddqResponses: [],
    mandates: [],
    vehicles: [],
    targetSizeKrw: 850_000_000_000,
    committedCapitalKrw: 530_000_000_000,
    investedCapitalKrw: 342_000_000_000,
    dryPowderKrw: 188_000_000_000
  } as any);

  assert.equal(dashboard.topInvestors[0].investor.name, 'Han River Pension');
  assert.ok(dashboard.investorUpdateDraft.includes('Han River Real Estate Fund I'));
  assert.ok(dashboard.investorUpdateDraft.includes('Q1 2026 Investor Update'));
});

test('buildFundOperatorBriefs produces capital and investor coverage summaries', () => {
  const fund = {
    id: 'fund-1',
    name: 'Han River Real Estate Fund I',
    commitments: [
      {
        id: 'commitment-1',
        commitmentKrw: 320_000_000_000,
        calledKrw: 208_000_000_000,
        distributedKrw: 22_000_000_000,
        investor: { name: 'Han River Pension', investorType: 'Pension' },
        vehicle: null
      }
    ],
    capitalCalls: [{ callDate: new Date('2026-02-10'), amountKrw: 42_000_000_000, purpose: 'Capex and leasing reserves', status: 'ISSUED' }],
    distributions: [],
    investorReports: [{ title: 'Q1 2026 Investor Update', publishedAt: null }],
    ddqResponses: [{ title: 'Operational DDQ', statusLabel: 'DRAFT' }],
    mandates: [],
    vehicles: [],
    targetSizeKrw: 850_000_000_000,
    committedCapitalKrw: 530_000_000_000,
    investedCapitalKrw: 342_000_000_000,
    dryPowderKrw: 188_000_000_000
  } as any;

  const dashboard = buildFundDashboard(fund);
  const briefs = buildFundOperatorBriefs(fund, dashboard);

  assert.ok(briefs.capitalActivityBrief.includes('Han River Real Estate Fund I'));
  assert.ok(briefs.investorCoverageBrief.includes('Han River Pension'));
  assert.ok(briefs.investorUpdateDraft.includes('capital call'));
});

test('buildFundDashboard carries linked portfolio research into investor update draft', () => {
  const dashboard = buildFundDashboard({
    id: 'fund-2',
    name: 'Seoul Office Income Fund',
    commitments: [],
    capitalCalls: [],
    distributions: [],
    investorReports: [],
    ddqResponses: [],
    mandates: [],
    vehicles: [],
    portfolio: {
      assets: [
        {
          asset: {
            id: 'asset-1',
            name: 'Yeouido Core Office Tower',
            assetCode: 'SEOUL-YEOUIDO-01',
            assetClass: 'OFFICE',
            market: 'KR',
            address: { city: 'Seoul', province: 'Seoul', country: 'KR' },
            siteProfile: { siteNotes: 'Prime office corridor' },
            buildingSnapshot: { structureDescription: 'High-rise office tower' },
            marketSnapshot: { metroRegion: 'Seoul CBD', vacancyPct: 7.2, marketNotes: 'Office leasing remains disciplined.' },
            macroFactors: [],
            macroSeries: [],
            marketIndicatorSeries: [
              {
                id: 'indicator-1',
                indicatorKey: 'office.vacancy_pct',
                label: 'Office Vacancy',
                value: 7.2,
                observationDate: new Date('2026-03-01')
              }
            ],
            transactionComps: [],
            rentComps: [],
            pipelineProjects: [],
            ownershipRecords: [],
            encumbranceRecords: [],
            planningConstraints: [],
            leases: [],
            debtFacilities: [],
            taxAssumption: null,
            documents: [
              {
                id: 'doc-1',
                currentVersion: 1,
                title: 'Office rent roll',
                documentType: 'LEASE',
                updatedAt: new Date(),
                documentHash: 'abc'
              }
            ],
            valuations: [],
            readinessProject: { onchainRecords: [] },
            energySnapshot: null,
            permitSnapshot: null,
            featureSnapshots: [],
            researchSnapshots: [],
            coverageTasks: []
          }
        }
      ]
    }
  } as any);

  assert.ok(dashboard.investorUpdateDraft.includes('Yeouido Core Office Tower'));
  assert.ok(dashboard.investorUpdateDraft.includes('Office Vacancy 7.2%'));
});
