import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPnu,
  districtFromKakaoAddress,
  isKakaoConfigured,
  parcelFromKakaoDoc
} from '@/lib/services/geocode/kakao-geocode';

test('buildPnu composes the 19-digit PNU (법정동 10 + 필지 1 + 본번 4 + 부번 4)', () => {
  assert.equal(
    buildPnu({ bCode: '1168010400', mountainYn: 'N', mainNo: '458', subNo: '7' }),
    '1168010400104580007'
  );
});

test('buildPnu flags 산 parcels with the mountain segment', () => {
  const pnu = buildPnu({ bCode: '4122035021', mountainYn: 'Y', mainNo: '84', subNo: '0' });
  assert.equal(pnu, '4122035021200840000');
  assert.equal(pnu?.charAt(10), '2'); // 필지구분 = 산
});

test('buildPnu returns null for a missing/short 법정동 code', () => {
  assert.equal(buildPnu({ bCode: '', mainNo: '1', subNo: '0' }), null);
  assert.equal(buildPnu({ bCode: '116801', mainNo: '1', subNo: '0' }), null);
  assert.equal(buildPnu({ bCode: 'NOTNUMERIC', mainNo: '1', subNo: '0' }), null);
});

test('parcelFromKakaoDoc maps a Kakao address document to a ParcelIdentifier', () => {
  const doc = {
    address: {
      address_name: '서울특별시 강남구 압구정동 458-7',
      region_2depth_name: '강남구',
      mountain_yn: 'N',
      main_address_no: '458',
      sub_address_no: '7',
      b_code: '1168010400'
    },
    road_address: { address_name: '서울특별시 강남구 압구정로 340' },
    x: '127.03885',
    y: '37.52738'
  };
  const parcel = parcelFromKakaoDoc(doc);
  assert.deepEqual(parcel, {
    jibunAddress: '서울특별시 강남구 압구정동 458-7',
    roadAddress: '서울특별시 강남구 압구정로 340',
    pnu: '1168010400104580007'
  });
  assert.equal(districtFromKakaoAddress(doc.address), '강남구');
});

test('parcelFromKakaoDoc returns null without a jibun address, and tolerates a missing road address', () => {
  assert.equal(parcelFromKakaoDoc({ address: null }), null);
  const noRoad = parcelFromKakaoDoc({
    address: {
      address_name: '경기도 평택시 고덕면 여염리 산 84',
      mountain_yn: 'Y',
      main_address_no: '84',
      sub_address_no: '0',
      b_code: '4122035021'
    },
    road_address: null
  });
  assert.equal(noRoad?.roadAddress, null);
  assert.equal(noRoad?.pnu, '4122035021200840000');
});

test('isKakaoConfigured reflects the REST key', () => {
  assert.equal(
    isKakaoConfigured({ KAKAO_REST_API_KEY: 'abc' } as unknown as NodeJS.ProcessEnv),
    true
  );
  assert.equal(
    isKakaoConfigured({ KAKAO_REST_API_KEY: '  ' } as unknown as NodeJS.ProcessEnv),
    false
  );
  assert.equal(isKakaoConfigured({} as unknown as NodeJS.ProcessEnv), false);
});
