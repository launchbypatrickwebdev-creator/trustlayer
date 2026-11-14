import type { ProviderStatus, FundingStatus } from "../../types";
export function mapAuroraStatus(raw:unknown): {provider:ProviderStatus; funding:FundingStatus} {
 const s=String(raw||"").toUpperCase();
 switch(s){case "PENDING_DEPOSIT":return {provider:s,funding:"awaiting_deposit"};case "KNOWN_DEPOSIT_TX":case "PROCESSING":return {provider:s,funding:"processing"};case "SUCCESS":return {provider:s,funding:"processing"};case "INCOMPLETE_DEPOSIT":return {provider:s,funding:"incomplete"};case "REFUNDED":return {provider:s,funding:"refunded"};case "FAILED":return {provider:s,funding:"failed"};default:return {provider:"UNKNOWN",funding:"processing"};}
}
