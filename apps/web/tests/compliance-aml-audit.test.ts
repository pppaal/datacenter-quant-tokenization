import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAuditRecordHash,
  recordAuditEvent,
  verifyAuditChain,
  type HashableAuditEvent
} from '@/lib/services/audit';
import {
  LocalDenylistProvider,
  evaluateScreening,
  screenAndRecord,
  nameSimilarity,
  findScreeningsDueForRescreen,
  type DenylistEntry
} from '@/lib/services/aml/screening';
import { deriveRiskRating } from '@/lib/services/aml/risk-rating';
import { runAuditPrune } from '../scripts/run-audit-log-pruner';
import {
  evaluateCommitmentEligibility,
  resolveCommitmentEligibility,
  assertCommitmentEligibility,
  CommitmentEligibilityError
} from '@/lib/services/aml/eligibility';

// ---------------------------------------------------------------------------
// In-memory AuditEvent fake that mimics the hash-chain write path.
// ---------------------------------------------------------------------------
function makeAuditFake() {
  const rows: Array<HashableAuditEvent & { sequence: number; recordHash: string | null }> = [];
  let seq = 0;
  return {
    rows,
    auditEvent: {
      async findFirst(args: any) {
        if (args?.orderBy?.sequence === 'desc') {
          const sorted = [...rows].sort((a, b) => b.sequence - a.sequence);
          return sorted[0] ?? null;
        }
        return rows[0] ?? null;
      },
      async findMany(_args: any) {
        return [...rows].sort((a, b) => a.sequence - b.sequence);
      },
      async create(args: any) {
        seq += 1;
        const row = { ...args.data, sequence: seq } as any;
        // Prisma `undefined` means "use default / unset"; normalize to null for reads.
        row.metadata = args.data.metadata ?? null;
        row.beforeState = args.data.beforeState ?? null;
        row.afterState = args.data.afterState ?? null;
        rows.push(row);
        return row;
      }
    }
  };
}

test('audit hash chain links each record to its predecessor', async () => {
  const db = makeAuditFake();
  const e1 = await recordAuditEvent(
    { actorIdentifier: 'a', actorRole: 'ADMIN', action: 'x', entityType: 'T' },
    db as any
  );
  const e2 = await recordAuditEvent(
    { actorIdentifier: 'b', actorRole: 'ADMIN', action: 'y', entityType: 'T' },
    db as any
  );

  assert.equal(e1.prevHash, null);
  assert.equal(typeof e1.recordHash, 'string');
  assert.equal(e2.prevHash, e1.recordHash, 'second record links to first');

  const result = await verifyAuditChain(db as any);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 2);
});

test('verifyAuditChain detects a tampered field', async () => {
  const db = makeAuditFake();
  await recordAuditEvent(
    { actorIdentifier: 'a', actorRole: 'ADMIN', action: 'x', entityType: 'T' },
    db as any
  );
  await recordAuditEvent(
    { actorIdentifier: 'b', actorRole: 'ADMIN', action: 'y', entityType: 'T' },
    db as any
  );

  // Tamper with a stored field WITHOUT recomputing the hash.
  db.rows[0].action = 'HACKED';

  const result = await verifyAuditChain(db as any);
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.brokenAt);
  assert.match((result as any).brokenAt.reason, /recordHash mismatch/);
});

test('verifyAuditChain detects a removed (gapped) row', async () => {
  const db = makeAuditFake();
  await recordAuditEvent(
    { actorIdentifier: 'a', actorRole: 'ADMIN', action: 'x', entityType: 'T' },
    db as any
  );
  await recordAuditEvent(
    { actorIdentifier: 'b', actorRole: 'ADMIN', action: 'y', entityType: 'T' },
    db as any
  );
  await recordAuditEvent(
    { actorIdentifier: 'c', actorRole: 'ADMIN', action: 'z', entityType: 'T' },
    db as any
  );

  // Remove the middle row → both a sequence gap and a prevHash break.
  db.rows.splice(1, 1);

  const result = await verifyAuditChain(db as any);
  assert.equal(result.ok, false);
});

test('recordAuditEvent captures before/after snapshots', async () => {
  const db = makeAuditFake();
  const ev = await recordAuditEvent(
    {
      actorIdentifier: 'a',
      actorRole: 'ADMIN',
      action: 'investor.update',
      entityType: 'Investor',
      before: { name: 'Old Name' },
      after: { name: 'New Name' }
    },
    db as any
  );
  assert.deepEqual(ev.beforeState, { name: 'Old Name' });
  assert.deepEqual(ev.afterState, { name: 'New Name' });
  // before/after are part of the canonicalized hash input.
  const rehash = computeAuditRecordHash({ ...(db.rows[0] as any), prevHash: db.rows[0].prevHash });
  assert.equal(rehash, ev.recordHash);
});

