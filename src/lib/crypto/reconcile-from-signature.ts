import { Connection, PublicKey } from "@solana/web3.js";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  deriveEscrowPda,
  TRUSTLAYER_PROGRAM_ID,
} from "@/lib/crypto/solana";

export type TerminalAction =
  | "release"
  | "cancel"
  | "admin_resolve_release"
  | "admin_resolve_refund";

export type TerminalStatus = "released" | "cancelled" | "refunded";

const ACTIONS: Record<
  TerminalAction,
  { status: TerminalStatus; eventType: string; adminOnly: boolean; spl: boolean; discriminator: number[] }
> = {
  release: {
    status: "released",
    eventType: "crypto_release_verified",
    adminOnly: false,
    spl: false,
    discriminator: [253, 249, 15, 206, 28, 127, 193, 241],
  },
  cancel: {
    status: "cancelled",
    eventType: "crypto_cancel_verified",
    adminOnly: false,
    spl: false,
    discriminator: [32, 252, 43, 185, 2, 184, 112, 85],
  },
  admin_resolve_release: {
    status: "released",
    eventType: "admin_onchain_resolve_release",
    adminOnly: true,
    spl: false,
    discriminator: [227, 9, 135, 193, 63, 99, 92, 241],
  },
  admin_resolve_refund: {
    status: "refunded",
    eventType: "admin_onchain_resolve_refund",
    adminOnly: true,
    spl: false,
    discriminator: [227, 143, 18, 108, 25, 0, 106, 230],
  },
};

const SPL_DISCRIMINATORS: Record<TerminalAction, number[]> = {
  release: [115, 22, 93, 89, 235, 139, 53, 130],
  cancel: [147, 74, 147, 41, 28, 118, 70, 94],
  admin_resolve_release: [129, 183, 206, 57, 36, 103, 232, 108],
  admin_resolve_refund: [116, 172, 152, 221, 242, 26, 211, 82],
};

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const indexes = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) indexes.set(alphabet[i], i);
  const bytes: number[] = [];
  for (const char of value) {
    const digit = indexes.get(char);
    if (digit === undefined) throw new Error("Invalid base58 instruction data.");
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros += 1;
  while (zeros-- > 0) bytes.push(0);
  bytes.reverse();
  return Uint8Array.from(bytes);
}

function instructionDataBytes(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) {
    try { return Uint8Array.from(data); } catch { return null; }
  }
  if (typeof data === "string") {
    try { return decodeBase58(data); } catch { return null; }
  }
  return null;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function u64le(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true).toString();
}

export type VerifiedTerminalTransaction = {
  signature: string;
  action: TerminalAction;
  status: TerminalStatus;
  isSpl: boolean;
  chainDealId: string;
  milestoneIndex: number;
  initiator: string;
  escrowPda: string;
  pdaClosed: true;
  logs: string[];
  transaction: unknown;
};

