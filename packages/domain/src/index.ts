import { z } from "zod";

export const evidenceStatusSchema = z.enum(["verified", "stale", "invalid", "unverified"]);
export const evidenceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  value: z.unknown(),
  status: evidenceStatusSchema,
  observedAt: z.iso.datetime(),
  contentHash: z.string().min(1),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const decisionStatusSchema = z.enum([
  "DRAFT", "ANALYZING", "REVIEW_REQUIRED", "APPROVED", "PROPOSED",
  "VOTING", "QUEUED", "EXECUTABLE", "EXECUTED", "REJECTED", "CANCELLED", "FAILED",
]);
export const claimMaterialitySchema = z.enum(["MATERIAL", "SUPPORTING"]);
export const citationCoverageSchema = z.object({
  totalClaims: z.number().int().nonnegative(),
  materialClaims: z.number().int().nonnegative(),
  citedMaterialClaims: z.number().int().nonnegative(),
  coverage: z.number().min(0).max(1),
});
export const decisionReviewOutcomeSchema = z.enum(["APPROVED", "REJECTED"]);
export const decisionJobStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "TIMED_OUT"]);
export const decisionJobSchema = z.object({
  jobId: z.string().min(1),
  organizationId: z.string().min(1),
  status: decisionJobStatusSchema,
  currentStage: z.string().min(1),
  progress: z.number().int().min(0).max(100),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  decisionId: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  inputHash: z.string().min(1),
});
export const advisoryProviderInfoSchema = z.object({
  providerId: z.string().min(1),
  modelVersion: z.string().min(1),
  kind: z.enum(["deterministic-mock", "llm"]),
  configured: z.boolean(),
  credentialsRequired: z.boolean(),
  allowedTools: z.array(z.enum(["evidence.read", "calculator.deterministic"])),
  assetExecutionTools: z.array(z.never()),
});
export const healthSchema = z.object({
  service: z.string(), status: z.literal("ok"), version: z.string(), timestamp: z.iso.datetime(),
});
