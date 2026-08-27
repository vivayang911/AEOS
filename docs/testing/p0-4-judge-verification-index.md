# P0-4 Judge Verification Index

Status: `LOCAL_VERIFIED / PUBLICATION PENDING`

## Purpose

`/verification` gives judges one compact, read-only index for the accepted AEOS lineage. It is intentionally separate from the animated Judge replay: the replay explains the story, while the index exposes exact references, verification destinations and an explicit limit for every claim.

## Indexed checks

The page contains 14 checks covering:

1. Sepolia source observation.
2. Frozen Attestcoin/USC Proof artifact.
3. Creditcoin `TransactionVerified` finality.
4. Organization-isolated immutable Evidence.
5. The cited exactly-eight-role Decision.
6. `EvidenceAnchorASC` deployment.
7. Canonical `EvidenceAnchored` finality.
8. Decision-bound Governor Proposal.
9. Vote and quorum.
10. Timelock Queue.
11. Zero-value Guard Execute.
12. Immutable Outcome Evidence artifact.
13. P0-3 bounded real-Chrome acceptance record.
14. The accepted sample's immutable, organization-scoped chain-finality Proposal projection.

Every row separates `PROVES` from `DOES NOT PROVE`, displays its full immutable reference and links to either a public explorer/repository artifact or the organization-scoped AEOS record. The page performs no API write, RPC request, wallet request, signature or broadcast.

## Local acceptance

- Web contract tests: 27/27 PASS, including the dedicated P0-4 zero-authority test.
- Web typecheck: PASS.
- Next production build: PASS, 14 routes including `/verification`.
- Previous real-Chrome acceptance: heading and authority boundary visible, 14 table rows (one header plus the then-current 13 checks), no horizontal overflow and no AEOS application error.
- The new 14th check requires one post-build browser render before the expanded index can be relabeled browser-accepted.
- PRD integrity and submission-fact gates are rerun after documentation reconciliation.

## Honest boundary

This is a locally verified judge index, not a hosted Demo. Until the new commit is published, newly added repository references may be unavailable on public GitHub. The accepted sample's Proposal projection is tenant-visible after SIWE and does not establish a generic chain indexer. Current market-state Evidence, generic indexing/reorg recovery, a genuinely second source chain, staging/production E2E, independent audit and economic-performance proof remain outside this acceptance.