export async function verifyTrustLayerTerminalTransaction(
  connection: Connection,
  signature: string,
  expected: {
    chainDealId: string;
    milestoneIndex: number;
    initiator: PublicKey;
    escrowPda?: PublicKey;
    expectedAction?: TerminalAction;
  }
): Promise<VerifiedTerminalTransaction> {
  const status = (await connection.getSignatureStatuses([signature])).value[0];
  if (!status || status.err) throw new Error("Transaction was not confirmed successfully.");

  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction || transaction.meta?.err) throw new Error("Unable to inspect the confirmed transaction.");

  const message = transaction.transaction.message as any;
  const staticKeys: PublicKey[] = message.staticAccountKeys ?? message.accountKeys ?? [];
  const loaded = transaction.meta?.loadedAddresses;
  const accountKeys: PublicKey[] = [
    ...staticKeys,
    ...(loaded?.writable ?? []),
    ...(loaded?.readonly ?? []),
  ];
  const instructions = message.compiledInstructions ?? message.instructions ?? [];
  const allActions = (Object.keys(ACTIONS) as TerminalAction[]);

  let found: { action: TerminalAction; isSpl: boolean } | null = null;
  for (const instruction of instructions) {
    const programKey = accountKeys[instruction.programIdIndex];
    if (!programKey || !programKey.equals(TRUSTLAYER_PROGRAM_ID)) continue;
    const data = instructionDataBytes(instruction.data);
    if (!data || data.length < 49) continue;

    const dealId = u64le(data.subarray(8, 16));
    const milestoneIndex = data[16];
    let initiator: PublicKey;
    try { initiator = new PublicKey(data.subarray(17, 49)); } catch { continue; }
    if (
      dealId !== String(expected.chainDealId) ||
      milestoneIndex !== expected.milestoneIndex ||
      !initiator.equals(expected.initiator)
    ) continue;

    for (const action of allActions) {
      if (equalBytes(data.subarray(0, 8), Uint8Array.from(ACTIONS[action].discriminator))) {
        found = { action, isSpl: false };
        break;
      }
      if (equalBytes(data.subarray(0, 8), Uint8Array.from(SPL_DISCRIMINATORS[action]))) {
        found = { action, isSpl: true };
        break;
      }
    }
    if (found) break;
  }

  if (!found) throw new Error("Confirmed transaction does not contain the expected TrustLayer terminal instruction for this settlement.");
  if (expected.expectedAction && found.action !== expected.expectedAction) {
    throw new Error(`Transaction action mismatch: expected ${expected.expectedAction}, found ${found.action}.`);
  }

  const [derivedPda] = deriveEscrowPda(expected.initiator, expected.chainDealId, expected.milestoneIndex);
  if (expected.escrowPda && !expected.escrowPda.equals(derivedPda)) {
    throw new Error("Expected escrow PDA does not match settlement seeds.");
  }
  const escrowAfter = await connection.getAccountInfo(derivedPda, "confirmed");
  if (escrowAfter) {
    throw new Error("TrustLayer escrow PDA is still open after the terminal transaction.");
  }

  return {
    signature,
    action: found.action,
    status: ACTIONS[found.action].status,
    isSpl: found.isSpl,
    chainDealId: String(expected.chainDealId),
    milestoneIndex: expected.milestoneIndex,
    initiator: expected.initiator.toBase58(),
    escrowPda: derivedPda.toBase58(),
    pdaClosed: true,
    logs: transaction.meta?.logMessages ?? [],
    transaction,
  };
}

export async function persistSettlementSignature(
  settlementId: string,
  signature: string,
  escrowPda: string
) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crypto_settlements")
    .update({
      last_tx_signature: signature,
      last_verified_at: new Date().toISOString(),
      escrow_pda: escrowPda,
    })
    .eq("id", settlementId)
    .select("id,last_tx_signature")
    .maybeSingle();
  if (error) throw new Error(`Unable to persist transaction signature: ${error.message}`);
  if (!data || data.last_tx_signature !== signature) {
    throw new Error("Unable to persist transaction signature for settlement.");
  }
}

