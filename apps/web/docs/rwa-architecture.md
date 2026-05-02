# RWA Architecture (현재 구현 상태)

`packages/contracts` Solidity stack + `apps/web/lib/blockchain` TS 통합 부분의 실제 구현 상세. 학습 + onboarding 용.

---

## 1. 컨트랙트 디렉토리

```
packages/contracts/src/
  registry/
    DataCenterAssetRegistry.sol         ─── 자산 ID 등록 + 메타데이터 anchor
    NamespacedRegistrar.sol             ─── slug-aware registrar
  tokenization/
    identity/IdentityRegistry.sol       ─── KYC-gated wallet registry
    compliance/ModularCompliance.sol    ─── transfer rule engine
    compliance/(modules)                ─── lockup / max-holders / country
    token/AssetToken.sol                ─── ERC-3643 호환 보안토큰
    oracle/NavOracle.sol                ─── per-token NAV publisher
    distribution/DividendDistributor.sol ─── 배당 분배
    distribution/Waterfall.sol          ─── 4-tier promote/hurdle (NEW)
    trading/TransferAgent.sol           ─── compliance-gated 거래 에이전트
  governance/
    EmergencyCouncil.sol                ─── 긴급 일시정지 / 권한 회수
  interfaces/
    IPausableTarget.sol                 ─── pause/unpause 표준
```

---

## 2. ERC-3643 stack 흐름

ERC-3643 (T-REX) 표준은 KYC-gated 보안토큰을 위한 합의된 layout. 우리 구현:

```
                 ┌─────────────────────────┐
LP wallet ──KYC─▶│ IdentityRegistry        │ "이 주소는 verified KR investor"
                 └────────────┬────────────┘
                              │ verified
                              ▼
                 ┌─────────────────────────┐
                 │ ModularCompliance        │ "transfer 가능한가?"
                 │   ├ lockup module        │
                 │   ├ max-holders module   │
                 │   └ country-restrict mod │
                 └────────────┬────────────┘
                              │ allowed
                              ▼
                 ┌─────────────────────────┐
LP wallet ◀──tx──│ AssetToken (ERC-3643)   │ 보안토큰 자체
                 └─────────────────────────┘
```

각 transfer는 `IdentityRegistry.isVerified()` + `ModularCompliance.canTransfer()` 둘 다 통과해야 진행됨.

---

## 3. NavOracle + Attestation 파이프라인

**문제**: 부동산 토큰 가격 = 우리 valuation engine output. 이걸 어떻게 trustless하게 on-chain에 publish?

**답**: EIP-712 서명 attestation. 우리 서버가 서명, 컨트랙트가 검증.

### Off-chain 측 (`lib/blockchain/attestation.ts`)

```ts
const att = buildNavAttestation({
  valuationRun: { id, baseCaseValueKrw, createdAt },
  asset: { assetCode }
});
// att = { assetId, quoteSymbol, navPerShare, navTimestamp, nonce, runRef }

const { signature, signer } = await signNavAttestation(att, domain, PRIVATE_KEY);
// signature = 65 bytes EIP-712 typed data signature
```

### On-chain 측 (NavAttestor + NavOracle)

```
ValuationRun (DB)
       │
       │ buildNavAttestation
       ▼
   NavAttestation struct
       │
       │ signNavAttestation (EIP-712, ECDSA)
       ▼
   {att, signature}
       │
       │ NavAttestor.publish(att, signature)
       ▼
   ECDSA.recover → matches authorized signer
       │
       │ ↓ forward
       ▼
   NavOracle.publish(navPerShare, navTimestamp)
       │
       │ event NavPublished(epoch, navPerShare, navTimestamp, writer)
       ▼
   downstream consumers (DividendDistributor, TransferAgent, external protocols)
```

### Replay 보호

EIP-712 도메인:
```
domain = {
  name: "NavAttestor",
  version: "1",
  chainId: 84532,           // Base Sepolia
  verifyingContract: 0x...  // 이 컨트랙트
}
```

`chainId` 가 도메인 separator의 일부 → 같은 attestation을 다른 chain에서 replay 불가.

추가로 `nonce` (createdAt epoch ms) + per-asset 단조 timestamp 체크 → 같은 chain에서도 replay 불가.

