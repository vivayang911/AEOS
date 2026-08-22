# API container security runbook

## Local build verification

```powershell
npm run container:verify
```

The gate builds `apps/api/Dockerfile`, verifies a non-root configured user and an OCI healthcheck, and reports `externalCveScan=NOT_AUTHORIZED` because this local-only command never uploads metadata. It never claims vulnerability-scan success. The Dockerfile pins both the Dockerfile frontend and `node:24.19.0-alpine` runtime by digest, installs only the API production workspace in the runtime stage, removes global npm/npx after installation, copies migrations read-only, runs as `node`, and contains no signer material.

Runtime smoke should connect only to a disposable/local database and must verify:

- `/api/v1/health/ready` returns `ready`;
- runtime UID is nonzero;
- no private key, mnemonic, wallet session, or production credential is injected;
- the test container is stopped after verification.

## External Docker Scout boundary

Docker Scout may disclose image package inventory or derived metadata to Docker services. It is disabled unless the operator explicitly sets:

```powershell
$env:ALLOW_DOCKER_SCOUT_METADATA_UPLOAD='I_UNDERSTAND_AND_APPROVE'
npm run security:container
```

Do not set this value without authorization from the owner of the source/image metadata. The scan writes SARIF locally and fails for any High or Critical finding. If external disclosure is prohibited, use an approved fully local scanner instead; until then, record the image as locally built but externally unscanned.

Latest local acceptance on 2026-08-06 was explicitly authorized by the repository owner. Docker Scout indexed 197 packages in `aeos-api:local-security-gate`, detected no vulnerable package, and passed the High/Critical gate. The reviewable result is stored at `reports/security/docker-scout.sarif.json`. This result applies only to the exact digest-pinned image build; rebuilds require a new scan.

## Release response

- Build or runtime smoke failure: block release.
- Root user or missing healthcheck: block release.
- High/Critical CVE: block release, update the pinned base/runtime dependency, rebuild, rerun all gates, and regenerate SBOM.
- Scanner unavailable or unauthorized: do not report the image as scanned; production release remains pending the organization’s accepted scanning control.