export async function syncSettlementTerminalState(opts: {
  settlementId: string;
  dealId: string;
  signature: string;
  escrowPda: string;
  status: TerminalStatus;
  eventType: string;
  actorUserId: string;
  actorType: "user" | "admin";
  milestoneIndex: number;
  chainDealId: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  allTerminal: boolean;
  status: TerminalStatus;
  settlementSynced: boolean;
  dealSynced: boolean;
  eventSynced: boolean;
  sessionSynced: boolean;
  dbSynced: boolean;
  warnings: string[];
}> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const warnings: string[] = [];

  // ── 1. CRITICAL: settlement terminal write ─────────────────────────────
  // If this fails, caller may still have on-chain success; they should retry
  // with the same signature. Never send a second chain tx.
  const { data: current, error: readError } = await admin
    .from("crypto_settlements")
    .select("id,onchain_status,funded")
    .eq("id", opts.settlementId)
    .maybeSingle();
  if (readError || !current) {
    throw new Error(readError?.message || "Settlement not found.");
  }

  if (
    current.onchain_status &&
    !["funded", opts.status].includes(String(current.onchain_status))
  ) {
    throw new Error(
      `Illegal settlement transition from ${current.onchain_status} to ${opts.status}.`
    );
  }

  const update: Record<string, unknown> = {
    funded: false,
    onchain_status: opts.status,
    last_tx_signature: opts.signature,
    last_verified_at: now,
    escrow_pda: opts.escrowPda,
  };
  if (opts.status === "released") update.release_tx_signature = opts.signature;
  if (opts.status === "cancelled") update.cancel_tx_signature = opts.signature;
  if (opts.status === "refunded") update.refund_tx_signature = opts.signature;

  if (current.onchain_status === opts.status) {
    if (current.funded) {
      const { error } = await admin
        .from("crypto_settlements")
        .update(update)
        .eq("id", opts.settlementId)
        .eq("onchain_status", opts.status);
      if (error) throw new Error(error.message);
    } else {
      await persistSettlementSignature(
        opts.settlementId,
        opts.signature,
        opts.escrowPda
      );
    }
  } else {
    const { data: updated, error } = await admin
      .from("crypto_settlements")
      .update(update)
      .eq("id", opts.settlementId)
      .eq("onchain_status", "funded")
      .select("id,onchain_status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      const { data: raced } = await admin
        .from("crypto_settlements")
        .select("onchain_status")
        .eq("id", opts.settlementId)
        .maybeSingle();
      if (raced?.onchain_status === opts.status) {
        await persistSettlementSignature(
          opts.settlementId,
          opts.signature,
          opts.escrowPda
        );
      } else {
        throw new Error(
          "Settlement changed concurrently; reconciliation was not applied."
        );
      }
    }
  }

  const settlementSynced = true;

  // ── 2. BEST-EFFORT: deal aggregate status ──────────────────────────────
  // Binance-style: ledger (settlement) is source of truth; account view
  // (deal row) can lag and be retried without moving money again.
  let allTerminal = false;
  let dealSynced = true;
  try {
    const { data: all, error: allError } = await admin
      .from("crypto_settlements")
      .select("onchain_status")
      .eq("deal_id", opts.dealId);
    if (allError) throw new Error(allError.message);

    allTerminal =
      (all?.length ?? 0) > 0 &&
      all!.every((row: { onchain_status?: unknown }) =>
        ["released", "cancelled", "refunded"].includes(
          String(row.onchain_status)
        )
      );

    if (allTerminal) {
      const statuses = (all ?? []).map((r) => String(r.onchain_status));
      const allReleased = statuses.every((s) => s === "released");
      const allCancelled = statuses.every((s) => s === "cancelled");
      const allRefunded = statuses.every((s) => s === "refunded");
      const dealStatus = allReleased
        ? "completed"
        : allCancelled
          ? "cancelled"
          : allRefunded
            ? "refunded"
            : "completed";

      const { error } = await admin
        .from("deals")
        .update({ status: dealStatus })
        .eq("id", opts.dealId);
      if (error) throw new Error(error.message);
    }
  } catch (dealErr) {
    dealSynced = false;
    const msg =
      dealErr instanceof Error ? dealErr.message : "Deal status update failed.";
    warnings.push(`deal_status: ${msg}`);
    console.error(
      "[syncSettlementTerminalState] settlement OK; deal status lag:",
      dealErr
    );
  }

  // ── 3. BEST-EFFORT: deal_events (idempotent via unique index) ──────────
  let eventSynced = true;
  try {
    const eventMetadata = {
      ...(opts.metadata ?? {}),
      settlement_id: opts.settlementId,
      signature: opts.signature,
      escrow_pda: opts.escrowPda,
      chain_deal_id: opts.chainDealId,
      milestone_index: opts.milestoneIndex,
      deal_fully_terminal: allTerminal,
    };

    const { error: eventError } = await admin.from("deal_events").insert({
      deal_id: opts.dealId,
      actor_user_id: opts.actorUserId,
      actor_type: opts.actorType,
      event_type: opts.eventType,
      metadata: eventMetadata,
    });
    if (eventError && eventError.code !== "23505") {
      throw new Error(eventError.message);
    }
  } catch (eventErr) {
    eventSynced = false;
    const msg =
      eventErr instanceof Error ? eventErr.message : "Event insert failed.";
    warnings.push(`deal_events: ${msg}`);
    console.error(
      "[syncSettlementTerminalState] settlement OK; event lag:",
      eventErr
    );
  }

  // ── 4. BEST-EFFORT: session consume ────────────────────────────────────
  let sessionSynced = true;
  if (opts.sessionId) {
    try {
      const { error } = await admin
        .from("crypto_sessions")
        .update({ status: "used", used_at: now })
        .eq("id", opts.sessionId);
      if (error) throw new Error(error.message);
    } catch (sessionErr) {
      sessionSynced = false;
      const msg =
        sessionErr instanceof Error
          ? sessionErr.message
          : "Session update failed.";
      warnings.push(`session: ${msg}`);
      console.error(
        "[syncSettlementTerminalState] settlement OK; session lag:",
        sessionErr
      );
    }
  }

  const dbSynced = dealSynced && eventSynced && sessionSynced;

  return {
    allTerminal,
    status: opts.status,
    settlementSynced,
    dealSynced,
    eventSynced,
    sessionSynced,
    dbSynced,
    warnings,
  };
}