// ---------------------------------------------------------------------------
// Sanctions / PEP screening
// ---------------------------------------------------------------------------
const DENYLIST: DenylistEntry[] = [
  { name: 'Kim Jong Un', listType: 'OFAC', dateOfBirth: '1984-01-08' },
  { name: 'Jane Politician', listType: 'PEP', isPep: true }
];

test('nameSimilarity is order- and case-insensitive', () => {
  assert.ok(nameSimilarity('Kim Jong Un', 'un jong kim') > 0.9);
  assert.equal(nameSimilarity('Alice Smith', 'Bob Jones'), 0);
});

test('nameSimilarity matches non-Latin (Cyrillic/Hangul) names instead of erasing them', () => {
  // Regression: the old `[^a-z0-9\s]` normalizer stripped EVERY non-ASCII code
  // point, so a Cyrillic/Hangul/CJK name normalized to the empty string → an
  // empty token set → 0.0 similarity → a FALSE NEGATIVE against the denylist.
  // Same-script identical/reordered names must now score a strong match, while
  // unrelated names still score 0.
  assert.ok(
    nameSimilarity('Владимир Путин', 'Путин Владимир') > 0.9,
    'reordered Cyrillic name must match'
  );
  assert.equal(nameSimilarity('Владимир Путин', 'Иван Иванов'), 0, 'unrelated Cyrillic → 0');
  assert.ok(nameSimilarity('김정은', '김정은') > 0.9, 'identical Hangul name must match');
  // ASCII / accented-Latin behavior is unchanged.
  assert.ok(nameSimilarity('José Müller', 'jose muller') > 0.9, 'accented Latin folds to ASCII');
});

test('a non-Latin sanctioned name is screened as a HIT (no false negative)', async () => {
  const denylist: DenylistEntry[] = [{ name: 'Владимир Путин', listType: 'OFAC' }];
  const provider = new LocalDenylistProvider({ entries: denylist });
  // Same Cyrillic name, reordered — previously normalized to '' on both sides
  // and slipped through with a 0.0 score below the 0.6 threshold.
  const matches = await provider.screen({ name: 'Путин Владимир' });
  assert.ok(matches.length > 0, 'a same-script sanctioned name must produce a match');
  assert.equal(evaluateScreening(matches).blocked, true);
});

test('a sanctions hit BLOCKS (status REJECTED)', async () => {
  const provider = new LocalDenylistProvider({ entries: DENYLIST });
  const matches = await provider.screen({ name: 'Kim Jong Un', dateOfBirth: '1984-01-08' });
  const outcome = evaluateScreening(matches);
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.blocked, true);
  assert.equal(outcome.listType, 'OFAC');
});

test('a PEP-only hit escalates and blocks pending EDD', async () => {
  const provider = new LocalDenylistProvider({ entries: DENYLIST });
  const matches = await provider.screen({ name: 'Jane Politician' });
  const outcome = evaluateScreening(matches);
  assert.equal(outcome.isPep, true);
  assert.equal(outcome.blocked, true);
  assert.equal(outcome.status, 'POTENTIAL_MATCH');
});

test('a clean subject passes (CLEAR, not blocked)', async () => {
  const provider = new LocalDenylistProvider({ entries: DENYLIST });
  const matches = await provider.screen({ name: 'Honest Investor LLC' });
  const outcome = evaluateScreening(matches);
  assert.equal(outcome.status, 'CLEAR');
  assert.equal(outcome.blocked, false);
});

test('screenAndRecord persists an evidence record with rescreen due date', async () => {
  let created: any;
  const db = {
    screeningResult: {
      async create(args: any) {
        created = args.data;
        return { id: 'scr_1', ...args.data };
      }
    }
  };
  const provider = new LocalDenylistProvider({ entries: DENYLIST });
  const { outcome, record } = await screenAndRecord(
    { subject: { name: 'Kim Jong Un', dateOfBirth: '1984-01-08' }, investorId: 'inv_1' },
    { db: db as any, provider }
  );
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(record.id, 'scr_1');
  assert.equal(created.investorId, 'inv_1');
  assert.equal(created.status, 'REJECTED');
  assert.ok(created.rescreenDueAt instanceof Date);
  assert.ok(created.rescreenDueAt.getTime() > Date.now());
});

test('ongoing-monitoring surfaces screenings past their rescreen date', async () => {
  const db = {
    screeningResult: {
      async findMany(args: any) {
        assert.ok(args.where.rescreenDueAt.lte instanceof Date);
        return [{ id: 'scr_old', investorId: 'inv_1', subjectName: 'Old Subject' }];
      }
    }
  };
  const due = await findScreeningsDueForRescreen(new Date(), db as any);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'scr_old');
});

