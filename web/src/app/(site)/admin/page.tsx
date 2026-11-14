"use client";

// Daily payouts, for the fee wallet's owner only. The system prepares the batch (new prizes'
// 30%, daily vesting parts for holders, buyback and burn); you review it and approve it in your
// wallet. The key never leaves your wallet; the server only accepts the exact transactions it built.
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { AdminOverview, api, Batch, BatchTx, fmtSol, shortWallet } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { Button, Card, Loading } from "@/components/ui";

const KIND: Record<string, string> = {
  instant: "Prize, 30% now", vest: "Prize, daily part", buyback: "Buy back $ELEVN", burn: "Burn $ELEVN", operations: "Operations",
};
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export default function Admin() {
  const { token, me, wallet } = useAuth();
  const { signAllTransactions } = useWallet();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api<AdminOverview>("/admin/overview", { token });
      setData(d); setBatch(d.last_batch);
    } catch (e) { setError((e as Error).message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function prepare() {
    setBusy("Preparing today's batch…"); setError(null);
    try { setBatch(await api<Batch>("/admin/batches", { body: {}, token })); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function approve() {
    if (!batch || !signAllTransactions) return setError("Connect the fee wallet in a wallet that can sign");
    setBusy("Building transactions…"); setError(null);
    try {
      const { transactions } = await api<{ transactions: BatchTx[] }>(`/admin/batches/${batch.id}/transactions`, { body: {}, token });
      if (!transactions.length) { setBusy(null); return setError("Nothing to send in this batch"); }
      setBusy("Approve in your wallet…");
      const txs = transactions.map((t) => t.versioned ? VersionedTransaction.deserialize(unb64(t.tx)) : Transaction.from(unb64(t.tx)));
      const signed = await signAllTransactions(txs);
      setBusy("Sending and confirming…");
      const res = await api<{ batch: Batch; results: { idx: number; result: string }[] }>(
        `/admin/batches/${batch.id}/submit`,
        { body: { signed: signed.map((tx, i) => ({ idx: transactions[i].idx, tx: b64(tx.serialize()) })) }, token });
      setBatch(res.batch);
      const failed = res.results.filter((r) => r.result.startsWith("failed"));
      if (failed.length) setError(`${failed.length} transaction(s) failed: ${failed[0].result}`);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  if (token && !me) return <Loading label="Checking your wallet" className="mt-8" />;
  if (!token || !me) return <Card className="mt-8"><p className="text-muted">Sign in with the fee wallet to run payouts.</p></Card>;
  if (!me.is_admin) return <Card className="mt-8"><p className="text-muted">Only the fee wallet can run payouts. You&apos;re signed in as {wallet && shortWallet(wallet)}.</p></Card>;

  const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}${data?.cluster === "mainnet" ? "" : `?cluster=${data?.cluster}`}`;
  const pending = batch?.items.filter((i) => i.status === "pending") ?? [];
  const totalSol = pending.filter((i) => i.kind !== "burn").reduce((s, i) => s + i.sol, 0);

  return (
    <div className="space-y-6 pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Payouts</h1>
        <p className="text-muted">Fee wallet {data && shortWallet(data.fee_wallet)} · {data?.cluster}</p>
      </div>
      {error && <p className="text-danger">{error}</p>}

      {!data && !error && <Loading label="Reading the fee wallet" />}
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><p className="text-sm text-muted">In the fee wallet</p><p className="text-2xl font-semibold">{data.wallet_sol == null ? "-" : fmtSol(data.wallet_sol)}</p></Card>
          {Object.entries(data.buckets).filter(([, v]) => v !== 0).map(([k, v]) => (
            <Card key={k}><p className="text-sm text-muted">{k.startsWith("pot:") ? `Prize pot (${k.slice(4)})` : k === "owed" ? "Prizes owed" : k[0].toUpperCase() + k.slice(1)}</p>
              <p className="text-2xl font-semibold">{fmtSol(v)}</p></Card>
          ))}
        </div>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{batch ? `Batch #${batch.id} · ${new Date(batch.created_at).toLocaleString()}` : "No batch yet"}</p>
            {batch && <p className="text-sm text-muted">{batch.status} · {pending.length} to send{pending.length ? ` · ${fmtSol(totalSol)}` : ""}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={prepare} disabled={!!busy}>Prepare today&apos;s batch</Button>
            <Button onClick={approve} disabled={!!busy || !pending.length}>Approve in wallet</Button>
          </div>
        </div>
        {busy && <p className="text-sm text-highlight-ink">{busy}</p>}
        {batch && (
          <ul className="divide-y divide-line text-sm">
            {batch.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{KIND[i.kind]}{i.wallet && <span className="text-muted"> · {shortWallet(i.wallet)}</span>}
                  {i.note && <span className="text-muted"> · {i.note}</span>}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{i.kind === "burn" ? `${(i.tokens / 1e6).toLocaleString()} $ELEVN` : fmtSol(i.sol)}</span>
                  {i.signature ? <a href={explorer(i.signature)} target="_blank" rel="noreferrer" className="text-ok">{i.status}</a>
                    : <span className={i.status === "failed" ? "text-danger" : "text-muted"}>{i.status}</span>}
                </span>
              </li>
            ))}
            {batch.items.length === 0 && <li className="py-2 text-muted">Nothing due today.</li>}
          </ul>
        )}
      </Card>
    </div>
  );
}
