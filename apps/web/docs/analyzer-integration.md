# Deal-document analyzer integration (holdco-analyzer)

The analyzer is a separate Python service that reads a deal's documents end to end,
keeps page-level notes whose quotes are machine-verified against the source, builds a
fact dictionary with standard keys, and generates the bank-format pre-consultation memo
and a semi-annual back-leverage cash-flow model reconciled against the sponsor's Excel.
The OS owns deals, users, documents and audit; the analyzer owns reading and evidence.

## Topology

- `apps/web` (Vercel or node) → HTTPS → `analyzer` container (see `compose.ops.yml`),
  normally on the same host as the ops worker. Python cannot run inside Vercel.
- Auth: the OS verifies the operator session, then calls the analyzer with
  `X-Service-Token` (shared secret, `ANALYZER_SERVICE_TOKEN` = analyzer `HOLDCO_SERVICE_TOKEN`)
  plus `X-Operator` / `X-Operator-Role`. The analyzer records that operator in its own
  hash-chained audit log; the OS records the proxy call through `withAdminApi`.
- Deal mapping: analyzer `deal_id` = `toAnalyzerDealId(deal.dealCode)` (lowercase, `[a-z0-9_-]`).
- Documents: every deal-scoped upload (`/api/deals/[id]/diligence-workstreams/.../deliverables/upload`)
  and every asset upload that belongs to an open deal is forwarded to the analyzer after
  the OS has stored it. Forwarding is fire-and-forget and never fails the upload.
- Outputs stay in the analyzer's volume (`/app/deals/<deal>/`): digest.md, review.md, facts.md,
  prememo docx, model_bl.md, model_check.md. The Deal page panel fetches them live through
  `/api/deals/[id]/analyzer/*`; nothing is copied into Postgres in phase 1.

## Compliance rule that must hold

Anything derived from deal documents goes through the analyzer's per-deal NDA gate
(`nda.json` + provider terms). The OS's generic AI routes (`/api/admin/ai/*`) must not read
deal documents directly; route them through the analyzer in phase 3. Until then the panel
shows the gate state ("AI 읽기 허용/차단") so operators can see what may be sent.

## Proxy surface (`/api/deals/[id]/analyzer/<path>`)

