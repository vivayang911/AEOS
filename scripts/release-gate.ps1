$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgresql://aeos:aeos@localhost:5432/aeos' }

npm.cmd run verify:prd
if ($LASTEXITCODE -ne 0) { throw 'PRD baseline and traceability verification failed' }
npm.cmd run verify:submission-facts
if ($LASTEXITCODE -ne 0) { throw 'submission fact consistency verification failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'build failed' }
npm.cmd run eval:agents
if ($LASTEXITCODE -ne 0) { throw 'agent eval failed' }
npm.cmd run eval:rag
if ($LASTEXITCODE -ne 0) { throw 'RAG eval failed' }
npm.cmd run demo:verify
if ($LASTEXITCODE -ne 0) { throw 'deterministic demo fixture failed' }
npm.cmd run security:secrets
if ($LASTEXITCODE -ne 0) { throw 'secret scan failed' }
npm.cmd run verify:identity-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'identity and organization integration failed' }
npm.cmd run verify:tenant-rls-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'authenticated tenant RLS integration failed' }
npm.cmd run verify:eight-agent-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'eight-Agent A2A integration failed' }
npm.cmd run verify:rag-memory-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'RAG and memory integration failed' }
npm.cmd run verify:decision-retrieval-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Decision retrieval manifest integration failed' }
npm.cmd run verify:evidence-classification-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Evidence classification and routing integration failed' }
npm.cmd run verify:evidence-request-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Evidence Request Broker integration failed' }
npm.cmd run verify:committee-gap-lineage-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'committee Evidence gap and Decision lineage integration failed' }
npm.cmd run verify:organization-configuration-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'organization configuration integration failed' }
npm.cmd run verify:command-security-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'application command security integration failed' }
npm.cmd run verify:alerts-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'deterministic alert lifecycle integration failed' }
npm.cmd run verify:anomaly-scanner-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'periodic anomaly producer integration failed' }
npm.cmd run verify:audit-exports-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'immutable audit export integration failed' }
npm.cmd run verify:explorer-links-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'trusted explorer link projection integration failed' }
npm.cmd run verify:policy-backtests-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'deterministic policy scenario comparison integration failed' }
npm.cmd run verify:attestcoin-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Attestcoin integration failed' }
npm.cmd run verify:attestcoin-reliability-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Attestcoin provider reliability integration failed' }
npm.cmd run verify:evidence-anchor-handoff-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Evidence Anchor wallet handoff integration failed' }
npm.cmd run verify:evidence-anchor-confirmation-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'Evidence Anchor receipt confirmation integration failed' }
npm.cmd run verify:policy-db -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'policy/execution integration failed' }
npm.cmd run verify:multi-treasury-db
if ($LASTEXITCODE -ne 0) { throw 'multi-organization and multi-treasury concurrency integration failed' }
npm.cmd run verify:treasury-registry-db
if ($LASTEXITCODE -ne 0) { throw 'governed treasury registry integration failed' }
npm.cmd run verify:cockpit-stream-admission-db
if ($LASTEXITCODE -ne 0) { throw 'distributed cockpit stream admission integration failed' }
npm.cmd run verify:cockpit-projection-fanout-db
if ($LASTEXITCODE -ne 0) { throw 'distributed cockpit projection fan-out integration failed' }
npm.cmd run verify:cockpit-fanout-recovery-db
if ($LASTEXITCODE -ne 0) { throw 'cockpit fan-out listener recovery and burst integration failed' }
npm.cmd run verify:cockpit-sse-http-e2e
if ($LASTEXITCODE -ne 0) { throw 'authenticated cockpit SSE HTTP end-to-end failed' }
npm.cmd run verify:cockpit-sse-authenticated-load
if ($LASTEXITCODE -ne 0) { throw 'authenticated cockpit SSE socket capacity and slow-consumer load failed' }
npm.cmd run verify:adaptive-pid-db
if ($LASTEXITCODE -ne 0) { throw 'adaptive PID governed-envelope integration failed' }
npm.cmd run verify:governed-skills-db
if ($LASTEXITCODE -ne 0) { throw 'governed Skill distillation and PID binding integration failed' }
npm.cmd run verify:evidence-bound-pid-db
if ($LASTEXITCODE -ne 0) { throw 'Evidence-derived observed-state PID integration failed' }
npm.cmd run verify:treasury-outcomes-db
if ($LASTEXITCODE -ne 0) { throw 'immutable descriptive Treasury outcome integration failed' }
npm.cmd run verify:treasury-transaction-costs-db
if ($LASTEXITCODE -ne 0) { throw 'Evidence-bound Treasury transaction cost integration failed' }
npm.cmd run verify:counterfactual-methodologies-db
if ($LASTEXITCODE -ne 0) { throw 'prospective counterfactual methodology governance integration failed' }
npm.cmd run verify:counterfactual-assessments-db
if ($LASTEXITCODE -ne 0) { throw 'Evidence-complete counterfactual assessment integration failed' }
npm.cmd run verify:outcome-memory-candidates-db
if ($LASTEXITCODE -ne 0) { throw 'governed Outcome Memory promotion integration failed' }
npm.cmd run verify:database-restore
if ($LASTEXITCODE -ne 0) { throw 'isolated PostgreSQL backup and restore drill failed' }

