# AEOS judge-local run guide

Status: `LOCAL REPRODUCTION PATH / NO HOSTED DEMO CLAIM`.

This path lets a technical judge inspect the frozen accepted testnet lineage without an API write, wallet request, signature, broadcast, vote or asset action. The default configuration uses deterministic Mock adapters for offline-safe application startup. Public testnet transaction links remain independently inspectable from `/verification`.

## Prerequisites

- Git
- Node.js compatible with the repository lockfile and npm `11.x`
- Docker Desktop with Compose
- A modern Chromium browser

No private key, mnemonic, wallet import or paid API credential is required for the read-only Judge Mode path.

## Start the application

```powershell
git clone https://github.com/vivayang911/AEOS.git
Set-Location AEOS
Copy-Item .env.example .env
npm install
docker compose -f infra\docker-compose.yml up -d
npm run dev
```

The API applies versioned PostgreSQL migrations during startup. Wait until both health checks return HTTP 200:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health/live
Invoke-RestMethod http://localhost:4000/api/v1/health/ready
```

## Five-minute judge path

1. Open `http://localhost:3000/verification`.
2. Inspect the 14 accepted checks. Each row separates `PROVES` from `DOES NOT PROVE` and links either a public chain record or an organization-scoped AEOS record.
3. Open `http://localhost:3000/dashboard` and select **REPLAY VERIFIED DEMO**.
4. Follow the frozen stages: Sepolia source → Attestcoin Proof → Creditcoin `TransactionVerified` → immutable Evidence → Snapshot/RAG → exactly eight Agents → ASC anchor → DAO governance → Guard withholding → Outcome.
5. Confirm that every stage shows `ASSET EXECUTION AUTHORIZED / false`.

The dashboard replay is deterministic and read-only. Its chart is explicitly a demo fixture and is not live market data or performance evidence.

## Optional authenticated tenant path

The organization-scoped Evidence, Decision and Governance records require an explicit SIWE login and organization selection. A judge may connect a compatible test wallet to inspect that boundary, but the core `/verification` and Judge Mode narrative do not require a wallet transaction.

Authenticated navigation:

```text
Landing → SIWE → Select Organization → Attestcoin Flow → Evidence Explorer → Decision Room → Governance → Outcome
```

SIWE grants a server-side session only. It does not grant AEOS custody, signing, broadcasting or asset authority. Writes require the in-memory CSRF token and eligible role; refreshing preserves read-only session context but intentionally does not restore write authority without re-authentication.

## Stop local infrastructure

```powershell
# Stop the foreground npm process with Ctrl+C first.
docker compose -f infra\docker-compose.yml stop
```

This preserves local PostgreSQL/Redis volumes. Do not use a volume-removal command unless the reviewer explicitly wants to delete the local demo data.

## Truth boundary

- Accepted live source samples currently use Sepolia only.
- Creditcoin Testnet is the verification/execution chain, not a second source chain.
- Attestcoin proves source-transaction inclusion; AEOS separately validates receipt/log semantics and freezes its own lineage.
- The demonstrated balance is block-specific and stale under the frozen policy.
- No price, liquidity, redemption, profit, autonomous trading or causal AI/PID performance is claimed.
- Whole-PRD status remains `18/18 PARTIAL`.
