import { expect, test } from "@playwright/test";
import { skipIntro } from "./helpers";

const PAGES = [
  ["/how-to-play", "Four steps to your first squad"],
  ["/about", /./],
  ["/roadmap", "Where elevn is going"],
  ["/news", "What's new at elevn"],
  ["/faq", /./],
  ["/premier-league", "Premier League"],
  ["/la-liga", "La Liga"],
  ["/bundesliga", "Bundesliga"],
] as const;

test.beforeEach(async ({ page }) => { await skipIntro(page); });

for (const [path, heading] of PAGES) {
  test(`${path} loads without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main h1")).toHaveText(heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// From desktop width the bar carries Leagues, Chat and How to play; phones keep the logo, sign in and Menu.
const wide = () => test.info().project.name === "desktop";

test("the top bar: playing pages from desktop width, logo, sign in and menu on phones", async ({ page }) => {
  await page.goto("/how-to-play");
  const nav = page.locator('header nav[aria-label="Main"]');
  if (wide()) {
    await expect(nav.getByRole("combobox", { name: "Leagues" })).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText(["Chat", "How to play"]);
    await expect(nav.getByRole("link", { name: "How to play" })).toHaveAttribute("aria-current", "page");
  } else {
    await expect(nav).toBeHidden();
  }
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("nav links, sign in and menu never overlap, down to the smallest desktop width", async ({ page }) => {
  if (wide()) await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/how-to-play");
  const signIn = await page.getByRole("button", { name: "Sign in", exact: true }).boundingBox();
  const menu = await page.getByRole("button", { name: "Open menu" }).boundingBox();
  expect(signIn!.x + signIn!.width).toBeLessThanOrEqual(menu!.x);
  if (wide()) {
    const last = await page.locator('header nav[aria-label="Main"] a').last().boundingBox();
    expect(last!.x + last!.width).toBeLessThan(signIn!.x);
  }
});

test("the menu lists the right pages, moves without a reload and closes", async ({ page }) => {
  await page.goto("/premier-league");
  await page.evaluate(() => { (window as Window & { sameDocument?: boolean }).sameDocument = true; });
  await page.getByRole("button", { name: "Open menu" }).click();
  const items = page.locator(".sm-panel-item");
  const more = page.locator(".sm-socials-link");
  if (wide()) {
    await expect(items).toHaveText(["About", "Roadmap", "News", "FAQ"]);
    await expect(more).toHaveCount(0);
  } else {
    await expect(items).toHaveText(["Premier League", "La Liga", "Bundesliga", "Chat"]);
    await expect(more).toHaveText(["How to play", "About", "Roadmap", "News", "FAQ"]);
  }
  const [target, heading, url] = wide() ? ["News", "What's new at elevn", /\/news$/] : ["La Liga", "La Liga", /\/la-liga$/];
  await page.locator(".staggered-menu-panel").getByRole("link", { name: target, exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator("main h1")).toHaveText(heading);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { sameDocument?: boolean }).sameDocument)).toBe(true);
});

test("the menu's small row opens a page in the same tab", async ({ page }) => {
  test.skip(wide(), "the small row is for phones and tablets");
  await page.goto("/premier-league");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator(".sm-socials-link", { hasText: "FAQ" }).click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("the bar's Leagues picker opens a league and then names it", async ({ page }) => {
  test.skip(!wide(), "the bar's links start at desktop width");
  await page.goto("/how-to-play");
  const leagues = page.locator('header nav[aria-label="Main"]').getByRole("combobox", { name: "Leagues" });
  await expect(leagues).toHaveText("Leagues");
  await leagues.click();
  await page.getByRole("option", { name: "La Liga" }).click();
  await expect(page).toHaveURL(/\/la-liga$/);
  await expect(page.locator("main h1")).toHaveText("La Liga");
  await expect(leagues).toHaveText("La Liga");
});

test("the keyboard skips the menu's links while it is closed", async ({ page }) => {
  await page.goto("/how-to-play");
  await page.getByRole("button", { name: "Open menu" }).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".staggered-menu-panel")))).toBe(false);
});

test("a league opens on its own gameweek after another league was browsed", async ({ page }) => {
  await page.goto("/premier-league");
  const gameweek = page.locator("main h3").first();
  await expect(gameweek).toHaveText(/Gameweek \d+/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const browsed = await gameweek.textContent();
  await page.evaluate(() => window.scrollTo(0, 0));   // the nav hides while scrolled down, by design
  if (wide()) {
    await page.locator('header nav[aria-label="Main"]').getByRole("combobox", { name: "Leagues" }).click();
    await page.getByRole("option", { name: "Bundesliga" }).click();
  } else {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator(".staggered-menu-panel").getByRole("link", { name: "Bundesliga", exact: true }).click();
  }
  await expect(page.locator("main h1")).toHaveText("Bundesliga");
  await expect(gameweek).toHaveText(/Gameweek \d+/);
  expect(await gameweek.textContent()).not.toBe(browsed);
});

test("a league page shows the season rail and moves through fixtures", async ({ page }) => {
  await page.goto("/la-liga");
  await expect(page.locator(".rail-tick").first()).toBeVisible();
  expect(await page.locator(".rail-tick").count()).toBeGreaterThan(30);
  const gameweek = page.locator("main h3").first();
  await expect(gameweek).toHaveText(/Gameweek \d+/);
  const start = await gameweek.textContent();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(gameweek).not.toHaveText(start!);
  await expect(page.locator("main section ul li").first()).toContainText(/\d+ - \d+/);
});

test("leagues that aren't open say so", async ({ page }) => {
  await page.goto("/serie-a");
  await expect(page.locator("main")).toContainText("opens after launch");
});

test("the footer has no payouts link", async ({ page }) => {
  await page.goto("/how-to-play");
  await expect(page.locator("footer").getByRole("link", { name: "Payouts" })).toHaveCount(0);
});

test("the teaser shows only the launch notice", async ({ page }) => {
  await page.goto("/teaser");
  await expect(page.getByText("Not live yet. Launching soon.")).toBeVisible();
  await expect(page.getByRole("link", { name: "elevn on X" })).toBeVisible();
});

test("signing in opens the wallet list", async ({ page }) => {
  await page.goto("/premier-league");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".wallet-adapter-modal")).toBeVisible();
});

test("an outage says so, and Try again recovers", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto("/premier-league");
  await expect(page.getByText("elevn can't be reached right now. Try again in a minute.").first()).toBeVisible();
  await expect(page.getByText("The table couldn't load")).toBeVisible();
  await expect(page.getByText("No squads have scored yet")).toHaveCount(0);
  await page.unroute("**/api/**");
  await page.getByRole("button", { name: "Try again" }).first().click();
  await expect(page.getByText("The table couldn't load")).toHaveCount(0);
});

test("the payouts API refuses visitors who aren't signed in", async ({ request }) => {
  expect((await request.get("/api/admin/overview")).status()).toBe(401);
});

test("the home page's league fan: five cards, live ones link, hover lifts, a click opens the league", async ({ page }) => {
  await page.goto("/#leagues");
  const fan = page.getByRole("region", { name: "League areas" });
  const cards = fan.locator(".league-fan-card");
  await expect(cards).toHaveCount(5);
  await expect(fan.getByRole("link")).toHaveCount(3);
  await expect(fan.getByText("Coming soon")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const laLiga = fan.getByRole("link", { name: "La Liga: build your squad" });
  // the card to its left lies on top of most of it: aim at the strip that shows, its right edge
  const box = (await laLiga.boundingBox())!;
  const edge = { x: box.width - 12, y: box.height / 2 };
  if (wide()) {
    await laLiga.hover({ position: edge });
    await expect.poll(async () => (await laLiga.boundingBox())!.y).toBeLessThan(box.y - 20);
  }
  await laLiga.click({ position: edge });
  await expect(page).toHaveURL(/\/la-liga$/);
  await expect(page.locator("main h1")).toHaveText("La Liga");
});
