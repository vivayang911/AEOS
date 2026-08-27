# P0-4 Proposal Projection Index Update

Status: `RUNTIME_HTTP_VERIFIED / REAL-BROWSER VISUAL ACCEPTANCE PENDING`

## Scope

The existing Judge Verification Index was extended from 13 to 14 checks. Check 14 opens the organization-scoped Governance view for immutable Proposal projection `govproposal_373660b9f448b74b8d852ba7e82b706a`.

It proves only that the accepted HOLD sample binds canonical Decision, Snapshot, Outcome and four governance transactions to one RLS-protected Proposal record. It does not prove a generic chain indexer, reorg recovery, staging/production availability, economic benefit or autonomous execution.

## Verified gates

- Web tests: 27/27 PASS.
- Web typecheck: PASS.
- Workspace typecheck: PASS.
- Next production build: PASS, 14 routes including `/verification`.
- PRD integrity: PASS, 19 documents, 18 chapters, 8 P0 Stories, 11 functional requirements and exactly 8 formal Agents.
- Submission facts: PASS; no hosted Demo or final hosted video is claimed.
- Secret scan: PASS, 709 files and zero findings; secret values were not printed.
- `git diff --check`: PASS.

## Runtime truth

The listener on port 3000 initially served the previous 13-check production bundle. After stopping only the verified AEOS Web listener and starting the latest production build, a direct read-only HTTP probe returned `200` and confirmed all three expected markers: `14 / INDEXED CHECKS`, `Tenant chain-finality Proposal`, and `ASSET EXECUTION AUTHORIZED / false`.

The expanded page must not be relabeled real-browser accepted until a human-visible browser render confirms the 14 checks and Proposal row without an application/layout failure. Browser-control policy denied automated localhost navigation in this run, so no indirect or alternate-browser workaround was used.

`assetExecutionAuthorized=false`; this batch performs no API write, RPC request, wallet request, signature or broadcast.
