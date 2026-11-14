"use client";

// One-step sign-in: "Sign in" opens the wallet list, then a single wallet popup connects the
// wallet and signs a one-time message (free, no transaction). The API checks the signature and
// returns a 24-hour session token kept in this browser, so returning visits don't ask again.
// Wallets without one-step sign-in fall back to connect, then sign.
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, Me } from "@/lib/api";

type Auth = {
  wallet: string | null; token: string | null; me: Me | null; error: string | null; signingIn: boolean;
  signIn: () => Promise<void>; signOut: () => void; refresh: () => Promise<void>; demoSignIn: () => Promise<void>;
  // the username dialog (components/UsernameDialog.tsx, shown by the Header): opens by itself once a visit
  // after signing in while the wallet has no username, and from the wallet menu or the chat any time
  usernameOpen: boolean; openUsername: () => void; closeUsername: () => void;
};
type SignInInput = Parameters<NonNullable<ReturnType<typeof useWallet>["signIn"]>>[0];

// Local testing only: NEXT_PUBLIC_DEV_LOGIN=1 here and DEV_LOGIN=1 on the API.
export const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === "1";
const DEMO_WALLET = "7pv3YABSg9i4Hteg7YZ8HF48qFC2DELqDQ3KzDLB1uJ7";
const AuthContext = createContext<Auth | null>(null);
const key = (w: string) => `squad.token.${w}`;
export const SESSION_FLAG = "squad.session";   // reconnect the wallet silently on reload only when signed in
const USERNAME_LATER = "squad.usernameLater";

function stored(w: string) {
  try { return localStorage.getItem(key(w)); } catch { return null; }
}

function friendly(e: unknown) {
  const msg = (e as Error)?.message ?? String(e);
  return /reject|cancel|denied|closed/i.test(`${(e as Error)?.name} ${msg}`) ? "Sign-in cancelled in your wallet" : msg;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage, signIn: walletSignIn, wallet: selected, connect, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [demo, setDemo] = useState<string | null>(null);
  useEffect(() => { if (DEV_LOGIN) try { setDemo(localStorage.getItem("squad.demo")); } catch {} }, []);
  const wallet = publicKey?.toBase58() ?? demo;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => { setToken(wallet ? stored(wallet) : null); setMe(null); setError(null); }, [wallet]);

  const refresh = useCallback(async () => {
    if (!token) return setMe(null);
    try {
      setMe(await api<Me>("/me", { token }));
      setError(null);
    } catch (e) {
      if ((e as { status?: number }).status === 401 && wallet) {
        try { localStorage.removeItem(key(wallet)); } catch {}
        setToken(null);
      } else setError((e as Error).message);
    }
  }, [token, wallet]);
  useEffect(() => { refresh(); }, [refresh]);

  const [usernameOpen, setUsernameOpen] = useState(false);
  useEffect(() => {
    if (!me || me.username) return;
    try { if (sessionStorage.getItem(USERNAME_LATER)) return; } catch {}
    setUsernameOpen(true);
  }, [me]);
  const openUsername = useCallback(() => setUsernameOpen(true), []);
  const closeUsername = useCallback(() => {
    setUsernameOpen(false);
    try { sessionStorage.setItem(USERNAME_LATER, "1"); } catch {}   // "Later": don't ask again this visit
  }, []);

  const keep = (addr: string, t: string) => {
    try { localStorage.setItem(key(addr), t); localStorage.setItem(SESSION_FLAG, "1"); } catch {}
    setToken(t);
  };

  const demoSignIn = useCallback(async () => {
    try {
      const { token } = await api<{ token: string }>("/auth/dev", { body: { wallet: DEMO_WALLET } });
      keep(DEMO_WALLET, token);
      localStorage.setItem("squad.demo", DEMO_WALLET);
      setDemo(DEMO_WALLET);
      setToken(token);
    } catch (e) { setError((e as Error).message); }
  }, []);

  // the wallet is chosen: one popup if it supports sign-in, else connect then sign
  const run = useCallback(async () => {
    if (!selected) return;
    setSigningIn(true); setError(null);
    const origin = window.location.origin;
    try {
      let addr: string, message: string, signature: Uint8Array;
      if (walletSignIn) {
        const input = await api<SignInInput>("/auth/sign-in", { body: { origin } });
        const out = await walletSignIn(input);
        addr = bs58.encode(Uint8Array.from(out.account.publicKey));
        message = new TextDecoder().decode(Uint8Array.from(out.signedMessage));
        signature = Uint8Array.from(out.signature);
      } else {
        if (!connected) await connect();
        const pk = selected.adapter.publicKey;
        if (!pk || !signMessage) throw new Error("This wallet can't sign in. Try Phantom or Solflare.");
        addr = pk.toBase58();
        ({ message } = await api<{ message: string }>("/auth/message", { body: { wallet: addr, origin } }));
        signature = await signMessage(new TextEncoder().encode(message));
      }
      const { token } = await api<{ token: string }>("/auth/verify",
        { body: { wallet: addr, message, signature: bs58.encode(signature) } });
      keep(addr, token);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSigningIn(false);
    }
  }, [selected, walletSignIn, connected, connect, signMessage]);

  const signIn = useCallback(async () => {
    if (DEV_LOGIN && wallet === DEMO_WALLET) return demoSignIn();
    if (!selected) { setPending(true); setVisible(true); return; }
    await run();
  }, [wallet, selected, demoSignIn, setVisible, run]);

  // continue once a wallet is picked from the list
  useEffect(() => {
    if (pending && selected) { setPending(false); run(); }
  }, [pending, selected, run]);

  const signOut = useCallback(() => {
    try {
      if (wallet) localStorage.removeItem(key(wallet));
      localStorage.removeItem("squad.demo");
      localStorage.removeItem(SESSION_FLAG);
      sessionStorage.removeItem(USERNAME_LATER);   // the next wallet signed in this visit is asked again
    } catch {}
    setToken(null); setMe(null); setDemo(null); setUsernameOpen(false); disconnect();
  }, [wallet, disconnect]);

  return (
    <AuthContext.Provider value={{ wallet, token, me, error, signingIn, signIn, signOut, refresh, demoSignIn,
      usernameOpen, openUsername, closeUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
