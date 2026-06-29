import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCommitmentWithEligibility,
  type CreateCommitmentDeps
} from '@/lib/services/commitments';
import { CommitmentEligibilityError } from '@/lib/services/aml/eligibility';
import { buildInvestorComplianceView } from '@/lib/services/aml/investor-compliance-view';
import { formatPcapRow } from '@/lib/services/fund-nav-format';
import type { LpStatement } from '@/lib/services/fund-nav';

// ---------------------------------------------------------------------------
// Commitment-creation fake: tracks whether commitment.create was reached.
// ---------------------------------------------------------------------------
function makeCommitmentDb(opts: {
  accreditationStatus?: string | null;
  screeningStatus?: string | null;
  /** When set, the investor is wallet-linked → KYC resolves SERVER-SIDE. */
  wallet?: string | null;
  /** Latest KycRecord.status for that wallet (server-side KYC source). */
  kycRecordStatus?: string | null;
}): CreateCommitmentDeps & { created: unknown[] } {
  const created: unknown[] = [];
  return {
    created,
    investor: {
      async findUnique() {
        return {
          accreditationStatus: opts.accreditationStatus ?? null,
          wallet: opts.wallet ?? null
        } as never;
      }
    } as never,
    screeningResult: {
      async findFirst() {
        return opts.screeningStatus ? ({ status: opts.screeningStatus } as never) : null;
      }
    } as never,
    kycRecord: {
      async findFirst() {
        return opts.kycRecordStatus ? ({ status: opts.kycRecordStatus } as never) : null;
      }
    } as never,
    commitment: {
      async create(args: { data: Record<string, unknown> }) {
        const row = { id: `cmt_${created.length + 1}`, ...args.data };
        created.push(row);
        return row as never;
      }
    } as never
  };
}

// ---------------------------------------------------------------------------
// PART 1 — eligibility gate on the create path
// ---------------------------------------------------------------------------

test('gate REFUSES a commitment for an un-screened investor (NOT_SCREENED, no write)', async () => {
  const db = makeCommitmentDb({ screeningStatus: null });
  await assert.rejects(
    () =>
      createCommitmentWithEligibility(
        { fundId: 'f1', investorId: 'inv1', committedKrw: 1_000, kycStatus: 'APPROVED' },
        {},
        db
      ),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('NOT_SCREENED'));
      return true;
    }
  );
  assert.equal(db.created.length, 0, 'commitment must NOT be persisted');
});

test('gate REFUSES a commitment for a sanctioned investor (SANCTIONS_BLOCKED)', async () => {
  const db = makeCommitmentDb({ screeningStatus: 'REJECTED' });
  await assert.rejects(
    () =>
      createCommitmentWithEligibility(
        { fundId: 'f1', investorId: 'inv1', committedKrw: 1_000, kycStatus: 'APPROVED' },
        {},
        db
      ),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('SANCTIONS_BLOCKED'));
      return true;
    }
  );
  assert.equal(db.created.length, 0);
});

test('gate REFUSES a commitment for a KYC-pending investor (KYC_NOT_APPROVED)', async () => {
  const db = makeCommitmentDb({ screeningStatus: 'CLEAR' });
  await assert.rejects(
    () =>
      createCommitmentWithEligibility(
        { fundId: 'f1', investorId: 'inv1', committedKrw: 1_000, kycStatus: 'PENDING' },
        {},
        db
      ),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('KYC_NOT_APPROVED'));
      return true;
    }
  );
  assert.equal(db.created.length, 0);
});

test('gate ALLOWS a fully-cleared investor and returns audit before/after', async () => {
  const db = makeCommitmentDb({ screeningStatus: 'CLEAR', accreditationStatus: 'PROFESSIONAL' });
  const result = await createCommitmentWithEligibility(
    { fundId: 'f1', investorId: 'inv1', committedKrw: 5_000, kycStatus: 'APPROVED' },
    {},
    db
  );
  assert.equal(db.created.length, 1, 'commitment must be persisted');
  assert.equal(result.commitment.id, 'cmt_1');
  // before/after audit snapshot pair (before = null on a create).
  assert.equal(result.before, null);
  assert.deepEqual(result.after, {
    id: 'cmt_1',
    fundId: 'f1',
    investorId: 'inv1',
    vehicleId: null,
    commitmentKrw: 5_000
  });
});

