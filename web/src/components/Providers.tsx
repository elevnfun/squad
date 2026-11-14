"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { AuthProvider, SESSION_FLAG } from "./auth";

// Phantom, Solflare and other Wallet Standard wallets are detected automatically.
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

// Reconnect silently on reload only for a signed-in visitor. Picking a wallet never connects on
// its own: sign-in does that, so connecting and signing happen in one wallet popup.
async function autoConnect(_adapter: Adapter) {  // eslint-disable-line @typescript-eslint/no-unused-vars
  try { return localStorage.getItem(SESSION_FLAG) === "1"; } catch { return false; }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={[]} autoConnect={autoConnect}>
        <WalletModalProvider>
          <AuthProvider>{children}</AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
