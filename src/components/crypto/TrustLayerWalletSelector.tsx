"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { getPreferredWalletName } from "@/lib/crypto/wallet-preference";

export default function TrustLayerWalletSelector() {
  const { wallets, wallet, connected, select, disconnect, connect } =
    useWallet();
  const [mounted, setMounted] = useState(false);
  const [preferred, setPreferred] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setPreferred(getPreferredWalletName());
  }, []);

  // Avoid SSR/client mismatch: wallets are only known in the browser
  if (!mounted) {
    return (
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-24 animate-pulse rounded-lg border bg-gray-100" />
        <div className="h-9 w-24 animate-pulse rounded-lg border bg-gray-100" />
      </div>
    );
  }

  async function choose(name: string) {
    if (wallet?.adapter.name === name) {
      if (!connected) await connect();
      return;
    }
    if (connected) await disconnect();
    select(name as WalletName);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map((w) => {
        const name = w.adapter.name;
        const active = wallet?.adapter.name === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => void choose(name)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              active ? "border-black bg-gray-100" : ""
            }`}
          >
            {name}
            {preferred === name ? " ✓" : ""}
          </button>
        );
      })}
    </div>
  );
}