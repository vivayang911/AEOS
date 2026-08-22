# Release freeze and provenance runbook

## Scope

`release:manifest` freezes a local backend release candidate after all gates and the final container scan. It binds the exact image digest to the workspace package metadata, lockfile, API Dockerfile, compiled TreasuryGuard artifact, CycloneDX SBOM, Agent Eval, deterministic demo, npm audit, Docker Scout SARIF, and versioned known limitations.

This is local provenance, not production approval. The generated status is always `CANDIDATE_NOT_DEPLOYED`; the image and manifest remain unsigned and unpushed, and AEOS receives no signing, broadcast, deployment, or asset authority.

## Required order

```powershell
npm run release:gate
npm run container:verify

$env:ALLOW_DOCKER_SCOUT_METADATA_UPLOAD='I_UNDERSTAND_AND_APPROVE'
npm run security:container
```

Run the database-backed image smoke described in the container security runbook. Resolve the exact final local image digest, then generate the manifest:

```powershell
$env:AEOS_RELEASE_IMAGE_DIGEST='sha256:EXACT_64_HEX_DIGEST'
npm run release:manifest
```

Outputs:

- `reports/release/aeos-0.1.0.manifest.json`
- `reports/release/aeos-0.1.0.manifest.md`

Running the command twice against unchanged artifacts and image digest must produce the same `releaseHash`. Any bound file or image change requires rerunning all relevant gates and creating a new manifest.

## Acceptance

- all bound artifacts exist, are non-empty, and carry SHA-256 hashes;
- SBOM is CycloneDX;
- npm audit and Docker Scout report zero vulnerabilities;
- API, Agent Eval, contract, and deterministic demo results match the accepted counts/hashes;
- every known limitation has an ID, impact, owner, and open/deferred state;
- exact image digest uses `sha256:<64 lowercase hex>`;
- `manifestSigned=false`, `imageSigned=false`, `deployed=false`, and `assetExecutionAuthorized=false`.

Git commit provenance is intentionally recorded as unavailable until this workspace is initialized as a repository. Do not replace the missing commit with a fabricated value.

## Known limitations

The source of truth is `release/known-limitations.v1.json`. Closing an item requires evidence from the corresponding acceptance workflow. Do not remove a limitation merely to obtain a release status; update its lifecycle through a reviewed versioned change.
