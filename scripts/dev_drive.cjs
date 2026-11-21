// Drives Today, Ranks, Winnings and /admin in a real browser against the local API (see docs/build/RUN_LOCAL.md).
// A test wallet signs the real sign-in message (ed25519, node crypto). Usage:
//   node scripts/dev_drive.cjs <step>      step: guest | me | release | after | all
// Env: SITE (default http://localhost:3000), OUT (screenshot dir). Keys come from scripts/dev_seed.py's scheme.
const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
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

async function run(step) {
  const browser = await chromium.launch();
  for (const width of [1440, 390]) {
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
    if (step === "after" || step === "all") {
      const { ctx, page } = await open(browser, "me", width);
      await visit(page, "/ranks"); await signIn(page); await visit(page, "/ranks"); await shot(page, "ranks-final", width);
      await visit(page, "/winnings"); await shot(page, "winnings", width);
      await ctx.close();
    }
  }
  await browser.close();
}
run(process.argv[2] || "all").catch((e) => { console.error(e); process.exit(1); });
