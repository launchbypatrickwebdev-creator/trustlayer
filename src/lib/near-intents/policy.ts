import type {
  AgentPolicy,
  AgentPolicyEvaluation,
  AgentTransactionProposal,
} from "./types";

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxTransactionUsd: 500,
  humanApprovalAboveUsd: 250,
  requireAgreement: true,
  blockFlaggedCounterparties: true,
};

/**
 * Deterministic policy gate for the hackathon demo.
 * This is deliberately not an AI model and does not move funds.
 */
export function evaluateAgentProposal(
  proposal: AgentTransactionProposal,
  policy: AgentPolicy = DEFAULT_AGENT_POLICY
): AgentPolicyEvaluation {
  const reasons: string[] = [];
  let blocked = false;
  let approvalRequired = false;

  if (!proposal.task.trim()) {
    reasons.push("A transaction task is required.");
    blocked = true;
  }
  if (!proposal.counterparty.trim()) {
    reasons.push("A named counterparty is required.");
    blocked = true;
  }
  if (!Number.isFinite(proposal.amountUsd) || proposal.amountUsd <= 0) {
    reasons.push("The transaction amount must be greater than zero.");
    blocked = true;
  } else if (proposal.amountUsd > policy.maxTransactionUsd) {
    reasons.push(
      `Amount exceeds the agent's $${policy.maxTransactionUsd.toFixed(2)} per-transaction limit.`
    );
    blocked = true;
  } else if (proposal.amountUsd > policy.humanApprovalAboveUsd) {
    reasons.push(
      `Amount exceeds the $${policy.humanApprovalAboveUsd.toFixed(2)} autonomous-spend threshold.`
    );
    approvalRequired = true;
  }

  if (policy.requireAgreement) {
    if (!proposal.purpose.trim()) {
      reasons.push("The transaction purpose must be recorded in the agreement.");
      blocked = true;
    }
    if (!proposal.deliverable.trim()) {
      reasons.push("A deliverable must be specified before an agreement can be created.");
      blocked = true;
    }
    if (!proposal.acceptanceCriteria.trim()) {
      reasons.push("Acceptance criteria are required before settlement.");
      blocked = true;
    }
  }

  if (proposal.counterpartyFlagged && policy.blockFlaggedCounterparties) {
    reasons.push("Counterparty is flagged by the TrustLayer risk check.");
    blocked = true;
  }

  if (reasons.length === 0) {
    reasons.push("Proposal is within the configured policy and agreement requirements.");
  }

  return {
    decision: blocked ? "blocked" : approvalRequired ? "approval_required" : "allow",
    reasons,
    policy,
    proposal,
    evaluatedAt: new Date().toISOString(),
  };
}