// ─── Atomic exchange (Ax) terminal verify + sync ─────────────────────────────

/** release_ax / cancel_ax / cancel_unfunded_ax / reclaim_ax discriminators */
export const AX_TERMINAL_DISCRIMINATORS: Record<
  "release" | "cancel" | "cancel_unfunded" | "reclaim",
  number[]
> = {
  release: [113, 201, 171, 29, 194, 210, 193, 23],
  cancel: [195, 62, 103, 184, 83, 252, 114, 200],
  cancel_unfunded: [63, 14, 94, 180, 244, 212, 190, 10],
  reclaim: [91, 35, 144, 7, 25, 88, 123, 32],
};

export type AxTerminalAction = keyof typeof AX_TERMINAL_DISCRIMINATORS;

export type VerifiedAxTerminalTransaction = {
  signature: string;
  action: AxTerminalAction;
  status: "released" | "cancelled" | "refunded";
  chainDealId: string;
  axPda: string;
  pdaClosed: boolean;
  logs: string[];
};

function axStatusForAction(
  action: AxTerminalAction
): "released" | "cancelled" | "refunded" {
  if (action === "release") return "released";
  if (action === "reclaim") return "refunded";
  return "cancelled";
}

/**
 * Verify a confirmed Ax terminal signature (release / cancel / reclaim).
 * Does not submit a transaction. Prefer pdaClosed for release/cancel.
 */
