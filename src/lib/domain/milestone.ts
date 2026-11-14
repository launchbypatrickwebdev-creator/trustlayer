import { MAX_MILESTONES } from "@/lib/crypto/solana";

export type EscrowType = "one_time" | "milestone";

export interface MilestoneInput {
  index: number;
  amount: string;
  label?: string | null;
}

export function normalizeMilestones(
  escrowType: EscrowType,
  totalAmount: string,
  milestones?: MilestoneInput[] | null
): MilestoneInput[] {
  if (escrowType === "one_time") {
    return [{ index: 0, amount: totalAmount, label: "Full payment" }];
  }
  if (!milestones || milestones.length < 2) {
    throw new Error("Milestone deals need at least 2 stages.");
  }
  if (milestones.length > MAX_MILESTONES) {
    throw new Error(`Maximum ${MAX_MILESTONES} milestones.`);
  }
  const sorted = [...milestones].sort((a, b) => a.index - b.index);
  sorted.forEach((m, i) => {
    if (m.index !== i) {
      throw new Error("Milestone indexes must be 0..n-1 contiguous.");
    }
    if (!m.amount || Number(m.amount) <= 0) {
      throw new Error(`Invalid amount for milestone ${i}.`);
    }
  });
  return sorted;
}
