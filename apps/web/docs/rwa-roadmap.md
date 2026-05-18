# RWA / On-chain Roadmap

`packages/contracts` 의 ERC-3643 stack을 어떻게 진화시킬지에 대한 4-direction 로드맵.

---

## 1. 현재 보유 자산

`packages/contracts/src/tokenization/`:

```
identity/IdentityRegistry.sol         ─── KYC gating
compliance/ModularCompliance.sol      ─── transfer rule engine
compliance/(modules)                  ─── lockup, max holders, country
oracle/NavOracle.sol                  ─── per-token NAV publisher (단일 자산)
distribution/DividendDistributor.sol  ─── 배당 분배
trading/TransferAgent.sol             ─── 거래 에이전트
token/AssetToken.sol                  ─── ERC-3643 호환 보안토큰
```

`apps/web/lib/blockchain/`:
- ABI auto-export pipeline
- Mock mode (`BLOCKCHAIN_MOCK_MODE`)
- KycRecord bridge to off-chain providers

→ **Infrastructure 70% 완성**. 진짜 deploy + 운영만 남음.

---

## 2. 4 Direction 로드맵

### 🎯 Direction A — NAV Oracle Network (3개월)

**개념**: 우리 valuation engine 출력을 EIP-712 서명된 attestation으로 multi-chain publish. 한국 부동산의 canonical NAV oracle 위치 확보.

**왜**:
- 이미 `NavOracle.sol` + `ValuationRun` 다 있음 → 통합만
- 다른 RWA 프로토콜이 KR RE NAV consume 가능 → dependency moat
- 추가 audit cost 적음

**구현 단계**:
1. `lib/blockchain/attestation.ts` — ValuationRun → EIP-712 typed data + ECDSA 서명
2. `NavAttestor.sol` — 서명 검증 + on-chain publish (NavOracle.publish 호출)
3. Base / Arbitrum sepolia testnet deploy
4. Chainlink Functions / Pyth pull oracle 외부 통합 (선택)

**KPI**: testnet에서 매주 NAV publish, 외부 protocol 1곳 consume

---

### 🎯 Direction B — KR STO Infrastructure-as-a-Service (6-12개월)

**개념**: KR 토큰증권 발행사들에게 ERC-3643 + KR FSC compliance 모듈 SaaS 제공.

**왜**:
- 2024-25 KR 토큰증권 가이드라인 → pilot 발행 100+ 예상
- 우리 ERC-3643 stack 이미 호환
- 첫 진입자 — Securitize (US), Tokeny (EU) 한국 카운터파트 없음

**구현 단계**:
1. KR-specific compliance modules:
   - `KrHoldingLimitModule.sol` — 자본시장법 보유한도
   - `KrTransferRestrictionModule.sol` — 양수도 제한 (1년 lockup 등)
   - `KrReportingModule.sol` — 금융위 분기보고
2. KRX / FSC 연동 게이트웨이 (off-chain)
3. KYC provider (Sumsub / Jumio) 실제 통합 — 현재 mock
4. Custody 통합 (Fireblocks / BitGo / Hashed)
5. FSC 샌드박스 등록 시도

**리스크**: 규제 framework 미finalize. 단계적으로 framework 따라가야.

---

### 🎯 Direction C — On-chain Cap Table / Waterfall (6개월)

**개념**: 우리 `waterfall.ts` 를 Solidity로 port. LP commitment / capital call / distribution / promote 모두 on-chain.

**왜**:
- 4-tier waterfall (capital return → preferred → catch-up → carry) 이미 helper 있음
- LP 입장: promote 계산 투명성 = 강력한 상품성
- side letter MFN 자동 enforce 가능

**구현 단계**:
1. `Waterfall.sol` — 4-tier 분배 로직, LP/GP 자동 split
2. `Commitment.sol` — LP commitment + capital call NFT
3. USDC native distribution (또는 KRW stablecoin)
4. Off-chain valuation → on-chain NAV (Direction A 결합)
5. side letter MFN 자동화

**리스크**: 기존 LP 익숙한 방식 선호. 거버넌스 변경 sales 어려움.

---

### 🎯 Direction D — Cross-chain RWA Bridge (12-24개월)

