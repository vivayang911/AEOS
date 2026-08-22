# Security gate runbook

## Commands

Offline, deterministic secret scan:

```powershell
npm run security:secrets
```

Compiled Solidity surface gate:

```powershell
npm run security:contract
```

The contract gate checks the exact TreasuryGuard constructor and write-method allowlist, rejects payable/fallback/receive surfaces, strips Solidity CBOR metadata, disassembles runtime bytecode while respecting PUSH data, and rejects `CREATE`, `CALL`, `CALLCODE`, `DELEGATECALL`, `CREATE2`, `STATICCALL`, and `SELFDESTRUCT` opcodes. Foundry behavior and fuzz tests remain independently required.

Online dependency advisory gate:

```powershell
npm run security:gate
```

The online gate builds the API, runs the secret scan, queries the npm advisory service using the locked dependency graph, fails on any high or critical vulnerability, and writes `reports/security/npm-audit.json`.

## Secret handling guarantees

- Findings contain only detector ID, relative file path, and line number. Matched values are never printed.
- The scan covers source, configuration templates, documentation, Solidity, scripts, and JSON while excluding generated build outputs and dependency directories.
- Detectors cover contextual Ethereum private keys, mnemonic assignments, PEM private keys, common provider tokens, and non-empty sensitive environment assignments.
- Never add a suspected secret to an allowlist merely to pass the gate. Remove it, rotate it, preserve incident evidence, and rerun the scan.

## Dependency response

- Critical/high: block release immediately, determine affected runtime path, upgrade or remove the dependency, rerun all tests and Agent Eval, regenerate SBOM, and document the change.
- Moderate/low: review exploitability and runtime reachability, create a tracked remediation decision, and do not silently ignore it.
- Advisory service unavailable: the offline release gate may still validate code, but a production release remains blocked until the online security gate succeeds.

The report is an advisory snapshot at scan time. It does not replace container, Solidity, IaC, or independent security review.