Push-Location contracts
try {
  $forgeCommand = if ($env:FORGE_BIN) { $env:FORGE_BIN } else { 'forge' }
  & $forgeCommand fmt --check
  if ($LASTEXITCODE -ne 0) { throw 'contract formatting failed' }
  & $forgeCommand build
  if ($LASTEXITCODE -ne 0) { throw 'contract build failed' }
  & $forgeCommand test -vv
  if ($LASTEXITCODE -ne 0) { throw 'contract tests failed' }
  & $forgeCommand snapshot --check --no-match-contract ContractInvariants
  if ($LASTEXITCODE -ne 0) { throw 'contract gas regression failed' }
} finally { Pop-Location }
npm.cmd run security:contract
if ($LASTEXITCODE -ne 0) { throw 'contract surface security gate failed' }
npm.cmd run security:evidence-anchor
if ($LASTEXITCODE -ne 0) { throw 'Evidence Anchor ASC surface security gate failed' }
npm.cmd run security:aeos-evidence-source
if ($LASTEXITCODE -ne 0) { throw 'AEOS Evidence Source surface security gate failed' }
npm.cmd run security:policy-registry
if ($LASTEXITCODE -ne 0) { throw 'Policy Registry surface security gate failed' }
$env:POLICY_REGISTRY_PLAN_SUMMARY_ONLY = '1'
$env:POLICY_REGISTRY_GOVERNANCE_ADDRESS = '0x1111111111111111111111111111111111111111'
npm.cmd run prepare:policy-registry
if ($LASTEXITCODE -ne 0) { throw 'Policy Registry deterministic deployment plan failed' }
$env:TREASURY_GUARD_PLAN_SUMMARY_ONLY = '1'
$env:TREASURY_GUARD_DEPLOY_CHAIN_ID = '102031'
$env:TREASURY_GUARD_GOVERNANCE_ADDRESS = '0x1111111111111111111111111111111111111111'
$env:TREASURY_GUARD_GUARDIAN_ADDRESS = '0x2222222222222222222222222222222222222222'
$env:POLICY_REGISTRY_ADDRESS = '0x4444444444444444444444444444444444444444'
npm.cmd run prepare:treasury-guard
if ($LASTEXITCODE -ne 0) { throw 'Treasury Guard deterministic deployment plan failed' }
$env:TREASURY_POLICY_CHAIN_ID = '102031'
$env:TREASURY_POLICY_GOVERNANCE_ADDRESS = '0x1111111111111111111111111111111111111111'
$env:POLICY_REGISTRY_ADDRESS = '0x2222222222222222222222222222222222222222'
$env:TREASURY_GUARD_ADDRESS = '0x3333333333333333333333333333333333333333'
$env:TREASURY_GUARD_PAUSED = 'true'
$env:POLICY_REGISTRY_LATEST_VERSION = '0'
$env:TREASURY_GUARD_POLICY_VERSION = '0'
$env:TREASURY_POLICY_HASH = '0x4444444444444444444444444444444444444444444444444444444444444444'
$env:TREASURY_POLICY_VERSION = '1'
$env:TREASURY_POLICY_VALID_FROM = '100'
$env:TREASURY_POLICY_VALID_UNTIL = '200'
$env:TREASURY_POLICY_MAX_NATIVE_VALUE = '0'
$env:TREASURY_POLICY_ALLOWED_TARGETS = '0x5555555555555555555555555555555555555555'
$env:TREASURY_POLICY_ALLOWED_SELECTORS = '0xa9059cbb'
npm.cmd run prepare:policy-activation-batch
if ($LASTEXITCODE -ne 0) { throw 'DAO policy activation batch preparation failed' }
npm.cmd run verify:policy-unpause-handoff-fixture
if ($LASTEXITCODE -ne 0) { throw 'DAO policy activation readback and unpause handoff fixture failed' }
$env:EVIDENCE_ANCHOR_PLAN_SUMMARY_ONLY = '1'
npm.cmd run prepare:evidence-anchor
if ($LASTEXITCODE -ne 0) { throw 'Evidence Anchor deterministic deployment plan failed' }
$env:AEOS_EVIDENCE_SOURCE_REPORTER_ADDRESS = '0x444D510728FB8072351cB5d0E88432e6a8501DFA'
$env:AEOS_EVIDENCE_SOURCE_PLAN_SUMMARY_ONLY = '1'
npm.cmd run prepare:aeos-evidence-source
if ($LASTEXITCODE -ne 0) { throw 'AEOS Sepolia Evidence Source deterministic deployment plan failed' }