**개념**: KR 부동산 자산을 multi-chain (EVM + Solana + TON) 토큰으로. Chain별 다른 컴플라이언스 layer.

**구현 단계**:
1. LayerZero / CCIP / Wormhole 통합
2. Compliance proxy: chain별 다른 규제 매핑
3. 단일 "asset record" → multi-chain mirror
4. Cross-chain NAV sync

**리스크**: 가장 복잡. Audit 비용 큼.

---

## 3. 추천 실행 순서

```
Month 1-3   Direction A: NAV Oracle attestation
            └ EIP-712 pipeline + Base testnet deploy
            └ 첫 audit ($50K Halborn 또는 OpenZeppelin)

Month 4-6   Direction C: Cap table on-chain
            └ Waterfall.sol + Commitment.sol
            └ USDC distribution PoC
            └ 첫 pilot LP (NPS / KIC 협의)

Month 7-12  Direction B: KR STO infra
            └ KR-specific modules
            └ FSC 샌드박스 등록
            └ 첫 STO 발행 (REIT 타입 추천)

Year 2+     Direction D: Cross-chain
            └ EVM L2 → Solana → TON
            └ DvP atomic swap
```

---

## 4. 핵심 기술 투자

### Smart contract security
- OpenZeppelin standards (이미 사용)
- Foundry + Hardhat dual workflow
- Slither / Mythril CI integration
- **첫 audit 예산 $50-100K**: Halborn / Trail of Bits / OpenZeppelin

### Oracle infrastructure
- 자체 NavOracle attestation publisher
- Chainlink Functions / Pyth pull oracle 외부 통합
- EIP-712 typed signatures

### Custody
- Fireblocks / BitGo / Anchorage integration
- Multi-sig governance (Safe / Gnosis)
- Hardware-backed signers

### Compliance / KYC
- Sumsub / Jumio (현재 mock → 실제 통합)
- Chainalysis / TRM Labs (sanctions screening)
- ERC-3643 + KR-specific modules

### Stablecoin / settlement
- USDC native (Circle CCTP)
- KRW stablecoin (Line / Kakao 협의)
- Atomic DvP (settlement instant)

### Indexer / Data
- The Graph / Goldsky for event indexing
- 자체 indexer 확장 (이미 OnchainRecord 있음)

---

## 5. 가장 중요한 우선순위

**3개월 안에 가능한 가장 작은 win**:

> 우리 valuation engine output을 EIP-712 서명된 attestation으로 publish + Base testnet에 NavAttestor 컨트랙트 배포 + 외부 prototype consumer 1곳 확보

이게 됐을 때:
- "한국 부동산 NAV oracle"로 외부 protocol 들이 우리 데이터 consume
- ERC-3643 stack 이미 있어서 같은 자산 토큰화도 즉시 가능
- Audit 비용 minimum (publisher 컨트랙트만)
- Marketing: "Canonical KR RE valuation oracle on Base/Arbitrum"

---

## 6. 솔직한 risk view

**가장 큰 함정**:
1. **규제 변경 리스크** — KR STO framework이 fade되면 Direction B 헛수고
2. **Liquidity 부재** — 토큰화 자체보다 secondary market이 어려움. 기존 거래소 토큰증권 라인 활용 필요
3. **Crypto stigma** — KR institutional 일부 "crypto = 도박" 인식. RWA 마케팅에 단어 신중 ("토큰증권" / "DLT" / "on-chain" 우선; "crypto" 후순위)
4. **Tech-regulation mismatch** — build 속도 > 규제 명확화. 너무 멀리 가면 무용

**가장 큰 기회**:
- KR institutional RE = RWA 인프라 가장 부족한 카테고리
- Underwriting + ERC-3643 stack 조합은 글로벌에 직접 비교군 거의 없음
- "Korea valuation oracle" 포지션은 5년 후에도 우리 자리

---

## 더 읽기

- [im-architecture.md](./im-architecture.md) — valuation engine output (NAV oracle source)
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — TokenizedAsset / OnchainRecord / KycRecord
- [system-flow.md](./system-flow.md) — Stage 5 IM → IC → onchain anchor
- [`packages/contracts/README.md`](../../packages/contracts/README.md) — Solidity stack 상세
