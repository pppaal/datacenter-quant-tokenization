# Data activation guide — keys & flags

This product ships with deterministic **mock** data for every connector, so it
runs end-to-end with zero configuration. To replace mock data with **live**
public data, set the environment variables below (in Vercel → Settings →
Environment Variables, or your `.env`), redeploy, then verify with:

```bash
npm --prefix apps/web run data:smoke
```

`data:smoke` prints a per-connector table showing `LIVE ✅` / `MOCK` / `OFF` /
`ERROR` so you can confirm each key works before relying on it. See the bottom
of this file for how to read it.

---

## Tier 0 — zero signup (keyless). Turn these on first.

These sources need **no account and no API key** — only a feature flag, because
they make outbound calls that we keep off by default so CI/dev stay
deterministic. Paste this block into your environment to activate everything
that requires no signup:

```bash
# Keyless public data — no account needed, just flip on.
ENABLE_WORLD_BANK_MACRO=true   # World Bank macro indicators (GDP, CPI, rates) — global
ENABLE_DBNOMICS_MACRO=true     # DBnomics: relays IMF/OECD/BIS/ECB/Eurostat/FRED — global
ENABLE_THINKHAZARD=true        # GFDRR ThinkHazard! site hazard ratings — worldwide
ENABLE_PEERINGDB=true          # PeeringDB data-center interconnection density — worldwide
ENABLE_OVERPASS_POI=true       # OpenStreetMap Overpass amenity/POI density — worldwide
ENABLE_OSM_GEOCODER=true       # OpenStreetMap Nominatim geocoder — worldwide fallback
```

> Egress note: your hosting network policy must allow outbound HTTPS to these
> hosts, or the calls fail-soft to empty (the app keeps working on mock). Hosts:
> `api.worldbank.org`, `api.db.nomics.world`, `www.thinkhazard.org`,
> `www.peeringdb.com`, `overpass-api.de`, `nominatim.openstreetmap.org`.

---

## Tier 1 — Korea (free, ~30 min total). 4 signups.

These power the core Korean real-estate analysis (건축물대장, 실거래가, 공시지가,
토지이용계획, 임대동향, 재무제표). All are free Korean government / public-agency
APIs. Each issues a key after a short "활용신청" (use application) form.

### 1. data.go.kr — 공공데이터포털 (covers two keys)

Single account, two API products. Sign up once at
<https://www.data.go.kr> (회원가입 → 일반회원; 휴대폰 본인인증 needed).

| What                           | API to apply for ("활용신청")                             | Env var                  |
| ------------------------------ | --------------------------------------------------------- | ------------------------ |
| 실거래가 (sale comps, RTMS)    | "국토교통부\_아파트/상업업무용 부동산 매매 실거래가 자료" | `RTMS_SERVICE_KEY`       |
| 건축물대장 (building registry) | "국토교통부\_건축물대장정보 서비스"                       | `MOLIT_BUILDING_API_KEY` |

Steps: 로그인 → search the API name above → **활용신청** → fill purpose (e.g.
"부동산 분석") → approval is instant for these → 마이페이지 → 인증키 copy. Use the
**일반 인증키 (Decoding)** value.

### 2. vworld.kr — V-World 공간정보 오픈플랫폼 (one key, two connectors)

Powers both **개별공시지가 (land pricing)** and **토지이용계획 (use-zone)**.

- Sign up: <https://www.vworld.kr> → 회원가입.
- 인증키 발급: 마이페이지 → 인증키 관리 → **인증키 발급** → register your
  service domain (use your Vercel domain, e.g. `your-app.vercel.app`; add
  `localhost` for local dev).
- Copy the key → `VWORLD_API_KEY`.

### 3. R-ONE — 한국부동산원 부동산통계 (rent trends)

Powers **임대동향 (rent comps)**.

- Sign up / key: <https://www.reb.or.kr/r-one/> → open-API 신청 (R-ONE
  통계조회 OpenAPI). Approval may take ~1 business day.
- Copy the key → `RONE_API_KEY`.

### 4. opendart.fss.or.kr — DART 전자공시 (financial statements)

Powers **재무제표 (10-year financial statements)** for listed counterparties /
tenants.

- Sign up & key: <https://opendart.fss.or.kr/> → 인증키 신청/관리 → 오픈API
  이용 신청. Key arrives by email, usually within minutes.
- Copy the key → `DART_API_KEY`.

### Optional Korea extras

| What                                             | Env var                                                         | Notes                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| KOSIS 통계청 (construction cost, regional macro) | `KOSIS_API_KEY`                                                 | Free at <https://kosis.kr/openapi/> after signup.                                   |
| Kakao geocoder (best KR address→coords)          | `KAKAO_REST_API_KEY`                                            | <https://developers.kakao.com> → 앱 생성 → REST API 키. Falls back to OSM if unset. |
| KEPCO substation / grid capacity                 | `KEPCO_SUBSTATION_DATA_PATH` **or** `KEPCO_SUBSTATION_DATA_URL` | Point at a local CSV/JSON or a hosted file; no live KEPCO API.                      |

---

## Tier 2 — global keyed (optional, all free). For richer global coverage.

Only needed if you want live macro/energy/air-quality beyond the keyless Tier 0.

| What                                | Env var                     | Free key from                                     |
| ----------------------------------- | --------------------------- | ------------------------------------------------- |
| US FRED macro (rates, CPI, spreads) | `FRED_API_KEY`              | <https://fredaccount.stlouisfed.org/apikeys>      |
| Bank of Korea ECOS macro            | `BOK_ECOS_API_KEY`          | <https://ecos.bok.or.kr/api/>                     |
| US EIA energy prices                | `EIA_API_KEY`               | <https://www.eia.gov/opendata/register.php>       |
| ElectricityMaps carbon intensity    | `ELECTRICITYMAPS_API_TOKEN` | <https://www.electricitymaps.com/free-tier-api>   |
| ENTSO-E European grid               | `ENTSOE_API_TOKEN`          | <https://transparency.entsoe.eu/> (email request) |
| Ember global electricity            | `EMBER_API_KEY`             | <https://ember-energy.org/data/>                  |
| OpenAQ air quality                  | `OPENAQ_API_KEY`            | <https://explore.openaq.org/account>              |

---

## Verifying: how to read `data:smoke`

```bash
npm --prefix apps/web run data:smoke
```

Each connector prints one status:

| Status    | Meaning                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `LIVE ✅` | Key/flag set **and** the call returned real data. You're live.                                                                |
| `LIVE ∅`  | Live mode on, but the call returned empty — key valid but no rows for the test parcel, or upstream had nothing. Not an error. |
| `MOCK`    | No key set; deterministic mock in use (the default; app still works).                                                         |
| `OFF`     | Keyless connector whose `ENABLE_*` flag is off, or a keyed source with no key and no mock.                                    |
| `ERROR`   | Configured but the call failed (bad key, host not in egress allowlist, upstream down). The detail column shows why.           |

The script uses a fixed Seoul fixture (Apgujeong, 강남구 — coords
`37.527, 127.028`, PNU `1168010600104580007`, LAWD `11680`) so every run
checks the same row. It only makes outbound calls for connectors you've
configured, and never writes anything — safe to run against production env.
