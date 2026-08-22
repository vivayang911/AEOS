export const governanceStates = ["DRAFT","REVIEW","PUBLISHED","PENDING","ACTIVE","CANCELED","SUCCEEDED","DEFEATED","QUEUED","EXECUTED","EXPIRED"] as const;
export type GovernanceState = typeof governanceStates[number];

const nextStates: Record<GovernanceState, GovernanceState[]> = {
  DRAFT: ["REVIEW"], REVIEW: ["PUBLISHED"], PUBLISHED: ["PENDING"], PENDING: ["ACTIVE"],
  ACTIVE: ["CANCELED", "SUCCEEDED", "DEFEATED"], CANCELED: [], SUCCEEDED: ["QUEUED"], DEFEATED: [],
  QUEUED: ["EXECUTED", "EXPIRED"], EXECUTED: [], EXPIRED: [],
};
const rank: Record<GovernanceState, number> = { DRAFT: 0, REVIEW: 1, PUBLISHED: 2, PENDING: 3, ACTIVE: 4, CANCELED: 5, SUCCEEDED: 5, DEFEATED: 5, QUEUED: 6, EXECUTED: 7, EXPIRED: 7 };

export function validateGovernanceTransition(current: GovernanceState, next: GovernanceState, options: { isReorg: boolean; reorgReferencesLatest: boolean; allowOnchainBootstrap?: boolean }) {
  if (current === next) return { transition: "CONFIRMATION_UPDATE" as const };
  if (current === "DRAFT" && options.allowOnchainBootstrap && ["PENDING","ACTIVE","CANCELED","SUCCEEDED","DEFEATED","QUEUED","EXECUTED","EXPIRED"].includes(next)) return { transition: "ONCHAIN_BOOTSTRAP" as const };
  if (options.isReorg) {
    if (!options.reorgReferencesLatest) throw new Error("REORG_MUST_REFERENCE_LATEST_OBSERVATION");
    if (rank[next] >= rank[current]) throw new Error("REORG_MUST_ROLL_BACK_STATE");
    return { transition: "REORG_ROLLBACK" as const };
  }
  if (!nextStates[current].includes(next)) throw new Error(`INVALID_GOVERNANCE_TRANSITION_${current}_TO_${next}`);
  return { transition: "FORWARD" as const };
}
