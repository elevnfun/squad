// Drives Today, Ranks, Winnings and /admin in a real browser against the local API (see docs/build/RUN_LOCAL.md).
// A test wallet signs the real sign-in message (ed25519, node crypto). Usage:
//   node scripts/dev_drive.cjs <step>      step: guest | me | release | after | blitz | draft | all
//   `blitz` plays a whole matchday on the real API (needs the seed, the API with RUN_JOBS=1 and DATABASE_URL set); see below.
//   `draft` plays the weekly Draft the same way (a UK Friday to Monday; it moves all six seeded fixtures); see below.
// Env: SITE (default http://localhost:3000), OUT (screenshot dir). Keys come from scripts/dev_seed.py's scheme.
const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
const { execSync } = require("child_process");
const SITE = process.env.SITE || "http://localhost:3000";
const OUT = process.env.OUT || path.join(__dirname, "..", "docs", "build", "shots");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (buf) => { let n = BigInt("0x" + buf.toString("hex")), s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = "1" + s; } return s; };
const keyOf = (name) => {
  const seed = crypto.createHash("sha256").update(`elevn-dev-${name}`).digest();
  const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32);
  return { priv, pub };
};
async function open(browser, name, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
  if (name) {
    const { priv, pub } = keyOf(name);
    await page.exposeFunction("__sign", (hex) => crypto.sign(null, Buffer.from(hex, "hex"), priv).toString("hex"));
    await page.addInitScript(([pubHex, address]) => {
      // a Wallet Standard wallet (the site detects wallets this way); signMessage is done in node with the real key
      const bytes = Uint8Array.from(pubHex.match(/../g).map((h) => parseInt(h, 16)));
      const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, "0")).join("");
      const chains = ["solana:devnet", "solana:mainnet", "solana:testnet"];
      const account = { address, publicKey: bytes, chains, features: ["solana:signMessage", "solana:signTransaction"] };
      const listeners = [];
      const wallet = { version: "1.0.0", name: "Phantom", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=", chains, accounts: [],
        features: {
          "standard:connect": { version: "1.0.0", connect: async () => { wallet.accounts = [account]; listeners.forEach((f) => f({ accounts: wallet.accounts })); return { accounts: wallet.accounts }; } },
          "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; listeners.forEach((f) => f({ accounts: [] })); } },
          "standard:events": { version: "1.0.0", on: (e, f) => { listeners.push(f); return () => {}; } },
          "solana:signMessage": { version: "1.0.0", signMessage: async (...inputs) => Promise.all(inputs.map(async (i) => {
            const sig = await window.__sign(hex(i.message));
            return { signedMessage: i.message, signature: Uint8Array.from(sig.match(/../g).map((h) => parseInt(h, 16))) }; })) },
          "solana:signIn": { version: "1.0.0", signIn: async (...inputs) => Promise.all(inputs.map(async (i) => {
            const msg = `${i.domain} wants you to sign in with your Solana account:\n${address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: ${i.version}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}\nExpiration Time: ${i.expirationTime}`;
            const m = new TextEncoder().encode(msg);
            const sig = await window.__sign(hex(m));
            wallet.accounts = [account]; listeners.forEach((f) => f({ accounts: wallet.accounts }));
            return { account, signedMessage: m, signature: Uint8Array.from(sig.match(/../g).map((h) => parseInt(h, 16))), signatureType: "ed25519" }; })) },
          "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: async () => { throw new Error("not in the test wallet"); } },
        } };
      const reg = (api) => api.register(wallet);
      try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: reg })); } catch {}
      window.addEventListener("wallet-standard:app-ready", (e) => reg(e.detail));
    }, [pub.toString("hex"), b58(Buffer.from(pub))]);
  }
  return { ctx, page };
}
async function signIn(page) {
  await page.getByRole("button", { name: /connect wallet/i }).first().click();
  await page.getByText("Phantom", { exact: false }).first().click();
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("squad.token.")), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const later = page.getByRole("button", { name: "Later" });
  if (await later.count()) await later.first().click();
}
async function shot(page, name, width) { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(OUT, `real-${name}-${width}.png`), fullPage: true }); }
async function visit(page, url) { await page.goto(SITE + url, { waitUntil: "networkidle" }); }


