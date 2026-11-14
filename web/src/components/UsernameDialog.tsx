"use client";

// Pick or change a username (PUT /api/me/username, squad/profiles.py). The Header shows it: by itself once
// a visit after signing in without a username, and from the wallet menu or the chat any time. The rules are
// shown up front and availability is checked while typing; the API makes the final call.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./auth";
import { useDialog } from "./ui";

const SHAPE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const RULES = "3 to 20 letters, numbers or underscores, starting with a letter";
type Check = { name: string; available: boolean; reason: string | null };

export default function UsernameDialog() {
  const { me, token, usernameOpen, closeUsername, refresh } = useAuth();
  const [name, setName] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = me?.username ?? null;
  const close = () => { if (!saving) closeUsername(); };   // never mid-save
  const box = useDialog<HTMLFormElement>(usernameOpen && Boolean(me), close, input);

  useEffect(() => { if (usernameOpen) { setName(current ?? ""); setCheck(null); setError(null); } }, [usernameOpen, current]);

  const typed = name.trim();
  // is it free? asked a moment after typing stops, only for names that already follow the rules; an answer
  // for a name that has since changed is dropped
  useEffect(() => {
    if (!usernameOpen || !SHAPE.test(typed) || typed === current) return;
    let stale = false;
    const t = setTimeout(() => {
      api<Omit<Check, "name">>(`/usernames/${encodeURIComponent(typed)}`, { token })
        .then((r) => { if (!stale) setCheck({ name: typed, ...r }); }).catch(() => { if (!stale) setCheck(null); });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [typed, usernameOpen, current, token]);

  if (!usernameOpen || !me) return null;

  const nextChange = me.username_next_change ? new Date(me.username_next_change) : null;
  const locked = Boolean(current && nextChange && nextChange > new Date());
  const known = check?.name === typed ? check : null;
  const shapeOk = SHAPE.test(typed);
  const canSave = shapeOk && typed !== current && known?.available !== false && !locked && !saving;
  const pending = shapeOk && typed !== current && !known && !locked;
  const hint = locked ? `You can change it again on ${nextChange!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : !typed || typed === current || !shapeOk ? RULES
    : known ? (known.available ? `${typed} is available` : known.reason ?? "Not available") : "Checking…";
  const bad = !locked && Boolean(typed) && typed !== current && (!shapeOk || known?.available === false);
  const tone = bad ? "text-danger" : known?.available && !locked ? "text-ok" : "text-muted";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      await api("/me/username", { method: "PUT", body: { username: typed }, token });
      await refresh();
      closeUsername();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={close}>
      <form ref={box} role="dialog" aria-modal="true" aria-labelledby="username-title" onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-6 sm:rounded-2xl">
        <h2 id="username-title" className="text-xl font-bold tracking-[-0.01em]">{current ? "Change your username" : "Pick your username"}</h2>
        <p className="mt-1 text-[14px] text-muted">
          {current ? "You can change it once a week." : "It shows in the tables and the chat instead of your wallet address. You can change it once a week."}
        </p>
        <label htmlFor="username" className="mt-5 block text-[13px] font-medium text-muted">Username</label>
        <input id="username" ref={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} disabled={locked}
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          aria-describedby={`username-hint${error ? " username-error" : ""}`} aria-invalid={bad || Boolean(error)}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-[16px] transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60" />
        {/* announced when the answer settles, not on every "Checking…" while typing */}
        <p id="username-hint" role="status" aria-live={pending ? "off" : "polite"} className={`mt-2 min-h-5 text-[13px] ${tone}`}>{hint}</p>
        {error && <p id="username-error" role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="submit" disabled={!canSave} className="btn btn-primary flex-1">
            {saving ? "Saving…" : current ? "Change username" : "Save username"}
          </button>
          <button type="button" onClick={close} disabled={saving} className="btn btn-secondary">{current ? "Cancel" : "Later"}</button>
        </div>
      </form>
    </div>
  );
}
