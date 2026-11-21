"use client";

// The community chat (GET/POST /api/chat, squad/chat.py): one room for every player. Anyone can read it;
// posting needs a username and $ELEVN in the wallet. New messages are fetched every few seconds while the page is
// visible (and at once when it becomes visible again); messages removed by their author, by reports or by the
// admin disappear on the next fetch. What players write is shown as plain text only: React escapes it and no
// link is ever made from it. Every change to the list goes through one merge, so a fetch landing late can't
// undo a send, a delete or an older page.
import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ChatMessage, ChatPage, shortWallet } from "@/lib/api";
import { useAuth } from "./auth";
import { Loading } from "./ui";

const POLL_MS = 5000;
const PAGE = 50;                   // squad/chat.py sends at most this many per answer (config.toml [chat] page)
const MAX_LENGTH = 500;            // config.toml [chat] max_length
const RELOAD_AFTER_MS = 9 * 60e3;  // away longer than the server remembers removals: load the room afresh
const ACTION = "inline-flex min-h-10 items-center rounded px-1.5 hover:text-text sm:min-h-8";

const name = (m: ChatMessage) => m.username ?? shortWallet(m.wallet);
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time
    : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

/** The list after adding `incoming` and dropping `gone`: no duplicates, oldest first. */
function merge(prev: ChatMessage[] | null, incoming: ChatMessage[], gone: Iterable<number> = []) {
  const byId = new Map((prev ?? []).map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  for (const id of gone) byId.delete(id);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export default function ChatRoom() {
  const { me, token, wallet, signIn, signingIn, openUsername } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [older, setOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [reported, setReported] = useState<ReadonlySet<number>>(new Set());
  const list = useRef<HTMLDivElement>(null);
  const newest = useRef(0);
  const oldest = useRef(0);
  const atBottom = useRef(true);
  const keepScroll = useRef<number | null>(null);   // the list's height before older messages were added on top
  const isAdmin = Boolean(me?.is_admin);
  const canPost = Boolean(me?.chat.can_post);

  useEffect(() => {
    newest.current = messages?.at(-1)?.id ?? 0;
    oldest.current = messages?.[0]?.id ?? 0;
  }, [messages]);

  // the room: loaded once, then kept fresh; signing in or out starts it again (the admin sees report counts)
  useEffect(() => {
    let cancelled = false, busy = false, hiddenSince = 0;
    const load = async () => {
      try {
        const p = await api<ChatPage>("/chat", { token });
        if (cancelled) return;
        setMessages(p.messages); setOlder(p.messages.length >= PAGE); setFailed(false);
      } catch { if (!cancelled) setFailed(true); }
    };
    const fetchNew = async () => {
      if (busy || cancelled || document.visibilityState !== "visible") return;
      busy = true;
      try {
        for (let round = 0; round < 5; round++) {   // catch up a page at a time after a gap
          const p = await api<ChatPage>(`/chat?after=${newest.current}`, { token });
          if (cancelled) return;
          if (p.messages.length || p.hidden.length) {
            const others = p.messages.filter((m) => m.wallet !== wallet && m.id > newest.current);
            setMessages((prev) => merge(prev, p.messages, p.hidden));
            if (others.length) {
              if (!atBottom.current) setUnseen((n) => n + others.length);
              const said = others.slice(-3).map((m) => `${name(m)}: ${m.body}`).join(". ");
              setAnnounce(others.length > 3 ? `${others.length} new messages. ${said}` : said);
            }
          }
          if (p.messages.length < PAGE) break;
          newest.current = p.messages.at(-1)!.id;
        }
      } catch { /* missed this time; the next tick tries again */ }
      finally { busy = false; }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") { hiddenSince = Date.now(); return; }
      if (hiddenSince && Date.now() - hiddenSince > RELOAD_AFTER_MS) load(); else fetchNew();
      hiddenSince = 0;
    };
    load();
    const timer = setInterval(fetchNew, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, wallet]);

  // stay at the newest message unless the reader has scrolled up; keep the view still when older ones load
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (keepScroll.current != null) { el.scrollTop += el.scrollHeight - keepScroll.current; keepScroll.current = null; }
    else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseen(0);
  };
  const toBottom = () => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion() ? "auto" : "smooth" });
    el.focus();
    setUnseen(0);
  };

  const loadOlder = async () => {
    if (loadingOlder || !oldest.current) return;
    setLoadingOlder(true);
    try {
      const p = await api<ChatPage>(`/chat?before=${oldest.current}`, { token });
      keepScroll.current = list.current?.scrollHeight ?? null;
      setOlder(p.messages.length >= PAGE);
      setMessages((prev) => merge(prev, p.messages));
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingOlder(false); }
  };

  const sent = useCallback((m: ChatMessage) => { atBottom.current = true; setMessages((prev) => merge(prev, [m])); }, []);
  const act = useCallback(async (run: () => Promise<unknown>, after: () => void) => {
    setError(null);
    try { await run(); after(); } catch (err) { setError((err as Error).message); }
  }, []);
  const remove = useCallback((m: ChatMessage) => act(() => api(`/chat/${m.id}`, { method: "DELETE", token }),
    () => setMessages((prev) => merge(prev, [], [m.id]))), [act, token]);
  const report = useCallback((m: ChatMessage) => act(() => api(`/chat/${m.id}/report`, { method: "POST", token }),
    () => { setReported((s) => new Set(s).add(m.id)); setAnnounce(`Reported the message from ${name(m)}`); }), [act, token]);
  const restore = useCallback((m: ChatMessage) => act(() => api(`/admin/chat/messages/${m.id}/restore`, { method: "POST", token }),
    () => setMessages((prev) => merge(prev, [{ ...m, held: false }]))), [act, token]);
  const moderate = useCallback((m: ChatMessage, action: "mute" | "ban") => {
    if (action === "ban" && !window.confirm(`Ban ${name(m)}? This also removes all their messages.`)) return;
    act(() => api(`/admin/chat/${m.wallet}`, { body: { action, hours: 24 }, token }), () => {
      if (action === "ban") setMessages((prev) => (prev ?? []).filter((x) => x.wallet !== m.wallet));
      setAnnounce(action === "ban" ? `Banned ${name(m)}` : `Muted ${name(m)} for 24 hours`);
    });
  }, [act, token]);

  return (
    <section aria-label="Community chat" className="relative mt-8 flex h-[calc(100svh-19rem)] min-h-[400px] flex-col sm:h-[min(72svh,760px)] sm:min-h-[440px] overflow-hidden rounded-2xl border border-line bg-surface">
      {/* what screen readers hear: only new messages from others, a few at a time, and the result of an action */}
      <div role="log" aria-live="polite" className="sr-only">{announce}</div>
      <div ref={list} onScroll={onScroll} role="region" aria-label="Messages" tabIndex={0}
        className="flex-1 overflow-y-auto overscroll-contain py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
        {failed ? <p className="p-5 text-muted">The chat couldn&apos;t load. Refresh to try again.</p>
          : messages === null ? <Loading label="Loading the chat" className="py-16" />
          : messages.length === 0 ? <p className="p-5 text-muted">No messages yet. Start the conversation about this week&apos;s fixtures.</p> : (
          <>
            {older && (
              <div className="px-4 py-2 text-center">
                <button onClick={loadOlder} disabled={loadingOlder} className="min-h-10 px-2 text-[13px] font-medium text-link hover:underline disabled:opacity-60">
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}
            <ol>
              {messages.map((m) => (
                <MessageRow key={m.id} m={m} mine={wallet != null && m.wallet === wallet} isAdmin={isAdmin}
                  canReport={canPost && wallet !== m.wallet && !m.admin} reported={reported.has(m.id)}
                  onDelete={remove} onReport={report} onModerate={moderate} onRestore={restore} />
              ))}
            </ol>
          </>
        )}
      </div>

      {unseen > 0 && (
        <button onClick={toBottom} className="absolute bottom-32 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-accent px-5 text-[14px] font-semibold text-accent-ink shadow-lg">
          {unseen} new message{unseen === 1 ? "" : "s"}
        </button>
      )}

      <div className="border-t border-line p-3 sm:p-4">
        {!token ? (
          <Prompt text="Sign in to join the chat. Reading is open to everyone.">
            <button onClick={signIn} disabled={signingIn} className="btn btn-primary btn-sm">{signingIn ? "Check your wallet…" : "Sign in"}</button>
          </Prompt>
        ) : !me ? <p className="text-[14px] text-muted">Loading your account…</p>
          : me.chat.reason === "username" ? (
          <Prompt text="Pick a username to chat."><button onClick={openUsername} className="btn btn-primary btn-sm">Pick username</button></Prompt>
        ) : me.chat.reason === "banned" ? <p className="text-[14px] text-muted">You&apos;re banned from the chat.</p>
          : me.chat.reason === "muted" ? <p className="text-[14px] text-muted">You&apos;re muted for now. You can read along.</p>
          : me.chat.reason ? (
          <Prompt text="Hold $ELEVN to chat. Reading is open to everyone."><Link href="/today" className="btn btn-primary btn-sm">See what unlocks</Link></Prompt>
        )
          : <Composer token={token} onSent={sent} />}
        {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
      </div>
    </section>
  );
}

function Prompt({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[14px] text-muted">{text}</p>
      {children}
    </div>
  );
}

// One message. Memoised, so typing in the composer or a new arrival doesn't redraw the whole room.
const MessageRow = memo(function MessageRow({ m, mine, isAdmin, canReport, reported, onDelete, onReport, onModerate, onRestore }: {
  m: ChatMessage; mine: boolean; isAdmin: boolean; canReport: boolean; reported: boolean;
  onDelete: (m: ChatMessage) => void; onReport: (m: ChatMessage) => void;
  onModerate: (m: ChatMessage, action: "mute" | "ban") => void; onRestore: (m: ChatMessage) => void;
}) {
  const who = name(m);
  return (
    <li className={`group px-4 py-2.5 hover:bg-white/[0.025] ${m.held ? "opacity-60" : ""}`}>
      <div className="flex items-baseline gap-2 text-[13px]">
        <span className={`truncate font-semibold ${m.admin ? "text-accent" : "text-text"}`}>{who}</span>
        {m.admin && <span className="rounded bg-accent px-1.5 text-[11px] font-bold text-accent-ink">elevn</span>}
        {mine && <span className="text-[12px] text-link">You</span>}
        {m.username && <span className="shrink-0 text-[12px] text-muted" title={m.wallet}>{shortWallet(m.wallet)}</span>}
        <time className="ml-auto shrink-0 text-[12px] tabular-nums text-muted" dateTime={m.at}>{when(m.at)}</time>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>
      {(mine || isAdmin || canReport) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100 motion-reduce:transition-none">
          {m.held && <span className="text-danger">Hidden by reports</span>}
          {m.held && <button onClick={() => onRestore(m)} className={ACTION} aria-label={`Restore the message from ${who}`}>Restore</button>}
          {(mine || isAdmin) && <button onClick={() => onDelete(m)} className={ACTION} aria-label={`Delete the message from ${who}`}>Delete</button>}
          {canReport && (reported ? <span className="px-1.5">Reported</span>
            : <button onClick={() => onReport(m)} className={ACTION} aria-label={`Report the message from ${who}`}>Report</button>)}
          {isAdmin && !mine && <>
            <button onClick={() => onModerate(m, "mute")} className={ACTION} aria-label={`Mute ${who} for 24 hours`}>Mute 24h</button>
            <button onClick={() => onModerate(m, "ban")} className={`${ACTION} text-danger`} aria-label={`Ban ${who}`}>Ban</button>
          </>}
          {isAdmin && Boolean(m.reports) && <span className="px-1.5 text-danger">{m.reports} report{m.reports === 1 ? "" : "s"}</span>}
        </div>
      )}
    </li>
  );
});

// The message box. It owns what's being typed, so typing redraws only this. Enter sends, Shift+Enter adds a line.
function Composer({ token, onSent }: { token: string; onSent: (m: ChatMessage) => void }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try {
      onSent(await api<ChatMessage>("/chat", { body: { body }, token }));
      setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  return (
    <>
      <form onSubmit={send} className="flex items-end gap-2">
        <label htmlFor="chat-message" className="sr-only">Message</label>
        <textarea id="chat-message" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
          rows={1} maxLength={MAX_LENGTH} placeholder="Message the chat"
          aria-describedby={`chat-rules${error ? " chat-error" : ""}`} aria-invalid={Boolean(error)}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[16px] leading-snug [field-sizing:content] focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
        <button type="submit" disabled={sending || !draft.trim()} className="btn btn-primary h-11 shrink-0">{sending ? "Sending…" : "Send"}</button>
      </form>
      <p id="chat-rules" className="mt-2 flex justify-between gap-3 text-[12px] text-muted">
        <span>Be kind. Plain text, no links, up to {MAX_LENGTH} characters. Enter sends, Shift+Enter adds a line.</span>
        <span aria-hidden="true" className={draft.length > MAX_LENGTH - 50 ? "text-danger" : ""}>{draft.length > 400 ? `${draft.length} / ${MAX_LENGTH}` : ""}</span>
      </p>
      {error && <p id="chat-error" role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
    </>
  );
}