test('wallet-linked investor: client kycStatus CANNOT override a server REJECTED KycRecord (#38)', async () => {
  // The caller lies with kycStatus:'APPROVED', but the investor has a wallet
  // whose latest KycRecord is REJECTED → server-side KYC wins, commitment refused.
  const db = makeCommitmentDb({
    screeningStatus: 'CLEAR',
    accreditationStatus: 'PROFESSIONAL',
    wallet: '0xabc',
    kycRecordStatus: 'REJECTED'
  });
  await assert.rejects(
    () =>
      createCommitmentWithEligibility(
        { fundId: 'f1', investorId: 'inv1', committedKrw: 5_000, kycStatus: 'APPROVED' },
        {},
        db
      ),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('KYC_NOT_APPROVED'), 'server KYC must override client value');
      return true;
    }
  );
  assert.equal(db.created.length, 0, 'spoofed client KYC must not onboard an un-KYC’d investor');
});

test('wallet-linked investor: a server APPROVED KycRecord clears the gate regardless of client value', async () => {
  const db = makeCommitmentDb({
    screeningStatus: 'CLEAR',
    accreditationStatus: 'PROFESSIONAL',
    wallet: '0xabc',
    kycRecordStatus: 'APPROVED'
  });
  const result = await createCommitmentWithEligibility(
    // client even omits/contradicts kyc — server record governs
    { fundId: 'f1', investorId: 'inv1', committedKrw: 5_000, kycStatus: 'PENDING' },
    {},
    db
  );
  assert.equal(db.created.length, 1);
  assert.equal(result.commitment.id, 'cmt_1');
});

test('gate enforces accreditation when required', async () => {
  const db = makeCommitmentDb({ screeningStatus: 'CLEAR', accreditationStatus: 'RETAIL' });
  await assert.rejects(
    () =>
      createCommitmentWithEligibility(
        { fundId: 'f1', investorId: 'inv1', committedKrw: 5_000, kycStatus: 'APPROVED' },
        { requireAccreditation: true },
        db
      ),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('NOT_ACCREDITED'));
      return true;
    }
  );
  assert.equal(db.created.length, 0);
});

// ---------------------------------------------------------------------------
// PART 2 — investor compliance view assembly
// ---------------------------------------------------------------------------

function makeComplianceDb(opts: {
  investor?: Record<string, unknown> | null;
  screening?: Record<string, unknown> | null;
  riskRating?: Record<string, unknown> | null;
}) {
  return {
    investor: {
      async findUnique() {
        return (opts.investor ?? null) as never;
      }
    },
    screeningResult: {
      async findFirst() {
        return (opts.screening ?? null) as never;
      }
    },
    amlRiskRating: {
      async findUnique() {
        return (opts.riskRating ?? null) as never;
      }
    }
  } as never;
}

test('compliance view assembles KYC + screening + risk + accreditation + eligibility', async () => {
  const now = new Date('2026-05-29T00:00:00.000Z');
  const db = makeComplianceDb({
    investor: {
      id: 'inv1',
      name: 'Hanwha Life',
      code: 'INV-HANWHA',
      investorType: 'CORPORATE',
      domicile: 'KOR',
      accreditationStatus: 'PROFESSIONAL',
      accreditedAt: new Date('2026-01-01T00:00:00.000Z')
    },
    screening: {
      status: 'CLEAR',
      isPep: false,
      matchScore: 0,
      listType: null,
      provider: 'local',
      screenedAt: new Date('2026-03-01T00:00:00.000Z'),
      rescreenDueAt: new Date('2026-06-01T00:00:00.000Z')
    },
    riskRating: {
      rating: 'LOW',
      score: 0,
      factors: [{ code: 'X', label: 'Y', weight: 5 }],
      ratedAt: new Date('2026-03-01T00:00:00.000Z')
    }
  });

  const view = await buildInvestorComplianceView('inv1', { kycStatus: 'APPROVED', asOf: now }, db);
  assert.ok(view);
  assert.equal(view.investorName, 'Hanwha Life');
  assert.equal(view.kycStatus, 'APPROVED');
  assert.equal(view.screening?.status, 'CLEAR');
  assert.equal(view.screening?.rescreenOverdue, false);
  assert.equal(view.riskRating?.rating, 'LOW');
  assert.equal(view.riskRating?.factors.length, 1);
  assert.equal(view.accreditationStatus, 'PROFESSIONAL');
  assert.equal(view.eligibility.eligible, true);
});