$sbomDirectory = Join-Path $PSScriptRoot '..\reports\sbom'
New-Item -ItemType Directory -Force -Path $sbomDirectory | Out-Null
$sbomPath = Join-Path $sbomDirectory 'npm.cdx.json'
npm.cmd sbom --sbom-format cyclonedx | Set-Content -Encoding utf8 -Path $sbomPath
if ($LASTEXITCODE -ne 0) { throw 'SBOM generation failed' }
$sbom = Get-Content -Raw -Path $sbomPath | ConvertFrom-Json
if ($sbom.bomFormat -ne 'CycloneDX') { throw 'SBOM validation failed' }

Write-Output ([pscustomobject]@{ status='PASS'; sbom=$sbomPath; apiTests='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; apiSuites='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; webTests='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; cockpitUi='PASS'; agentEval='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; ragEval='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; ragMemory='PASS'; decisionRetrieval='PASS'; evidenceClassification='PASS'; evidenceRequestBroker='PASS'; committeeEvidenceGapLineage='PASS'; evidenceAnchorHandoff='PASS'; evidenceAnchorConfirmation='PASS'; governanceOutcomeEvidence='PASS'; evidenceAnchorDeploymentPlan='PASS'; aeosEvidenceSourceDeploymentPlan='PASS'; policyRegistryDeploymentPlan='PASS'; treasuryGuardDeploymentPlan='PASS'; daoPolicyActivationBatch='PASS'; daoPolicyActivationReadback='PASS'; daoPolicyUnpauseHandoff='PASS'; treasuryPolicyBindingEngine='PASS'; multiTreasuryConcurrency='PASS'; treasuryRegistry='PASS'; adaptivePid='PASS'; governedSkills='PASS'; evidenceBoundPid='PASS'; treasuryOutcomes='PASS'; treasuryTransactionCosts='PASS'; counterfactualMethodologies='PASS'; counterfactualAssessments='PASS'; outcomeMemoryLifecycle='PASS'; databaseLogicalRestoreDrill='PASS'; eightAgentA2A='PASS'; tenantRls='PASS_CURRENT_RUN_SEE_RUNNER_OUTPUT'; identityOrganization='PASS'; organizationConfiguration='PASS'; commandSecurity='PASS'; requestTraceAudit='PASS'; transactionalOutbox='PASS'; deterministicAlerts='PASS'; periodicAnomalyProducers='PASS'; attestcoinReliability='PASS'; auditExports='PASS'; explorerLinks='PASS'; policyBacktests='PASS'; policyTransactionImpact='PASS'; governorVotingEvidence='PASS'; demoFixture='PASS'; contractTests='PASS_CURRENT_RUN_SEE_FORGE_OUTPUT'; contractBehaviorFuzz='PASS'; contractInvariants='PASS_CURRENT_RUN_SEE_FORGE_OUTPUT'; contractGasRegression='PASS'; contractSurface='VERIFIED'; evidenceAnchorSurface='VERIFIED'; aeosEvidenceSourceSurface='VERIFIED'; policyRegistrySurface='VERIFIED'; note='Counts are intentionally not hard-coded; the preceding authoritative test, eval, RLS and Forge runner output is part of this gate result.' } | ConvertTo-Json -Compress)