export async function verifyAxTerminalTransaction(
  connection: Connection,
  signature: string,
  expected: {
    chainDealId: string;
    axPda: PublicKey;
    expectedAction?: AxTerminalAction;
  }
): Promise<VerifiedAxTerminalTransaction> {
  const status = (await connection.getSignatureStatuses([signature])).value[0];
  if (!status || status.err) {
    throw new Error("Transaction was not confirmed successfully.");
  }

  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction || transaction.meta?.err) {
    throw new Error("Unable to inspect the confirmed transaction.");
  }

  const message = transaction.transaction.message as any;
  const staticKeys: PublicKey[] =
    message.staticAccountKeys ?? message.accountKeys ?? [];
  const loaded = transaction.meta?.loadedAddresses;
  const accountKeys: PublicKey[] = [
    ...staticKeys,
    ...(loaded?.writable ?? []),
    ...(loaded?.readonly ?? []),
  ];
  const instructions = message.compiledInstructions ?? message.instructions ?? [];

  let found: AxTerminalAction | null = null;
  for (const instruction of instructions) {
    const programKey = accountKeys[instruction.programIdIndex];
    if (!programKey || !programKey.equals(TRUSTLAYER_PROGRAM_ID)) continue;
    const data = instructionDataBytes(instruction.data);
    if (!data || data.length < 16) continue;

    const dealId = u64le(data.subarray(8, 16));
    if (dealId !== String(expected.chainDealId)) continue;

    for (const action of Object.keys(
      AX_TERMINAL_DISCRIMINATORS
    ) as AxTerminalAction[]) {
      const disc = Uint8Array.from(AX_TERMINAL_DISCRIMINATORS[action]);
      if (equalBytes(data.subarray(0, 8), disc)) {
        found = action;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    throw new Error(
      "Confirmed transaction does not contain the expected TrustLayer Ax terminal instruction."
    );
  }
  if (expected.expectedAction && found !== expected.expectedAction) {
    throw new Error(
      `Expected Ax action ${expected.expectedAction} but found ${found}.`
    );
  }

  const pdaInfo = await connection.getAccountInfo(expected.axPda, "confirmed");
  const pdaClosed = !pdaInfo;

  if (
    (found === "release" || found === "cancel" || found === "cancel_unfunded") &&
    !pdaClosed
  ) {
    const logs = transaction.meta?.logMessages ?? [];
    const okLog = logs.some(
      (l) =>
        l.includes("ReleaseAx") ||
        l.includes("CancelAx") ||
        l.includes("success")
    );
    if (!okLog) {
      throw new Error(
        "Ax PDA still exists after terminal action; on-chain state is not terminal."
      );
    }
  }

  return {
    signature,
    action: found,
    status: axStatusForAction(found),
    chainDealId: String(expected.chainDealId),
    axPda: expected.axPda.toBase58(),
    pdaClosed,
    logs: transaction.meta?.logMessages ?? [],
  };
}

/**
 * Sync crypto_settlements + deal from a verified Ax terminal signature.
 * Chain is truth; DB is best-effort (same idea as 1-leg syncSettlementTerminalState).
 */
export async function syncAxSettlementTerminalState(opts: {
  settlementId: string;
  dealId: string;
  userId: string | null;
  signature: string;
  axPda: string;
  chainDealId: string;
  status: "released" | "cancelled" | "refunded";
  action: AxTerminalAction;
}): Promise<{ settlementSynced: boolean; dealSynced: boolean; warnings: string[] }> {
  const admin = createSupabaseAdminClient();
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const sigCol =
    opts.status === "released"
      ? "release_tx_signature"
      : opts.status === "refunded"
        ? "refund_tx_signature"
        : "cancel_tx_signature";

  const update: Record<string, unknown> = {
    onchain_status: opts.status,
    last_tx_signature: opts.signature,
    last_verified_at: now,
    escrow_pda: opts.axPda,
    [sigCol]: opts.signature,
  };
  if (opts.status === "released") update.funded = true;

  let settlementSynced = true;
  try {
    const { error } = await admin
      .from("crypto_settlements")
      .update(update)
      .eq("id", opts.settlementId);
    if (error) throw new Error(error.message);
  } catch (e) {
    settlementSynced = false;
    warnings.push(e instanceof Error ? e.message : "Settlement update failed");
  }

  let dealSynced = true;
  const dealStatus =
    opts.status === "released"
      ? "completed"
      : opts.status === "refunded"
        ? "refunded"
        : "cancelled";
  try {
    const { error } = await admin
      .from("deals")
      .update({ status: dealStatus })
      .eq("id", opts.dealId);
    if (error) throw new Error(error.message);
  } catch (e) {
    dealSynced = false;
    warnings.push(e instanceof Error ? e.message : "Deal status update failed");
  }

  try {
    await admin.from("deal_events").insert({
      deal_id: opts.dealId,
      actor_user_id: opts.userId,
      actor_type: opts.userId ? "user" : "system",
      event_type: `ax_${opts.action}_reconciled`,
      metadata: {
        signature: opts.signature,
        ax_pda: opts.axPda,
        chain_deal_id: opts.chainDealId,
        onchain_status: opts.status,
      },
    });
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : "deal_events insert failed");
  }

  return { settlementSynced, dealSynced, warnings };
}
