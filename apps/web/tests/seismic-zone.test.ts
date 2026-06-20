import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalSido,
  effectiveGroundAccelerationG,
  KDS_SEISMIC_SOURCE,
  resolveSeismicZone,
  RISK_COEFFICIENT_BY_RETURN_PERIOD,
  seismicHazardScore,
  seismicPgaByReturnPeriod,
  STANDARD_RETURN_PERIODS,
  ZONE_FACTOR_G
} from '@/lib/services/dc-intel/seismic-zone';

test('zone factors and risk coefficients match KDS 17 10 00', () => {
  assert.equal(ZONE_FACTOR_G.I, 0.11);
  assert.equal(ZONE_FACTOR_G.II, 0.07);
  assert.deepEqual(RISK_COEFFICIENT_BY_RETURN_PERIOD, {
    50: 0.4,
    100: 0.57,
    200: 0.73,
    500: 1.0,
    1000: 1.4,
    2400: 2.0
  });
});

test('effectiveGroundAccelerationG computes Z × I', () => {
  // 구역 I, 500yr design basis = Z itself.
  assert.equal(effectiveGroundAccelerationG('I', 500), 0.11);
  // 구역 I, 2400yr (최대고려지진) = 0.11 × 2.0.
  assert.equal(effectiveGroundAccelerationG('I', 2400), 0.22);
  // 구역 II, 2400yr = 0.07 × 2.0.
  assert.equal(effectiveGroundAccelerationG('II', 2400), 0.14);
  // 구역 II, 100yr = 0.07 × 0.57 = 0.0399.
  assert.equal(effectiveGroundAccelerationG('II', 100), 0.0399);
});

test('effectiveGroundAccelerationG rejects an untabulated return period', () => {
  assert.throws(() => effectiveGroundAccelerationG('I', 475), /unsupported_return_period/);
});

test('seismicPgaByReturnPeriod is monotonically increasing and well-formed', () => {
  const curve = seismicPgaByReturnPeriod('I');
  assert.equal(curve.length, STANDARD_RETURN_PERIODS.length);
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(curve[i].pgaG > curve[i - 1].pgaG, 'PGA increases with return period');
  }
  // 구역 I always dominates 구역 II at the same return period.
  const ii = seismicPgaByReturnPeriod('II');
  for (let i = 0; i < curve.length; i += 1) {
    assert.ok(curve[i].pgaG > ii[i].pgaG);
  }
});

test('hazard score is bounded, monotonic, and lower for the milder zone', () => {
  const i = seismicHazardScore('I');
  const ii = seismicHazardScore('II');
  assert.ok(i > ii, '구역 I is the higher-hazard zone');
  for (const s of [i, ii]) {
    assert.ok(s >= 0 && s <= 5);
  }
});

test('canonicalSido normalizes legal names and 특별자치도 renames', () => {
  assert.equal(canonicalSido('강원특별자치도'), '강원');
  assert.equal(canonicalSido('강원도'), '강원');
  assert.equal(canonicalSido('전라남도'), '전남');
  assert.equal(canonicalSido('제주특별자치도'), '제주');
  assert.equal(canonicalSido('서울특별시'), '서울');
  assert.equal(canonicalSido('Gangwon'), null);
  assert.equal(canonicalSido(null), null);
});

test('제주 전역은 구역 II (시/도 단위 매치)', () => {
  const r = resolveSeismicZone({ province: '제주특별자치도', city: '서귀포시' });
  assert.ok(r);
  assert.equal(r.zone, 'II');
  assert.equal(r.match, 'sido');
  assert.equal(r.zoneFactorG, 0.07);
  assert.equal(r.source, KDS_SEISMIC_SOURCE);
});

test('강원 북부 시/군은 구역 II, 영동·남부는 구역 I', () => {
  const chuncheon = resolveSeismicZone({ province: '강원특별자치도', city: '춘천시' });
  assert.equal(chuncheon?.zone, 'II');
  assert.equal(chuncheon?.match, 'sigungu');
  assert.equal(chuncheon?.matchedDistrict, '춘천');

  // 강릉·원주는 강원이지만 구역 I (남부/영동).
  const gangneung = resolveSeismicZone({ province: '강원도', city: '강릉시' });
  assert.equal(gangneung?.zone, 'I');
  assert.equal(gangneung?.match, 'sigungu');

  const wonju = resolveSeismicZone({ province: '강원도', city: '원주시' });
  assert.equal(wonju?.zone, 'I');
});

test('전남 남서부 시/군은 구역 II, 동부는 구역 I', () => {
  const haenam = resolveSeismicZone({ province: '전라남도', city: '해남군' });
  assert.equal(haenam?.zone, 'II');
  assert.equal(haenam?.matchedDistrict, '해남');

  const mokpo = resolveSeismicZone({ province: '전라남도', city: '목포시' });
  assert.equal(mokpo?.zone, 'II');

  // 여수·순천·광양은 전남이지만 구역 I.
  const yeosu = resolveSeismicZone({ province: '전라남도', city: '여수시' });
  assert.equal(yeosu?.zone, 'I');
  const gwangyang = resolveSeismicZone({ province: '전라남도', city: '광양시' });
  assert.equal(gwangyang?.zone, 'I');
});

test('대부분의 행정구역은 구역 I (서울/경기/부산 등)', () => {
  for (const province of ['서울특별시', '경기도', '부산광역시', '대전광역시', '경상북도']) {
    const r = resolveSeismicZone({ province });
    assert.equal(r?.zone, 'I', `${province} should be 구역 I`);
    assert.equal(r?.zoneFactorG, 0.11);
  }
});

test('address-string parsing recovers 시/도 + 시/군 (big→small)', () => {
  const r = resolveSeismicZone({ address: '제주특별자치도 제주시 첨단로 242' });
  assert.equal(r?.zone, 'II');

  const seoul = resolveSeismicZone({ address: '서울특별시 강남구 테헤란로 1' });
  assert.equal(seoul?.zone, 'I');
});

test('시/도만 있을 때 강원/전남은 구역 I로 보수적 디폴트, match=default', () => {
  const gangwon = resolveSeismicZone({ province: '강원특별자치도' });
  assert.equal(gangwon?.zone, 'I');
  assert.equal(gangwon?.match, 'default');
});

test('인식 불가한 비(非)한국 지역은 null', () => {
  assert.equal(resolveSeismicZone({ province: 'Tokyo', city: 'Shinjuku' }), null);
  assert.equal(resolveSeismicZone({ address: 'somewhere unknown' }), null);
  assert.equal(resolveSeismicZone({}), null);
});