| Method | path                                                                                                                                                                           | analyzer endpoint                                                                                           | role    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------- |
| GET    | `docs/overview`                                                                                                                                                                | `/api/docs/overview/{deal}`                                                                                 | VIEWER  |
| GET    | `docs/outputs/<name>`                                                                                                                                                          | `/api/docs/outputs/{deal}/{name}` (allow-listed names)                                                      | VIEWER  |
| GET    | `docs/facts`                                                                                                                                                                   | `/api/docs/facts/{deal}`                                                                                    | VIEWER  |
| POST   | `docs/digest`, `docs/review`, `docs/index`, `docs/gaps`, `docs/prememo`, `docs/model_bl`, `docs/extract_pack`, `docs/fullread_plan`, `docs/fullread_pack`, `docs/review2_pack` | same name under `/api/` with `deal_id` injected                                                             | ANALYST |
| POST   | `docs/fullread_apply`, `docs/fullread_api`, `docs/second_api`, `docs/review2_api`                                                                                              | same, API paths are gated by the analyzer                                                                   | ANALYST |
| POST   | `docs/kr_docs`, `docs/rentroll`, `docs/injection`                                                                                                                              | rule parsers (등기부·대장·임대차, 렌트롤·T12) and the hidden-text / prompt-injection scan; local, no tokens | ANALYST |
| POST   | `compliance/nda`                                                                                                                                                               | `/api/compliance/nda` (register the deal's NDA)                                                             | ADMIN   |

The client never chooses `deal_id` or `operator`; the proxy injects both.

`docs/prememo` takes an optional `spec`: `prememo` (사전협의서, default),
`icmemo` (투자심의 메모, real-estate format) or `approval` (여신 승인신청서 for the
심사역협의회). The analyzer only accepts those
two names. The drafts are served as `docs/outputs/prememo_<deal>_draft.docx`
and `docs/outputs/icmemo_<deal>_draft.docx`.

## Saving a memo draft into the deal's documents

`POST /api/deals/[id]/analyzer/save-memo` with `{ "spec": "prememo" | "icmemo" }`
(ANALYST, deal scope `mutation`) copies the analyzer docx into the deal's asset
documents as a versioned `REPORT` (`lib/services/analyzer-memo.ts`). Saving
again adds a new version of the same document. The IC packet review then sees
it in the deal's document list. No extracted text is passed to the document
pipeline, so the OS never sends the memo body to its own AI summarizer or
extraction sidecar; the analyzer's NDA gate stays the only place that decides
AI reads. A deal without a linked asset gets a 409 with a message asking to
link the asset first.

Not done on purpose: writing analyzer text into `ValuationRun.underwritingMemo`
/ `keyRisks` / `ddChecklist`. Those fields belong to the valuation engine's
runs, and mixing draft analyzer text into them would blur which numbers the
engine produced. Decide that mapping explicitly before wiring it.

## Local run

```bash
# analyzer (from the holdco-analyzer repo)
docker build -t holdco-analyzer:latest .
export ANALYZER_SERVICE_TOKEN=$(openssl rand -hex 24)
docker compose -f compose.ops.yml up -d analyzer
# OS
echo "ANALYZER_URL=http://127.0.0.1:8008" >> .env
echo "ANALYZER_SERVICE_TOKEN=$ANALYZER_SERVICE_TOKEN" >> .env
```

Phase 2 will add the IC-memo spec for the analyzer's document generator and populate
`ValuationRun.underwritingMemo / keyRisks / ddChecklist`; phase 3 exposes the analyzer as
MCP tools for the OS AI routes and unifies the audit trail.

## Approval chain (우리팀 → 법인 → IB리스크심의회 → 심사역협의회)

| Method | path                                                                      | analyzer endpoint                                                                                                   | role    |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| POST   | `docs/checklists`                                                         | build the bank checklists (IB리스크심의회 부의, 법률점검, 현장실사, 심사보고서, 적도원칙, K-택소노미) with evidence | ANALYST |
| GET    | `docs/checklists`                                                         | `/api/docs/checklists/{deal}`                                                                                       | VIEWER  |
| POST   | `docs/bank_metrics`                                                       | pricing/RORWA, period-weighted risk weight, BIS impact from participation.json (read-only)                          | ANALYST |
| GET    | `workflow`                                                                | `/api/workflow/{deal}` current stage + gate report                                                                  | VIEWER  |
| POST   | `workflow/gate`, `workflow/review`, `workflow/submit`, `workflow/comment` | stage gate, review points, submission, comments                                                                     | ANALYST |
| POST   | `workflow/decide`                                                         | record a stage decision with conditions                                                                             | ADMIN   |

Stage decisions require the OS ADMIN role so an analyst cannot approve their own submission through the OS. `save-memo` also accepts `{ "spec": "approval" }`.

## Agent company (딜부서 → 법인 → IB리스크심의회 → 심사부·심사역협의회, 감사)

Role agents (deal analyst, deal head, entity risk/compliance, IB risk reviewer, credit officer, three committee members and a chair, and an independent auditor) work each approval-chain stage like departments: the maker builds, independent checkers re-check (re-computing numbers rather than trusting them), a department that finds the same issue co-signs it, and the auditor watches every step (hash chains, separation of duties, files changed after submission). Agents only **recommend and submit**; the stage decision is still `workflow/decide` (ADMIN), and the analyzer refuses any `agent:` operator for runs and finding handling.

| Method | OS path                    | Analyzer                                      | What                                                                                    | Min role |
| ------ | -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| GET    | `agents`                   | `/api/agents/{deal}`                          | where the ball is, open findings by department, human actions needed, latest work log   | VIEWER   |
| GET    | `agents/org`               | `/api/agents/org`                             | org chart (departments, roles, who checks whom, stage flow, thresholds)                 | VIEWER   |
| GET    | `agents/ledger`            | `/api/agents/{deal}/ledger` (latest 100)      | hash-chained work ledger with chain check                                               | VIEWER   |
| GET    | `agents/simulation/ledger` | same, `simulation=true`                       | ledger of the last simulation                                                           | VIEWER   |
| POST   | `agents/run`               | `/api/agents/run`                             | `{ "mode": "simulate" }` (writes only `agents/simulation/`) or `{ "mode": "official" }` | ANALYST  |
| POST   | `agents/resolve`           | `/api/agents/resolve` (OS pins `waive:false`) | mark a finding fixed — the next run re-checks it                                        | ANALYST  |
| POST   | `agents/waive`             | `/api/agents/resolve` (OS pins `waive:true`)  | waive a finding (risk accepted) — the next run no longer blocks on it                   | ADMIN    |

`resolve` and `waive` take `{ "finding_id": "F-…", "note": "…" }`; the OS overrides `waive`, `deal_id` and `operator` whatever the client sends. Opinions and work logs download through `docs/outputs/` (`agents_timeline.md`, `agents_state.json`, `agents_opinion_<role>.md`, and the `agents_sim_*` equivalents).
