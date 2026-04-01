# Institutional Readiness Gap Analysis

This platform is now strong enough for internal research, pilot underwriting, and committee-support workflows. It is not yet a fully closed institutional production stack.

## Closed In This Iteration

- role-aware admin access with `VIEWER`, `ANALYST`, and `ADMIN` credentials
- request-level audit events for asset creation, asset updates, enrichment, valuation runs, and document uploads
- security console at `/admin/security`
- valuation approval state with approver label and notes
- explicit storage-readiness signaling for local-vs-external document storage posture

## Still Open

- external object storage write path is not implemented yet
- SSO / IdP integration is not implemented
- database migrations still contain older shadow-db compatibility issues and may require manual cleanup before greenfield deploys
- no centralized secrets rotation workflow yet
- no background queue isolation for long-running extraction and enrichment
- no immutable evidence-retention policy yet

## Recommended Next Sequence

1. Replace local document storage with S3-compatible object storage.
2. Replace shared basic auth with SSO and user-to-role mapping.
3. Normalize historical Prisma migrations so `migrate dev` and `migrate deploy` are both clean from scratch.
4. Add signed report approvals and deeper model-governance checkpoints.
5. Add error monitoring, job telemetry, and DB backup policy.
