# P0-4 Judge Verification Index

Status: `LOCAL_VERIFIED / PUBLICATION PENDING`

## Purpose

`/verification` gives judges one compact, read-only index for the accepted AEOS lineage. It is intentionally separate from the animated Judge replay: the replay explains the story, while the index exposes exact references, verification destinations and an explicit limit for every claim.

## Indexed checks

The page contains 13 checks covering:

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

Every row separates `PROVES` from `DOES NOT PROVE`, displays its full immutable reference and links to either a public explorer/repository artifact or the organization-scoped AEOS record. The page performs no API write, RPC request, wallet request, signature or broadcast.

## Local acceptance

- Web contract tests: 26/26 PASS, including the dedicated P0-4 zero-authority test.
- Web typecheck: PASS.
- Next production build: PASS, 14 routes including `/verification`.
- Real Chrome: heading and authority boundary visible, 14 table rows (one header plus 13 checks), no horizontal overflow and no AEOS application error.
- PRD integrity and submission-fact gates are rerun after documentation reconciliation.

## Honest boundary

This is a locally verified judge index, not a hosted Demo. Until the new commit is published, the repository link for the P0-3 report is prospective and may return 404 on public GitHub. Current market-state Evidence, chain-synchronized Proposal UI, a second source chain, staging/production E2E, independent audit and economic-performance proof remain outside this acceptance.
