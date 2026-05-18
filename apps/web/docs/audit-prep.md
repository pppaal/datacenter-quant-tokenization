# Audit Preparation

Smart contract audit 진입 전 우리가 갖춰야 할 것 + 현재 자동화 stack + 외부 audit 절차.

---

## 1. 자동화된 정적/형식 검증

`.github/workflows/contracts-ci.yml`에 모두 wired-in:

| Tool | 단계 | 무엇 잡나 |
|---|---|---|
| **solhint** | lint | 코딩 컨벤션, 스타일 |
| **hardhat compile** | build | 문법 / type / `viaIR` IR 검증 |
| **unit tests** | test | 비즈니스 로직 happy path + 명시적 edge |
| **integration tests** | test | 컨트랙트 간 handoff (Registry ↔ Council) |
| **fuzz tests** | test:fuzz | property 기반 무작위 입력 (fast-check) |
| **invariant tests** | test:invariant | 상태 시퀀스 invariant (e.g. balance never negative) |
| **gas regression** | test:gas-baseline | gas 사용량 변경 추적 |
| **Slither** | static analysis | reentrancy / unused vars / shadowing / dangerous patterns |
| **Aderyn (Cyfrin)** | static analysis | Rust-based static analyzer, 빠르고 modern |
| **SMTChecker (Z3)** | formal verify | overflow / underflow / div-by-zero / popEmptyArray / outOfBounds proof |
| **Mythril** | symbolic exec | reentrancy / integer / call-data manipulation 발견 (이번 추가) |

→ PR 마다 모두 자동 실행. Mythril은 continue-on-error (advisory).

---

## 2. 외부 audit 진입 직전 체크리스트

### Code freeze
- [ ] `main` branch protected, audit 시작 시점 commit hash 기록
- [ ] 모든 `// TODO` / `// FIXME` 해소 또는 audit scope 외로 명시
- [ ] 모든 컨트랙트에 NatSpec (@notice / @dev / @param / @return) 완비

### Tests
- [ ] 단위 테스트 coverage ≥ 95%
- [ ] Fuzz / invariant 캠페인 deep mode (`FAST_CHECK_RUNS=200`) 1회 통과
- [ ] Gas baseline 안정 — drift 없음

### Static
- [ ] Slither 0 high / 0 medium 또는 모든 finding 명시적으로 dismissed (slither.config.json `triage`)
- [ ] Mythril manual review — false positive 정리
- [ ] Aderyn 0 unresolved high

### Documentation
- [ ] `audit-trail.md` per-contract 업데이트 (이미 `scripts/audit-trail.ts` 있음)
- [ ] Threat model 문서 (이 doc + 컨트랙트별 README)
- [ ] Trust assumptions 명시 (admin role / signer key / oracle writer 등)

### Deployment
- [ ] Testnet 배포 1주일 이상 운영 + tx 누적
- [ ] Manifest 잠금 (deployment.manifest.json checked in)
- [ ] Etherscan / Sourcify verified bytecode

---

## 3. 권장 audit firm

| Firm | 특화 | 추정 비용 (USD) | 기간 |
|---|---|---|---|
| **OpenZeppelin** | EIP / 표준 / 가장 institutional | $80-150K | 4-6 weeks |
| **Trail of Bits** | 깊은 formal / 어려운 invariant | $100-200K | 6-8 weeks |
| **Halborn** | 빠르고 실무적 | $50-100K | 3-4 weeks |
| **Spearbit** | DAO 형태, 다양한 perspective | $50-120K | 4-6 weeks |
| **Zellic** | RWA / DeFi 특화 | $60-120K | 4-6 weeks |
| **Code4rena** (contest) | 크라우드 audit, 다양한 issue 발견 | $30-80K | 2 weeks contest + 1-2 weeks fix |

**우리 상황 추천**: Halborn (속도) + Code4rena (커뮤니티 검증) 조합. 첫 audit 이후 6-12 개월 운영 후 OpenZeppelin / Trail of Bits로 deeper review.

---

## 4. Bug bounty (audit 후)

배포 후 운영 단계:
- **Immunefi**: 일반적 bug bounty platform. 보통 critical $100K-$1M
- **Code4rena Bot Race**: 자동화된 ongoing review

권장: TVL 기준 max critical reward 산정 (TVL의 5-10%).

---

## 5. 우리 컨트랙트 별 threat surface

### NavOracle
- **공격 표면**: 잘못된 NAV publish → 토큰 가격 조작
- **방어**: ORACLE_WRITER_ROLE 제한, 단조 timestamp, pause-able
- **주의**: writer key compromise 시 immediate rotate + pause

### NavAttestor (NEW)
- **공격 표면**: signature replay, signer compromise
- **방어**: chainId in domain, per-signer nonce, signer 다중화
- **주의**: 서명 키는 HSM / Fireblocks 권장. EOA로 보관 시 단독 보관 금지.

### Waterfall
- **공격 표면**: 잘못된 분배 비율, GP / LP 계산 오류, LP iteration DoS
- **방어**: basis-point 단위 (no float), CONFIG_ROLE 제한, pause-able
- **알려진 v0 한계**: O(n) LP loop → 50+ LP 시 gas DoS. Merkle 마이그레이션 필수.

### IdentityRegistry / ModularCompliance
- **공격 표면**: KYC bypass, compliance 모듈 우회
- **방어**: 모듈 화이트리스트, registry 변경 시 emergency council 가능

### DividendDistributor
- **공격 표면**: pull vs push pattern, gas griefing
- **방어**: pull pattern (claim), reentrancy guard

---

## 6. Trust assumptions (외부 disclosure 용)

LP / 외부 user에게 명시할 trust:

1. **Multisig admin** (DEFAULT_ADMIN_ROLE): 4-of-7 Safe 권장. 모든 critical role grant / pause / config change 가능.
2. **Oracle writer**: 단일 EOA 또는 multisig. NAV 직접 publish 가능. 잘못된 값 publish 시 LP 손실 가능 → SLA + 외부 검증자 권장.
3. **EIP-712 signer**: HSM / Fireblocks 권장. 서명 키 compromise 시 attacker가 임의 NAV publish 가능 (단, NavOracle의 timestamp monotonicity가 backstop).
4. **Compliance modules**: 모듈 변경은 emergency council만 가능.
5. **Stablecoin issuer**: USDC = Circle. KRW stablecoin 사용 시 발행자별 추가 trust.

---

## 7. 운영 단계 모니터링

배포 후 ongoing:
- **Tenderly / Defender**: Tx 모니터링, alert 자동화
- **The Graph**: 이벤트 indexing, 대시보드
- **Forta**: 실시간 anomaly detection
- **Immunefi**: bug bounty 운영

---

## 더 읽기

- [rwa-architecture.md](./rwa-architecture.md) — 컨트랙트 stack 상세
- [`packages/contracts/README.md`](../../packages/contracts/README.md) — Solidity build / test 명령
- [`.github/workflows/contracts-ci.yml`](../../.github/workflows/contracts-ci.yml) — 실제 CI definition
- ERC-3643 표준: https://github.com/ERC3643/ERC-3643
- Trail of Bits "Building Secure Contracts": https://github.com/crytic/building-secure-contracts
