const KEY_ADAPTER = "trustlayer_preferred_wallet";
const KEY_LOCKED = "trustlayer_wallet_locked";

export function getPreferredWalletName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_ADAPTER);
}

export function isWalletLocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_LOCKED) === "1";
}

export function lockWalletPreference(adapterName: string) {
  localStorage.setItem(KEY_ADAPTER, adapterName);
  localStorage.setItem(KEY_LOCKED, "1");
}

export function clearWalletPreference() {
  localStorage.removeItem(KEY_ADAPTER);
  localStorage.removeItem(KEY_LOCKED);
}