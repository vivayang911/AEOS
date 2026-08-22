import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { hashValue } from "./decision-engine";
import { currentRequestId } from "./request-trace";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
type Outcome = "SUCCESS" | "RETRYABLE_FAILURE" | "NON_RETRYABLE_FAILURE" | "CIRCUIT_OPEN";
const retryablePattern = /(TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|NETWORK_ERROR|SERVER_ERROR|RATE_LIMIT|TOO_MANY_REQUESTS|HTTP_?429|HTTP_?5\d\d|RPC_UNAVAILABLE|SOCKET_HANG_UP)/i;
const deterministicPattern = /(PROOF_NOT_READY|MISMATCH|NOT_FINALIZED|NOT_FOUND|INVALID|VERIFICATION_FAILED|EVENT_MISSING|STATIC_VERIFICATION_FAILED)/i;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const safeCode = (error: unknown) => (error instanceof Error ? error.message : "UNKNOWN_ERROR").split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase();
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function isRetryableProviderError(error: unknown) { const code = safeCode(error); return !deterministicPattern.test(code) && retryablePattern.test(code); }

@Injectable()
export class AttestcoinReliabilityService {
  private state: CircuitState = "CLOSED"; private consecutiveFailures = 0; private openUntil = 0;
  constructor(private readonly db: DatabaseService) {}
  configuration() { return { schemaVersion: "provider.reliability.v1", maxAttempts: 3, timeoutMilliseconds: this.timeout(), baseBackoffMilliseconds: 50, circuitFailureThreshold: 3, circuitOpenMilliseconds: 30_000, retryableClasses: ["TIMEOUT","NETWORK","RATE_LIMIT","HTTP_5XX"], deterministicFailuresRetried: false, staleCacheAuthorizesHighImpactDecisions: false, signerCapability: false, broadcastCapability: false, assetExecutionAuthorized: false }; }
  async health(org: string, provider: string) {
    const recent = await this.db.query("SELECT outcome,attempts,duration_ms,error_code,created_at FROM provider_call_observations WHERE organization_id=$1 AND provider=$2 ORDER BY created_at DESC,id DESC LIMIT 20", [org, provider]);
    const calls = recent.rows.length; const successes = recent.rows.filter((row) => row.outcome === "SUCCESS").length; const failures = recent.rows.filter((row) => row.outcome !== "SUCCESS").length; const totalLatency = recent.rows.reduce((sum, row) => sum + Number(row.duration_ms), 0);
    return { provider, circuitState: this.currentState(), consecutiveFailures: this.consecutiveFailures, openUntil: this.state === "OPEN" ? new Date(this.openUntil).toISOString() : null, recentSummary: { calls, successes, failures, successRate: calls ? successes / calls : null, averageDurationMilliseconds: calls ? Math.trunc(totalLatency / calls) : null }, recent: recent.rows, policy: this.configuration(), healthVerifiedByExternalProbe: false, networkProbePerformed: false, assetExecutionAuthorized: false };
  }
  async execute<T>(org: string, provider: string, operation: string, work: () => Promise<T>): Promise<T> {
    const circuitBefore = this.currentState(); const providerRequestId = makeId("providerreq"); const started = Date.now();
    if (circuitBefore === "OPEN") { await this.persist(org, provider, operation, "CIRCUIT_OPEN", 0, circuitBefore, "OPEN", providerRequestId, started, null, "PROVIDER_CIRCUIT_OPEN"); throw new ServiceUnavailableException({ message: "Attestcoin provider circuit is open", code: "PROVIDER_CIRCUIT_OPEN", retryable: true }); }
    let attempts = 0; let lastError: unknown;
    while (attempts < 3) {
      attempts += 1;
      try {
        const result = await this.bounded(work()); this.state = "CLOSED"; this.consecutiveFailures = 0; this.openUntil = 0;
        await this.persist(org, provider, operation, "SUCCESS", attempts, circuitBefore, "CLOSED", providerRequestId, started, hashValue(result), null); return result;
      } catch (error) {
        lastError = error;
        if (!isRetryableProviderError(error)) { this.state = circuitBefore === "HALF_OPEN" ? "CLOSED" : circuitBefore; await this.persist(org, provider, operation, "NON_RETRYABLE_FAILURE", attempts, circuitBefore, this.state, providerRequestId, started, null, safeCode(error)); throw error; }
        if (attempts < 3) await wait(50 * 2 ** (attempts - 1));
      }
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3 || circuitBefore === "HALF_OPEN") { this.state = "OPEN"; this.openUntil = Date.now() + 30_000; } else this.state = "CLOSED";
    const code = safeCode(lastError); await this.persist(org, provider, operation, "RETRYABLE_FAILURE", attempts, circuitBefore, this.state, providerRequestId, started, null, code);
    throw new ServiceUnavailableException({ message: "Attestcoin provider is temporarily unavailable", code, retryable: true, attempts, circuitState: this.state });
  }
  private currentState(): CircuitState { if (this.state === "OPEN" && Date.now() >= this.openUntil) this.state = "HALF_OPEN"; return this.state; }
  private timeout() { const value = Number(process.env.ATTESTCOIN_CALL_TIMEOUT_MS ?? 10_000); return Number.isSafeInteger(value) && value >= 1_000 && value <= 30_000 ? value : 10_000; }
  private async bounded<T>(work: Promise<T>) { let timer: NodeJS.Timeout | undefined; try { return await Promise.race([work, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), this.timeout()); })]); } finally { if (timer) clearTimeout(timer); } }
  private async persist(org: string, provider: string, operation: string, outcome: Outcome, attempts: number, before: CircuitState, after: CircuitState, providerRequestId: string, started: number, resultHash: string | null, errorCode: string | null) {
    await this.db.transaction(async (client) => {
      const saved = await client.query("INSERT INTO provider_call_observations(id,organization_id,provider,operation,outcome,attempts,circuit_before,circuit_after,request_id,provider_request_id,duration_ms,result_hash,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id", [makeId("providercall"), org, provider, operation, outcome, attempts, before, after, currentRequestId(), providerRequestId, Math.max(0, Date.now() - started), resultHash, errorCode]);
      if (after === "OPEN" && before !== "OPEN") { const data = { providerCallObservationId: saved.rows[0].id, provider, operation, errorCode, attempts, circuitState: after, assetExecutionAuthorized: false }; const payload = { eventType: "attestcoin.provider_unavailable", organizationId: org, objectType: "provider", objectId: provider, data }; await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'attestcoin.provider_unavailable',$3,'attestcoin.provider_unavailable','provider',$4,$5,$6)", [makeId("audit"), org, { type: "system", id: "provider-reliability-v1" }, provider, data, hashValue(payload)]); }
    });
  }
}
