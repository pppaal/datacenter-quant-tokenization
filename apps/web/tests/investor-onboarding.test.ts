import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseInvestorOnboardingProfile,
  assessSubscriptionReadiness,
  InvestorOnboardingProfileSchema,
  type InvestorOnboardingProfile
} from '@/lib/services/capital/investor-onboarding';

function profile(over: Partial<InvestorOnboardingProfile> = {}): InvestorOnboardingProfile {
  return parseInvestorOnboardingProfile({
    investorId: 'inv_1',
    investorName: 'LP One',
    investorType: 'CORPORATE',
    domicile: 'KOR',
    accreditationStatus: 'PROFESSIONAL',
    wallet: '0x' + 'a'.repeat(40),
    taxCountry: 'KOR',
    countryCode: 410,
    ...over
  });
}

const item = (a: ReturnType<typeof assessSubscriptionReadiness>, check: string) =>
  a.items.find((i) => i.check.startsWith(check))!;

test('schema rejects a malformed wallet and bad domicile length', () => {
  assert.throws(() =>
    InvestorOnboardingProfileSchema.parse({
      investorId: 'x',
      investorName: 'y',
      wallet: '0xnothex'
    })
  );
  assert.throws(() =>
    InvestorOnboardingProfileSchema.parse({ investorId: 'x', investorName: 'y', domicile: 'KOREA' })
  );
});

test('fully cleared investor can subscribe with all PASS items', () => {
  const a = assessSubscriptionReadiness(profile(), {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    requireAccreditation: true
  });
  assert.equal(a.canSubscribe, true);
  assert.deepEqual(a.blockingReasons, []);
  assert.equal(item(a, 'KYC').status, 'PASS');
  assert.equal(item(a, 'Sanctions').status, 'PASS');
  assert.equal(item(a, 'Accreditation').status, 'PASS');
  assert.equal(item(a, 'Wallet').status, 'PASS');
});

test('absent KYC is PENDING (blocking); explicit rejection is FAIL', () => {
  const pending = assessSubscriptionReadiness(profile(), { screeningStatus: 'CLEAR' });
  assert.equal(item(pending, 'KYC').status, 'PENDING');
  assert.equal(item(pending, 'KYC').blocking, true);
  assert.equal(pending.canSubscribe, false);

  const rejected = assessSubscriptionReadiness(profile(), {
    kycStatus: 'REJECTED',
    screeningStatus: 'CLEAR'
  });
  assert.equal(item(rejected, 'KYC').status, 'FAIL');
});

test('sanctions match blocks; missing screening is PENDING', () => {
  const blocked = assessSubscriptionReadiness(profile(), {
    kycStatus: 'APPROVED',
    screeningStatus: 'CONFIRMED_MATCH'
  });
  assert.equal(item(blocked, 'Sanctions').status, 'FAIL');
  assert.equal(blocked.canSubscribe, false);

  const unscreened = assessSubscriptionReadiness(profile(), { kycStatus: 'APPROVED' });
  assert.equal(item(unscreened, 'Sanctions').status, 'PENDING');
  assert.equal(unscreened.canSubscribe, false);
});

test('accreditation only checked when required', () => {
  const retail = profile({ accreditationStatus: 'RETAIL' });
  const notRequired = assessSubscriptionReadiness(retail, {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR'
  });
  assert.equal(notRequired.canSubscribe, true);
  assert.equal(
    notRequired.items.find((i) => i.check === 'Accreditation status'),
    undefined
  );

  const required = assessSubscriptionReadiness(retail, {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    requireAccreditation: true
  });
  assert.equal(item(required, 'Accreditation').status, 'FAIL');
  assert.equal(required.canSubscribe, false);
});

test('fund domicile allowlist and minimum commitment are enforced', () => {
  const a = assessSubscriptionReadiness(profile({ domicile: 'USA' }), {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    commitmentKrw: 500_000_000,
    fundConstraints: { allowedDomiciles: ['KOR', 'SGP'], minCommitmentKrw: 1_000_000_000 }
  });
  assert.equal(item(a, 'Domicile').status, 'FAIL');
  assert.equal(item(a, 'Minimum commitment').status, 'FAIL');
  assert.equal(a.canSubscribe, false);
  assert.ok(a.blockingReasons.some((r) => r.includes('Domicile')));
  assert.ok(a.blockingReasons.some((r) => r.includes('Minimum commitment')));
});

test('emits canonical claim topics for a future ERC-3643 bridge', () => {
  const a = assessSubscriptionReadiness(profile({ taxCountry: null, domicile: 'KOR' }), {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR',
    isPep: false
  });
  assert.deepEqual(a.claimTopics, {
    kycStatus: 'APPROVED',
    accreditationLevel: 'PROFESSIONAL',
    countryCode: 410,
    entityType: 'CORPORATE',
    taxCountry: 'KOR', // falls back to domicile when taxCountry unset
    isPep: false,
    isScreened: true
  });
});

test('wallet-less investor: wallet item is advisory PENDING, not blocking', () => {
  const a = assessSubscriptionReadiness(profile({ wallet: null }), {
    kycStatus: 'APPROVED',
    screeningStatus: 'CLEAR'
  });
  const wallet = item(a, 'Wallet');
  assert.equal(wallet.status, 'PENDING');
  assert.equal(wallet.blocking, false);
  assert.equal(a.canSubscribe, true); // advisory does not block
});
