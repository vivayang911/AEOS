# Chain-synchronized Governance Proposal projection

Status: `DATABASE_AND_BUILD_VERIFIED / RUNNING_API_RESTART_PENDING`

## Problem closed by this slice

The accepted Decision-bound `SECURITY_HOLD` lifecycle was created directly from an immutable Decision and canonical chain artifacts. It correctly did not enter the older `proposals` table, because that table accepts only simulated ERC-20 transfer drafts. P0-3 therefore observed zero tenant Proposal rows while the separate immutable Outcome replay was visible.

AEOS now preserves that distinction instead of relabeling the HOLD as an asset transfer. Migration `058_chain_governance_proposal_projection.sql` adds an immutable, organization-scoped `chain_governance_proposals` projection for canonical finality records. `GET /api/v1/proposals` merges those records with ordinary Proposal drafts and identifies them as `recordSource=CHAIN_FINALITY` with `onchainFinalityVerified=true`.

## Required lineage

The accepted row is bound to all of the following:

- the original Decision and frozen Evidence Snapshot;
- the immutable Governance Outcome Evidence record;
- the external Governor Proposal ID and deployed Governor;
- exact target, value and calldata arrays plus a deterministic calldata hash;
- separate Proposal, Vote, Queue and Execute transaction hashes;
- final Execute block number/hash and confirmation observation;
- the zero-value `SECURITY_HOLD` result.

The database trigger rejects a tenant mismatch, Decision/Snapshot/Outcome mismatch, external Proposal mismatch, Execute transaction mismatch, or action-array mismatch. Rows are append-only, protected by RLS, and permanently require `asset_execution_authorized=false`.

## Verification performed

- targeted Proposal service tests: 5/5 pass;
- projection reconciliation: initial insert passes;
- deterministic replay: `created=false` with the identical ID and hashes;
- database integration verifier: migration, tenant visibility, canonical-finality label, Decision lineage, cross-tenant 404, audit record and authority boundary all pass;
- API and Web type checks pass;
- Web contract tests and the 14-route production build pass.

Projection ID: `govproposal_373660b9f448b74b8d852ba7e82b706a`  
Content hash: `0x373660b9f448b74b8d852ba7e82b706a18c89881660cdf2502f162009fbbbc66`  
Calldata hash: `0xb9c8eb5497a428e71e4fc9f013de93215835678079aaec32852635536856a42f`

## Honest boundary

This closes the missing tenant read-model linkage for one accepted governance sample. It does not prove a generic indexer, reorg recovery for imported projections, staging/production operation, economic benefit, autonomous execution or asset authority. The running API process still needs to be restarted on the new build and the Governance page rechecked in a real signed-in browser; the automated process-control approval was unavailable during this batch.

`ASSET EXECUTION AUTHORIZED / false`