---

## 4. Waterfall 분배 흐름

**개념**: LP가 stablecoin commit → 자산 운영 → exit 시 distribute() 호출 → 4-tier 자동 분배.

### Tier 단계

```
                  Distribution arrives (USDC)
                            │
                            ▼
        ┌─────────── Tier 1: Return of Capital ──────────┐
        │   LP 100% until cum = totalCommitments         │
        └────────────────────┬───────────────────────────┘
                             │ remaining > 0
                             ▼
        ┌─────────── Tier 2: Preferred Return ───────────┐
        │   LP 100% until cum = hurdle × commitments     │
        │     ex) 10% hurdle on $100M → cap = $10M       │
        └────────────────────┬───────────────────────────┘
                             │ remaining > 0
                             ▼
        ┌─────────── Tier 3: GP Catch-up ────────────────┐
        │   GP 100% until ratio matches promoteBps/      │
        │     (1e4 - promoteBps) of LP preferred         │
        └────────────────────┬───────────────────────────┘
                             │ remaining > 0
                             ▼
        ┌─────────── Tier 4: Carried Interest ───────────┐
        │   {100 - promote}% LP / {promote}% GP          │
        │     ex) 15% promote → 85% LP / 15% GP          │
        └────────────────────────────────────────────────┘
```

### 코드 매핑

`Waterfall.distribute(amount)` 의 각 단계:

```solidity
// Tier 1
uint256 cap1 = totalCommitments - cumReturnOfCapital;
toReturnOfCapital = remaining > cap1 ? cap1 : remaining;
cumReturnOfCapital += toReturnOfCapital;
remaining -= toReturnOfCapital;

// Tier 2
uint256 hurdleTotal = (totalCommitments * hurdleBps) / 1e4;
uint256 cap2 = hurdleTotal - cumPreferred;
toPreferred = remaining > cap2 ? cap2 : remaining;
cumPreferred += toPreferred;
remaining -= toPreferred;

// Tier 3
uint256 desiredCatchup = (cumPreferred * promoteBps) / (1e4 - promoteBps);
uint256 cap3 = desiredCatchup - cumCatchup;
toCatchup = remaining > cap3 ? cap3 : remaining;
cumCatchup += toCatchup;
gpAccrued += toCatchup;
remaining -= toCatchup;

// Tier 4
toCarry = remaining;
uint256 gpCarry = (toCarry * promoteBps) / 1e4;
gpAccrued += gpCarry;
// LP 부분은 _allocateLpPool에서 pro-rata
```

### LP 청구 흐름

각 distribute() 호출이 `claimable[lp]` 에 누적. LP는 언제든 `withdraw()` 호출:

```
LP.withdraw()
  ↓
amount = claimable[msg.sender]
claimable[msg.sender] = 0
stable.safeTransfer(msg.sender, amount)
  ↓
emit ClaimWithdrawn(lp, amount)
```

GP는 `withdrawGp()` 호출 → `gpAccrued` 전액 인출.

---

## 5. 배포 흐름 (testnet)

### 사전 준비

1. **EOA + testnet ETH**: deployer EOA 만들고 Base Sepolia faucet에서 ETH 받기
   - https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
   - https://portal.cdp.coinbase.com/products/faucet
2. **USDC testnet**: Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
3. **AssetToken 사전 배포**: 이미 있는 ERC-3643 stack으로 자산 토큰 발행
4. **Etherscan API key**: basescan.org에서 무료 발급

### 배포

```bash
cd packages/contracts
cp .env.testnet.example .env.testnet
# .env.testnet 수정: PRIVATE_KEY, STABLE_TOKEN_ADDRESS, GP_ADDRESS, ASSET_TOKEN_ADDRESS

source .env.testnet
npx hardhat run scripts/deploy-rwa-stack.ts --network baseSepolia
```

출력 manifest 마지막 부분:

```
MANIFEST_JSON_BEGIN
{
  "network": "baseSepolia",
  "chainId": "84532",
  "contracts": {
    "navOracle": "0x...",
    "waterfall": "0x..."
  },
  ...
}
MANIFEST_JSON_END
```

### 검증

