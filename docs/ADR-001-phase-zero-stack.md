# ADR-001: Phase 0 stack and boundaries

Status: Accepted

AEOS starts as a TypeScript monorepo with a Next.js web app and modular NestJS API. Agent orchestration remains a separate Python service because model evaluation and retrieval tooling evolve independently. PostgreSQL/pgvector is the system of record and Redis supports asynchronous work.

No service may move assets in Phase 0. The contract placeholder starts paused and exposes no execution method. Attestcoin, LLM, wallet, Safe, and RPC integrations must enter through explicit adapters after their real schemas and target networks are confirmed.

