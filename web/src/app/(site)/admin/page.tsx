"use client";

// The owner's page: results to release before prizes can be collected (Release.tsx). Chat moderation
// is in the chat room itself, for the admin wallet.
import { useAuth } from "@/components/auth";
import { Card, Loading } from "@/components/ui";
import { shortWallet } from "@/lib/api";
import Release from "./Release";

export default function Admin() {
  const { token, me, wallet } = useAuth();

  if (token && !me) return <Loading label="Checking your wallet" className="mt-8" />;
  if (!token || !me) return <Card className="mt-8"><p className="text-muted">Sign in with the admin wallet to release results.</p></Card>;
  if (!me.is_admin) return <Card className="mt-8"><p className="text-muted">Only the admin wallet can release results. You&apos;re signed in as {wallet && shortWallet(wallet)}.</p></Card>;

  return (
    <div className="space-y-6 pt-8">
      <h1 className="sr-only">Admin</h1>
      <Release token={token} />
    </div>
  );
}
