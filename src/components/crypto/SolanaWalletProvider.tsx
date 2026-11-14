"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { DEVNET_RPC_URL } from "@/lib/crypto/solana";
import { getPreferredWalletName } from "@/lib/crypto/wallet-preference";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Selects preferred adapter name from localStorage (does not connect by itself).
 * autoConnect on WalletProvider restores a prior approve for 1-leg and Ax alike.
 */
function WalletPreferenceBridge() {
  const { wallets, select } = useWallet();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const preferred = getPreferredWalletName();
    if (!preferred) return;
    const target = wallets.find((w) => w.adapter.name === preferred);
    if (target) {
      select(target.adapter.name);
      applied.current = true;
    }
  }, [wallets, select]);

  return null;
}

export default function SolanaWalletProvider({
  children,
}: {
  children: ReactNode;
}) {
  /**
   * Only these two adapters are registered today.
   * Other browser/mobile wallets are NOT auto-detected unless:
   * - you add their adapter packages, or
   * - you adopt Wallet Standard discovery (see comment in product notes).
   */
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={DEVNET_RPC_URL}>
      {/* autoConnect: same Phantom session works for 1-leg escrow and 2-leg Ax */}
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletPreferenceBridge />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
