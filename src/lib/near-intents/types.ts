export type AgentDecision = "allow" | "approval_required" | "blocked";

export type AgentTransactionProposal = {
  task: string;
  counterparty: string;
  amountUsd: number;
  purpose: string;
  deliverable: string;
  acceptanceCriteria: string;
  counterpartyFlagged?: boolean;
};

export type AgentPolicy = {
  maxTransactionUsd: number;
  humanApprovalAboveUsd: number;
  requireAgreement: boolean;
  blockFlaggedCounterparties: boolean;
};

export type AgentPolicyEvaluation = {
  decision: AgentDecision;
  reasons: string[];
  policy: AgentPolicy;
  proposal: AgentTransactionProposal;
  evaluatedAt: string;
};