// ---------------------------------------------------------------------------
// Risk rating
// ---------------------------------------------------------------------------
test('risk rating escalates to HIGH on a sanctions hit', () => {
  const r = deriveRiskRating({ screening: { status: 'REJECTED', isPep: false, matchScore: 0.9 } });
  assert.equal(r.rating, 'HIGH');
  assert.ok(r.factors.some((f) => f.code === 'SANCTIONS_HIT'));
});

test('risk rating is MEDIUM for a PEP and LOW for a clean domestic investor', () => {
  const pep = deriveRiskRating({
    country: 'KOR',
    screening: { status: 'CLEAR', isPep: true, matchScore: 0 }
  });
  assert.equal(pep.rating, 'MEDIUM');

  const clean = deriveRiskRating({
    country: 'KOR',
    investorType: 'CORPORATE',
    screening: { status: 'CLEAR', isPep: false, matchScore: 0 }
  });
  assert.equal(clean.rating, 'LOW');
});

test('risk rating flags high-risk jurisdiction', () => {
  const r = deriveRiskRating({ country: 'PRK' });
  assert.equal(r.rating, 'HIGH');
  assert.ok(r.factors.some((f) => f.code === 'HIGH_RISK_JURISDICTION'));
});

// ---------------------------------------------------------------------------
// Commitment eligibility gate
// ---------------------------------------------------------------------------
test('eligibility gate refuses an un-screened investor', () => {
  const r = evaluateCommitmentEligibility({ kycStatus: 'APPROVED', screeningStatus: null });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes('NOT_SCREENED'));
});

test('eligibility gate refuses a sanctioned investor', () => {
  const r = evaluateCommitmentEligibility({ kycStatus: 'APPROVED', screeningStatus: 'REJECTED' });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes('SANCTIONS_BLOCKED'));
});

test('eligibility gate refuses an un-KYCd investor', () => {
  const r = evaluateCommitmentEligibility({ kycStatus: 'PENDING', screeningStatus: 'CLEAR' });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes('KYC_NOT_APPROVED'));
});

test('eligibility gate allows a fully cleared investor', () => {
  const r = evaluateCommitmentEligibility({ kycStatus: 'APPROVED', screeningStatus: 'CLEAR' });
  assert.equal(r.eligible, true);
  assert.deepEqual(r.reasons, []);
});

test('eligibility gate enforces accreditation when required', () => {
  const blocked = evaluateCommitmentEligibility({
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    accreditationStatus: 'RETAIL',
    requireAccreditation: true
  });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('NOT_ACCREDITED'));

  const ok = evaluateCommitmentEligibility({
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    accreditationStatus: 'PROFESSIONAL',
    requireAccreditation: true
  });
  assert.equal(ok.eligible, true);
});

test('resolveCommitmentEligibility reads latest screening + accreditation from db', async () => {
  const db = {
    investor: {
      async findUnique() {
        return { accreditationStatus: 'PROFESSIONAL' };
      }
    },
    screeningResult: {
      async findFirst() {
        return { status: 'CLEAR' };
      }
    }
  };
  const r = await resolveCommitmentEligibility(
    'inv_1',
    { kycStatusOverride: 'APPROVED' },
    db as any
  );
  assert.equal(r.eligible, true);
});

// ---------------------------------------------------------------------------
// Retention pruner no longer hard-deletes audit evidence
// ---------------------------------------------------------------------------
test('pruner never hard-deletes AuditEvent rows', async () => {
  let auditDeleteCalled = false;
  const db = {
    auditEvent: {
      async count() {
        return 5; // pretend 5 ancient rows exist
      },
      async deleteMany() {
        auditDeleteCalled = true;
        return { count: 5 };
      }
    },
    opsAlertDelivery: {
      async count() {
        return 0;
      },
      async deleteMany() {
        return { count: 0 };
      }
    },
    notification: {
      async count() {
        return 0;
      },
      async deleteMany() {
        return { count: 0 };
      }
    },
    opsWorkItem: {
      async count() {
        return 0;
      },
      async deleteMany() {
        return { count: 0 };
      }
    }
  };

  const result = await runAuditPrune({ dryRun: false }, db as any);
  assert.equal(auditDeleteCalled, false, 'audit deleteMany must NOT be called');
  assert.equal(result.audit.deleted, 0, 'audit deleted count must be 0');
  // Rows beyond the floor are still reported for archival visibility.
  assert.equal(result.audit.eligible, 5);
});

test('assertCommitmentEligibility throws for a sanctioned investor', async () => {
  const db = {
    investor: {
      async findUnique() {
        return { accreditationStatus: null };
      }
    },
    screeningResult: {
      async findFirst() {
        return { status: 'REJECTED' };
      }
    }
  };
  await assert.rejects(
    () => assertCommitmentEligibility('inv_1', { kycStatusOverride: 'APPROVED' }, db as any),
    (err: unknown) => {
      assert.ok(err instanceof CommitmentEligibilityError);
      assert.ok(err.reasons.includes('SANCTIONS_BLOCKED'));
      return true;
    }
  );
});