test('compliance view blocks when no screening exists (NOT_SCREENED) and flags overdue rescreen', async () => {
  const now = new Date('2026-05-29T00:00:00.000Z');
  // No screening, no rating, KYC unknown.
  const db = makeComplianceDb({
    investor: {
      id: 'inv2',
      name: 'Unscreened LP',
      code: 'INV-2',
      investorType: 'INDIVIDUAL',
      domicile: 'KOR',
      accreditationStatus: null,
      accreditedAt: null
    },
    screening: null,
    riskRating: null
  });

  const view = await buildInvestorComplianceView('inv2', { asOf: now }, db);
  assert.ok(view);
  assert.equal(view.screening, null);
  assert.equal(view.riskRating, null);
  assert.equal(view.kycStatus, null);
  assert.equal(view.eligibility.eligible, false);
  assert.ok(view.eligibility.reasons.includes('NOT_SCREENED'));
  assert.ok(view.eligibility.reasons.includes('KYC_NOT_APPROVED'));
});

test('compliance view returns null for a missing investor', async () => {
  const db = makeComplianceDb({ investor: null });
  const view = await buildInvestorComplianceView('nope', {}, db);
  assert.equal(view, null);
});

test('compliance view flags an overdue rescreen', async () => {
  const now = new Date('2026-05-29T00:00:00.000Z');
  const db = makeComplianceDb({
    investor: { id: 'inv3', name: 'X', code: 'C', accreditationStatus: null },
    screening: {
      status: 'CLEAR',
      isPep: false,
      matchScore: 0,
      listType: null,
      provider: 'local',
      screenedAt: new Date('2026-01-01T00:00:00.000Z'),
      rescreenDueAt: new Date('2026-04-01T00:00:00.000Z') // before asOf
    }
  });
  const view = await buildInvestorComplianceView('inv3', { kycStatus: 'APPROVED', asOf: now }, db);
  assert.equal(view?.screening?.rescreenOverdue, true);
});

// ---------------------------------------------------------------------------
// PART 2 — PCAP rendering helper
// ---------------------------------------------------------------------------

test('formatPcapRow returns display-ready fields', () => {
  const statement: LpStatement = {
    investorId: 'inv1',
    investorCode: 'INV-1',
    investorName: 'Mirae Asset',
    investorType: 'CORPORATE',
    committedKrw: 10_000_000_000,
    calledKrw: 6_000_000_000,
    distributedKrw: 2_000_000_000,
    unfundedKrw: 4_000_000_000,
    recallableKrw: 0,
    navShareKrw: 7_000_000_000,
    sharePct: 25,
    irrPct: 12.5,
    tvpiMultiple: 1.5,
    dpiMultiple: 0.3333,
    rvpiMultiple: 1.1667,
    cashflowsAllocatedProRata: true
  };

  const row = formatPcapRow(statement);
  assert.equal(row.investorLabel, 'Mirae Asset');
  assert.equal(row.proRataAllocated, true);
  assert.equal(row.irr, '12.5%');
  assert.equal(row.sharePct, '25.0%');
  assert.equal(row.tvpi, '1.5x');
  assert.equal(row.dpi, '0.33x');
  assert.ok(row.committed.includes('10,000,000,000'));
});

test('formatPcapRow handles a null IRR and code-only label', () => {
  const statement: LpStatement = {
    investorId: 'inv2',
    investorCode: 'INV-2',
    investorName: null,
    investorType: null,
    committedKrw: 0,
    calledKrw: 0,
    distributedKrw: 0,
    unfundedKrw: 0,
    recallableKrw: 0,
    navShareKrw: 0,
    sharePct: 0,
    irrPct: null,
    tvpiMultiple: 0,
    dpiMultiple: 0,
    rvpiMultiple: 0,
    cashflowsAllocatedProRata: false
  };
  const row = formatPcapRow(statement);
  assert.equal(row.investorLabel, 'INV-2');
  assert.equal(row.irr, 'n/a');
  assert.equal(row.proRataAllocated, false);
});