```bash
npx hardhat verify --network baseSepolia <NAV_ORACLE_ADDR> \
  <ASSET_TOKEN> <SYMBOL_BYTES32> <ADMIN> <WRITER> <PAUSER>

npx hardhat verify --network baseSepolia <WATERFALL_ADDR> \
  <STABLE> <GP> <HURDLE_BPS> <PROMOTE_BPS> <ADMIN>
```

---

## 6. apps/web 통합

배포 후 manifest 주소를 `apps/web/lib/blockchain/tokenization-config.ts` 에 등록:

```ts
export const TOKENIZATION_DEPLOYMENTS = {
  baseSepolia: {
    chainId: 84532,
    navOracle: '0x...',
    waterfall: '0x...',
    assetToken: '0x...',
    stable: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorerBaseUrl: 'https://sepolia.basescan.org'
  }
};
```

서버에서 attestation publish:

```ts
import { buildNavAttestation, signNavAttestation } from '@/lib/blockchain/attestation';
import { getRegistryChainClients } from '@/lib/blockchain/client';

const att = buildNavAttestation({ valuationRun, asset });
const { signature } = await signNavAttestation(att, domain, process.env.NAV_SIGNER_KEY);

// On-chain publish via NavAttestor (writer 컨트랙트, 별도 작성 필요)
const { walletClient } = getRegistryChainClients();
await walletClient.writeContract({
  address: NAV_ATTESTOR_ADDRESS,
  abi: NAV_ATTESTOR_ABI,
  functionName: 'publish',
  args: [att, signature]
});
```

---

## 7. v0 한계 (audit 전 해결할 것)

### Waterfall.sol
- O(n) LP iteration in `_allocateLpPool` → 50+ LP 시 gas 폭발. **Merkle-claim 패턴**으로 마이그레이션 필요.
- Vesting / clawback 미지원 — LPA-specific 조항.
- GP catch-up 정적 공식 — LPA에 따라 dollar amount vs ratio targeting 다름.
- Side-letter MFN 미강제 — `SideLetter` 테이블 읽는 sibling 컨트랙트 필요.

### NavAttestor (TODO)
- 컨트랙트 자체는 아직 작성 안 됨 — TS attestation pipeline만 있음.
- 다음 step: `NavAttestor.sol` 작성하여 EIP-712 verify + NavOracle.publish forward.

### 일반
- 정식 audit 없음 (Halborn / Trail of Bits / OpenZeppelin)
- 가스 최적화 안 됨 (LP pro-rata loop)
- 모든 컨트랙트가 `pause` 가능 — 이건 좋지만 paused 동안 LP claim도 막힘 (의도 vs 부작용 검토 필요)

---

## 8. 다음 단계

**Phase 1 — 3개월 (MVP testnet)**
- [ ] `NavAttestor.sol` 작성 (EIP-712 verifier)
- [ ] Base Sepolia 배포 + Etherscan 검증
- [ ] Apps/web에서 attestation publish 자동화 (cron 또는 trigger)
- [ ] Waterfall 단위 테스트 (Hardhat fork로 USDC 사용)
- [ ] 첫 외부 protocol 1곳에서 NAV consume 시도 (Pyth pull oracle 등록)

**Phase 2 — 6개월 (audit + KR module)**
- [ ] `KrHoldingLimitModule.sol` / `KrTransferRestrictionModule.sol`
- [ ] OpenZeppelin / Halborn audit ($50-100K)
- [ ] FSC 샌드박스 application (KR STO framework 성숙 시)

**Phase 3 — 12개월 (mainnet pilot)**
- [ ] Mainnet (Base / Arbitrum One) 배포
- [ ] 첫 pilot 발행 (REIT vehicle 추천)
- [ ] LayerZero / CCIP cross-chain 통합

---

## 더 읽기

- [rwa-roadmap.md](./rwa-roadmap.md) — 4-direction 전략 로드맵
- [data-model-cheatsheet.md](./data-model-cheatsheet.md) — TokenizedAsset / OnchainRecord / KycRecord
- [system-flow.md](./system-flow.md) — Stage 5 → onchain anchor 흐름
- [`packages/contracts/README.md`](../../packages/contracts/README.md) — Solidity stack 상세
- ERC-3643 표준: https://github.com/ERC3643/ERC-3643
- T-REX reference: https://github.com/TokenySolutions/T-REX
