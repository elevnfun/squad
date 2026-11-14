import { expect, type Page } from "@playwright/test";

type ListedPlayer = { name: string; club: string; position: string; price: number };

const QUOTA: Record<string, number> = { GK: 2, DEF: 5, MID: 5, ATT: 3 };
const MAX_PER_CLUB = 3;
const MIN_PRICE = 4;

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** The opening video plays once per browser session; tests start after it. */
export async function skipIntro(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("elevn-intro-seen", "1"));
}

export async function signInDemo(page: Page) {
  // the "Pick your username" dialog opens by itself for a wallet without one; these flows answer "Later"
  // up front (components/auth.tsx, squad.usernameLater) so it doesn't cover the page
  await page.evaluate(() => sessionStorage.setItem("squad.usernameLater", "1"));
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.locator("header").getByRole("combobox", { name: "Wallet" })).toBeVisible();
}

async function readPlayerList(page: Page): Promise<ListedPlayer[]> {
  return page.locator('button[aria-label^="Add "]').evaluateAll((buttons) => buttons.flatMap((button) => {
    const lines = (button.parentElement as HTMLElement).innerText.split("\n").map((line) => line.trim()).filter(Boolean);
    const club = lines.find((line) => /^[A-Z0-9]{2,4} (GK|DEF|MID|ATT)$/.test(line));
    const price = lines.find((line) => /^\d+\.\dM$/.test(line));
    return club && price ? [{ name: lines[0], club: club.split(" ")[0], position: club.split(" ")[1], price: parseFloat(price) }] : [];
  }));
}

/** The cheapest legal squad, eleven players | 4 substitutions: the right number per position and at most three from a club. */
function chooseSquad(players: ListedPlayer[]): ListedPlayer[] {
  const needed = { ...QUOTA };
  const perClub: Record<string, number> = {};
  return [...players].sort((a, b) => a.price - b.price).filter((player) => {
    if (!needed[player.position] || (perClub[player.club] ?? 0) >= MAX_PER_CLUB || player.price < MIN_PRICE) return false;
    needed[player.position] -= 1;
    perClub[player.club] = (perClub[player.club] ?? 0) + 1;
    return true;
  });
}

export async function pickFullSquad(page: Page) {
  const openList = async () => { if (isPhone(page)) await page.getByRole("button", { name: "Player list" }).click(); };
  await openList();
  await expect(page.locator('button[aria-label^="Add "]').first()).toBeVisible();
  const squad = chooseSquad(await readPlayerList(page));
  expect(squad).toHaveLength(15);
  for (const [index, player] of squad.entries()) {
    if (index > 0) await openList();
    await page.getByRole("button", { name: `Add ${player.name}`, exact: true }).first().click();
  }
}
