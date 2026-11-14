export type FungibleAssetCode = "SOL" | "USDC" | "USDT";
export type ProviderStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED" | "UNKNOWN";
export type DeliveryStatus = "pending" | "verified" | "failed";
export type FundingStatus = "awaiting_deposit" | "processing" | "asset_delivered" | "escrow_funded" | "incomplete" | "refunded" | "failed";
export type CrossChainQuoteInput = { dealId: string; sourceAssetId: string; sourceAmount: string; refundTo: string; legIndex?: 0 | 1; milestoneIndex?: number };
export type AuroraQuote = { depositAddress: string; depositMemo?: string | null; depositAddressAndMemo?: string; amountIn?: string; amountOut?: string; amountInFormatted?: string; amountOutFormatted?: string; deadline?: string; [key: string]: unknown };