// ---------------------------------------------------------------- Matchday Blitz, end to end
const ROOT = path.join(__dirname, "..");
const seedPhase = (phase) => {          // moves today's fixtures; the API's minute job then locks and scores
  const out = execSync(`PYTHONPATH=. uv run -q python scripts/dev_seed.py --phase ${phase}${phase === "pre" ? " --clean" : ""} 2>&1 | grep "phase"`,
    { cwd: ROOT, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5433/squad_dev" } }).toString().trim();
  console.log("  seed:", out);
};
let failed = 0;
const check = (ok, what) => { if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`); };
const apiGet = (page, p) => page.evaluate(async (p) => {
  const t = localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("squad.token.")) || "");
  const r = await fetch("/api" + p, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  return r.ok ? r.json() : { error: r.status };
}, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pick `k` players in the open squad: two from the home club, one from the away club, then make the first picked one captain
async function build(page, offset = 0) {
  const swb = page.locator(".bz-swb");
  const col = (i) => page.locator(".bz-col").nth(i);
  const take = async (club, n, skip) => {
    if (await swb.count() && await swb.nth(club).isVisible()) await swb.nth(club).click();     // phone: one club at a time
    const rows = col(club).locator("button.bz-pick:not([disabled])[aria-pressed=false]");
    for (let i = 0; i < n; i++) await rows.nth(skip + (n > 1 ? 0 : 0)).click();
  };
  await take(0, 2, offset); await take(1, 1, offset);
  if (await swb.count() && await swb.nth(0).isVisible()) await swb.nth(0).click();
  await page.locator("button.bz-c[aria-pressed=false]").first().click();
}
const saveBtn = (page) => page.getByRole("button", { name: /^Save squad/ });
async function saveActive(page) {
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Save squad/.test(x.textContent || "")); return b && !b.disabled; }, null, { timeout: 8000 });
  await saveBtn(page).click();
  await page.getByText(/Squad \d saved/).first().waitFor({ timeout: 8000 });
}
const fxRow = (page, i) => page.locator("button.bz-fxr").nth(i);
async function waitState(page, slot, pred, label, ms = 130000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = await apiGet(page, "/blitz/next");
    const sq = m.mine?.squads?.find((q) => q.slot === slot);
    if (sq && pred(sq)) return sq;
    await sleep(5000);
  }
  check(false, `${label}: timed out`); return null;
}

async function blitzFlow(browser, width) {
  console.log(`== blitz at ${width}`);
  seedPhase("pre");
  // 1. a guest builds a squad and checks it; nothing is saved
  {
    const { ctx, page } = await open(browser, null, width);
    await visit(page, "/today"); await shot(page, "blitz-today-guest", width);
    await visit(page, "/blitz"); await fxRow(page, 0).click();
    await build(page);
    await page.getByText(/Connect a wallet to save it/).waitFor({ timeout: 8000 });
    check(true, "guest: squad ready, the check passed, the save button asks to connect");
    await shot(page, "blitz-guest-ready", width);
    await page.reload({ waitUntil: "networkidle" });
    check(await page.locator(".bz-card.empty").count() === 3, "guest: a refresh clears the squad (nothing saved)");
    await ctx.close();
  }
  // 2. the signing wallet: 3 squads, change one, remove one, save again
  const { ctx, page } = await open(browser, "me", width);
  await visit(page, "/blitz"); await signIn(page); await visit(page, "/blitz");
  await visit(page, "/today"); await shot(page, "blitz-today-pick", width);
  await visit(page, "/blitz");
  for (let i = 0; i < 2; i++) { await fxRow(page, i).click(); await build(page); await saveActive(page); }
  let m = await apiGet(page, "/blitz/next");
  check(m.mine?.squads?.length === 2, "signed in: 2 squads saved on the server");
  await shot(page, "blitz-two-saved", width);
  await visit(page, "/today"); await shot(page, "blitz-today-set", width);
  await visit(page, "/blitz");
  await fxRow(page, 2).click(); await build(page); await saveActive(page);
  m = await apiGet(page, "/blitz/next");
  check(m.mine?.squads?.length === 3, "signed in: 3 squads saved");
  const before = m.mine.squads.find((q) => q.slot === 1).players.map((p) => p.id).sort().join();
  // change squad 1: drop one player, take another, set the captain again
  await fxRow(page, 0).click();
  await page.locator("button.bz-pick[aria-pressed=true]").first().click();
  const swb = page.locator(".bz-swb");
  if (await swb.count() && await swb.nth(0).isVisible()) await swb.nth(0).click();
  await page.locator(".bz-col").nth(0).locator("button.bz-pick:not([disabled])[aria-pressed=false]").last().click();
  if (!(await page.locator("button.bz-c[aria-pressed=true]").count())) await page.locator("button.bz-c[aria-pressed=false]").first().click();
  await saveActive(page);
  m = await apiGet(page, "/blitz/next");
  check(m.mine.squads.find((q) => q.slot === 1).players.map((p) => p.id).sort().join() !== before, "signed in: squad 1 changed and saved");
  // remove squad 3, then save it again
  await page.getByRole("button", { name: "Remove squad 3" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".bz-card.empty").length === 1, null, { timeout: 8000 });
  m = await apiGet(page, "/blitz/next");
  check(m.mine.squads.length === 2, "signed in: squad 3 removed");
  await fxRow(page, 2).click(); await build(page, 1); await saveActive(page);
  m = await apiGet(page, "/blitz/next");
  check(m.mine.squads.length === 3, "signed in: squad 3 saved again");
  await shot(page, "blitz-three-saved", width);
  await visit(page, "/today"); await shot(page, "blitz-today-set3", width);

  // 3. kick-off of the first fixture: the minute job locks and scores; the squad shows live
  seedPhase("live");
  const live = await waitState(page, 1, (q) => q.state === "live" && q.locked, "squad 1 live");
  check(Boolean(live), "job: squad 1 locked and live after kick-off");
  if (live) {
    const cap = live.players.find((p) => p.is_captain);
    check(live.points === Math.round(live.players.reduce((t, p) => t + p.points, 0) * 100) / 100, "live: squad points equal the sum of players' points (captain already doubled)");
    await visit(page, "/blitz"); await shot(page, "blitz-live", width);
    const shown = await page.locator(".bz-card", { hasText: "Live" }).first().innerText();
    check(shown.includes(`· ${cap.points} (C ×2)`) && !shown.includes(`· ${cap.points * 2}`), "pick page shows the captain's points once, labelled C ×2");
    await visit(page, "/today"); await shot(page, "blitz-today-live", width);
    await visit(page, "/ranks"); await shot(page, "blitz-ranks-live", width);
    const you = await page.locator(".rk-you").innerText();
    const mine = await apiGet(page, `/blitz/${live.day || (await apiGet(page, "/blitz/next")).contest.day}/mine`);
    check(mine.place != null && you.includes(`${mine.place === 1 ? "1st" : mine.place === 2 ? "2nd" : mine.place === 3 ? "3rd" : mine.place + "th"}`), `ranks: your line says place ${mine.place} like the API`);
    check(await page.locator(".rk-you a[href='/blitz']").count() === 1, "ranks: your line links to /blitz");
  }

  // 4. full time, then banked 15 minutes after: squads 1 and 2 bank
  seedPhase("banked");
  const bk = await waitState(page, 1, (q) => q.state === "banked", "squad 1 banked");
  check(Boolean(bk), "job: squad 1 banked");
  if (bk) {
    const day = (await apiGet(page, "/blitz/next")).contest.day;
    await visit(page, `/blitz/banked?day=${day}&slot=1`); await shot(page, "blitz-banked", width);
    const text = await page.locator("main, .bk-card").first().innerText();
    const cap = bk.players.find((p) => p.is_captain);
    check(text.includes(`+${bk.points}`), `banked screen shows +${bk.points}`);
    const capRow = await page.locator(".bk-prow").first().innerText();
    check(capRow.trim().endsWith(String(cap.points)) && !capRow.includes(String(cap.points * 2)), `banked screen: captain row shows ${cap.points} (not doubled again)`);
    await visit(page, "/blitz"); await shot(page, "blitz-banked-list", width);
    await visit(page, "/today"); await shot(page, "blitz-today-banked", width);
    check((await page.locator("a[href^='/blitz/banked']").count()) === 1, "today: link to the banked screen");
    await visit(page, "/ranks"); await shot(page, "blitz-ranks-banked", width);
  }

  // 5. every match over and the result final: the card shows the final place and the prize
  seedPhase("closed");
  const closed = await (async () => {
    const end = Date.now() + 130000;
    while (Date.now() < end) {
      const t = await apiGet(page, "/today");
      const c = t.contests?.find((x) => x.kind === "blitz_matchday");
      if (c && (c.state === "review" || c.state === "final")) return c;
      await sleep(5000);
    }
    return null;
  })();
  check(Boolean(closed), "job: matchday moved to review after the last match");
  await visit(page, "/today"); await shot(page, "blitz-today-closed", width);
  await visit(page, "/ranks"); await shot(page, "blitz-ranks-closed", width);
  await ctx.close();
}

// ---------------------------------------------------------------- weekly Draft, end to end
const seedDraft = (args) => {
  const out = execSync(`PYTHONPATH=. uv run -q python scripts/dev_seed.py ${args} 2>&1 | grep -E "draft week|Error|needs"`,
    { cwd: ROOT, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5433/squad_dev" } }).toString().trim();
  console.log("  seed:", out);
};
const apiSend = (page, method, p, body) => page.evaluate(async ([method, p, body]) => {
  const t = localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("squad.token.")) || "");
  const r = await fetch("/api" + p, { method, headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, p, body]);
// the 15 on the page, from each chip's accessible name: "Name, POS, Club, Tier[, in your five]"
async function chipsOf(page) {
  const labels = await page.locator("button.dp-cb").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  return labels.map((l, i) => { const [name, pos, club, tier] = l.split(", "); return { i, name, pos, club, tier: tier.toLowerCase() }; });
}
// a five that follows every rule (or, with `bad`, one with 3 Top players); indexes into chipsOf
function pickFive(chips, bad = false) {
  const idx = chips.map((c) => c.i), out = [];
  const ok = (s) => {
    const by = (f) => s.filter((c) => f(chips[c])).length;
    const clubs = {}; s.forEach((c) => { clubs[chips[c].club] = (clubs[chips[c].club] || 0) + 1; });
    return ["DEF", "MID", "ATT"].every((p) => by((c) => c.pos === p) >= 1) && Math.max(...Object.values(clubs)) <= 2
      && (bad || (by((c) => c.tier === "top") <= 2 && by((c) => c.tier === "mid") <= 2));
  };
  const rec = (start, cur) => {
    if (out.length > 40) return;
    if (cur.length === 5) { if (ok(cur) && (!bad || cur.filter((c) => chips[c].tier === "top").length === 3)) out.push([...cur]); return; }
    for (let k = start; k < idx.length; k++) rec(k + 1, [...cur, idx[k]]);
  };
  rec(0, []);
  return out[bad ? 0 : Math.min(out.length - 1, 3)];
}
const dpick = async (page, ids) => { for (const i of ids) await page.locator("button.dp-cb").nth(i).click(); };
const dcard = (page) => page.locator("article[aria-labelledby='t-Draft']");
async function cardState(page, want, label) {
  const end = Date.now() + 15000; let st = null;
  while (Date.now() < end) { st = await dcard(page).getAttribute("data-state"); if (st === want) break; await sleep(500); }
  check(st === want, `today card: ${label} (state ${st})`);
  return dcard(page).innerText();
}
async function openAll(page, label) {
  await page.getByRole("button", { name: "Open all" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".dp-pkt.opened").length === 5, null, { timeout: 15000 });
  check(true, `${label}: all five packs opened`);
}
async function saveTeam(page) {
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Save team/.test(x.textContent || "")); return b && !b.disabled; }, null, { timeout: 8000 });
  await page.getByRole("button", { name: /^Save team/ }).click();
  await page.getByText(/Team saved\./).first().waitFor({ timeout: 8000 });
}
const placeWord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;

async function draftFlow(browser, width) {
  console.log(`== draft at ${width}`);
  seedDraft("--draft-phase pre");
  // 1. a guest opens sample packs, builds a team and checks it; nothing is saved
  {
    const { ctx, page } = await open(browser, null, width);
    await visit(page, "/today");
    const t = await cardState(page, "packs", "guest sees the first state");
    check(/sample packs/.test(t) && (await dcard(page).locator("a[href='/draft']").innerText()) === "Try Draft", "today card: guest, sample packs, button Try Draft -> /draft");
    await shot(page, "draft-today-guest", width);
    await visit(page, "/draft");
    await openAll(page, "guest");
    const chips = await chipsOf(page);
    check(chips.length === 15, "guest: 15 sample players listed");
    const five = pickFive(chips);
    const verdict = page.waitForResponse((r) => /\/draft\/next\/check$/.test(r.url()), { timeout: 10000 });
    await dpick(page, five);
    await page.locator(".dp-capb[aria-pressed=false]").first().click();
    const v = await (await verdict).json().catch(() => null);
    check(v?.ok === true, "guest: the server's check passed the team");
    await page.getByText(/Sample team: connecting deals/).first().waitFor({ timeout: 8000 });
    check(await page.getByRole("button", { name: "Connect wallet to save" }).count() === 1, "guest: the save button asks to connect");
    await shot(page, "draft-guest-ready", width);
    await page.reload({ waitUntil: "networkidle" });
    check(await page.locator(".dp-pkt.opened").count() === 0, "guest: a refresh clears the packs and the team (nothing saved)");
    await ctx.close();
  }
  // 2. the signing wallet: open packs, save a team, change the captain, save again, a broken team is refused
  const { ctx, page } = await open(browser, "me", width);
  await visit(page, "/today"); await signIn(page);
  let t = await cardState(page, "packs", "signed in, packs to open");
  await shot(page, "draft-today-packs", width);
  await visit(page, "/draft");
  await shot(page, "draft-packs-sealed", width);
  await openAll(page, "signed in");
  let m = await apiGet(page, "/draft/next");
  check(m.mine?.packs?.length === 15 && m.mine.packs.every((p) => p.opened_at), "signed in: 15 players dealt, all opened on the server");
  await visit(page, "/today"); await cardState(page, "team", "packs opened, no team saved");
  await visit(page, "/draft");
  const chips = await chipsOf(page);
  const five = pickFive(chips);
  await dpick(page, five);
  await page.locator(".dp-capb[aria-pressed=false]").first().click();
  await shot(page, "draft-team-ready", width);
  await saveTeam(page);
  m = await apiGet(page, "/draft/next/mine");
  check(m.team?.length === 5 && m.captain_id != null, "signed in: team of 5 saved with a captain");
  const cap1 = m.captain_id;
  await shot(page, "draft-team-saved", width);
  await visit(page, "/today"); t = await cardState(page, "set", "team saved, shows when it locks");
  check(/Locks in/.test(t), "today card: saved team shows the lock countdown");
  await shot(page, "draft-today-set", width);
  await visit(page, "/draft");
  await page.locator(".dp-capb[aria-pressed=false]").first().click();
  await saveTeam(page);
  m = await apiGet(page, "/draft/next/mine");
  check(m.captain_id !== cap1 && m.team.length === 5, "signed in: captain changed and saved");
  // a team that breaks the tier limit: refused by the server with its own words, and the page will not offer the save
  const three = pickFive(chips, true);
  const bad = three.map((i) => chips[i].name);
  const ids = m.packs.filter((p) => bad.includes(p.name)).map((p) => p.player_id);
  const r = await apiSend(page, "PUT", "/draft/next/team", { team_ids: ids, captain_id: ids[0] });
  check(r.status === 400 && /at most 2 top/i.test(r.body?.detail || ""), `server refuses 3 Top players: ${r.status} "${r.body?.detail}"`);
  m = await apiGet(page, "/draft/next/mine");
  const savedIds = m.team.map((p) => p.id).sort().join();
  await visit(page, "/draft");
  while (await page.locator("button.dp-cb[aria-pressed=true]").count()) await page.locator("button.dp-cb[aria-pressed=true]").first().click();
  await dpick(page, three);
  await page.locator(".dp-capb[aria-pressed=false]").first().click();
  await page.getByText(/Not ready: at most 2 Top/).first().waitFor({ timeout: 8000 });
  check(await page.getByRole("button", { name: /^Save team/ }).isDisabled(), "page: 3 Top players, Save is disabled and says why");
  await shot(page, "draft-tier-refused", width);
  m = await apiGet(page, "/draft/next/mine");
  check(m.team.map((p) => p.id).sort().join() === savedIds, "the saved team is unchanged after the refusal");

  // 3. the lock passes: the minute job locks and scores
  seedDraft("--draft-phase live");
  const end = Date.now() + 130000; let live = null;
  while (Date.now() < end) { live = await apiGet(page, "/draft/next/mine"); if (live.state === "live" && live.total > 0) break; await sleep(5000); }
  check(live?.state === "live" && live.total > 0, `job: team locked and scored (state ${live?.state}, total ${live?.total})`);
  if (live?.state === "live") {
    const sum = Math.round(live.team.reduce((a, p) => a + p.points, 0) * 100) / 100;
    check(sum === live.total, `live: total ${live.total} equals the players' points added (captain already doubled)`);
    const cap = live.team.find((p) => p.is_captain);
    await visit(page, "/draft"); await shot(page, "draft-live", width);
    const board = await page.locator(".dp-pitch").innerText();
    check(board.includes(`${cap.points} pts`) && !board.includes(`${cap.points * 2} pts`), `page: captain shows ${cap.points} pts once (not doubled again)`);
    check((await page.locator(".dp-result .tot b").innerText()) === String(live.total), "page: total matches the API");
    check((await page.locator(".dp-pl small").allInnerTexts()).every((x) => x.trim()), "page: every player on the board shows his club");
    await visit(page, "/today"); await cardState(page, "running", "locked and scoring"); await shot(page, "draft-today-live", width);
    check(await dcard(page).locator("a[href='/draft']").innerText() === "Live", "today card: button Live -> /draft");
    await visit(page, "/ranks?board=draft"); await shot(page, "draft-ranks-live", width);
    const you = await page.locator(".rk-you").innerText();
    check(live.place != null && you.includes(`You are ${placeWord(live.place)}`), `ranks: your line says ${placeWord(live.place)} like the API`);
    check(await page.locator(".rk-you a[href='/draft']").count() === 1, "ranks: your line links to /draft");
  }

  // 4. every match over: the result is checked, then released; the card and the board show the final place and prize
  seedDraft("--draft-phase final");
  const wk = (await apiGet(page, "/today")).contests.find((x) => x.kind === "draft_week");
  let c = null; const end2 = Date.now() + 130000;
  while (Date.now() < end2) { c = (await apiGet(page, "/today")).contests.find((x) => x.kind === "draft_week"); if (c && c.state === "review") break; await sleep(5000); }
  check(c?.state === "review", "job: Draft week moved to review after the last match");
  await visit(page, "/draft"); await shot(page, "draft-final", width);
  await visit(page, "/today"); await cardState(page, "closed", "week over, result being checked"); await shot(page, "draft-today-review", width);
  seedDraft("--draft-release");
  const fin = await apiGet(page, `/draft/${wk.week_start}/mine`);
  check(fin.place != null && fin.prize_lamports > 0, `final: place ${fin.place}, prize ${fin.prize_sol} SOL on the API`);
  await visit(page, "/today"); t = await cardState(page, "closed", "week closed, final place and prize");
  check(t.includes(`${placeWord(fin.place)}`) && t.includes(String(fin.prize_sol).replace(/0+$/, "")) && !/\$/.test(t), "today card: final place and the prize in SOL only");
  check(await dcard(page).locator("a[href='/ranks?board=draft']").innerText() === "Result", "today card: button Result -> /ranks");
  await shot(page, "draft-today-closed", width);
  await visit(page, "/ranks?board=draft"); await shot(page, "draft-ranks-closed", width);
  const you = await page.locator(".rk-you").innerText();
  check(you.includes(`You are ${placeWord(fin.place)}`) && you.includes("You won"), `ranks: final line says ${placeWord(fin.place)} and a prize`);
  await ctx.close();
}

async function run(step) {
  const browser = await chromium.launch();
  for (const width of [1440, 390]) {
    if (step === "blitz") await blitzFlow(browser, width);
    if (step === "draft") await draftFlow(browser, width);
    if (step === "guest" || step === "all") {
      const { ctx, page } = await open(browser, null, width);
      await visit(page, "/today"); await shot(page, "today-guest", width);
      await ctx.close();
    }
    if (step === "me" || step === "all") {
      const { ctx, page } = await open(browser, "me", width);
      await visit(page, "/today"); await signIn(page); await shot(page, "today-me", width);
      for (const t of ["", "?board=weekly", "?board=draft"]) { await visit(page, "/ranks" + t); await shot(page, `ranks${t.replace(/\W/g, "-")}-before`, width); }
      await ctx.close();
    }
    if (step === "release" || step === "all") {
      const { ctx, page } = await open(browser, "admin", width);
      await visit(page, "/admin"); await signIn(page); await visit(page, "/admin");
      await shot(page, "admin-before", width);
      if (width === 1440) {
        await page.getByRole("button", { name: /^release/i }).first().click();
        await shot(page, "admin-confirm", width);
        await page.getByRole("button", { name: /confirm|yes/i }).first().click();
        await page.waitForTimeout(2000);
      }
      await shot(page, "admin-after", width);
      await ctx.close();
    }
    if (step === "collect" || step === "held") {
      const { ctx, page } = await open(browser, "me", width);
      await visit(page, "/winnings"); await signIn(page); await visit(page, "/winnings");
      if (step === "collect") await page.getByRole("button", { name: "Collect", exact: true }).click();
      await page.waitForTimeout(4000); console.log((await page.locator("main").innerText()).match(/.*(Sent\.|held for).*/)?.[0]); await shot(page, "winnings-" + (step === "held" ? "sent-claim" : "collect-try"), width);
      await ctx.close();
    }
    if (step === "after" || step === "all") {
      const { ctx, page } = await open(browser, "me", width);
      await visit(page, "/ranks"); await signIn(page); await visit(page, "/ranks"); await shot(page, "ranks-final", width);
      await visit(page, "/winnings"); await shot(page, "winnings", width);
      await ctx.close();
    }
  }
  await browser.close();
  if (failed) { console.log(`${failed} check(s) FAILED`); process.exit(2); }
}
run(process.argv[2] || "all").catch((e) => { console.error(e); process.exit(1); });
