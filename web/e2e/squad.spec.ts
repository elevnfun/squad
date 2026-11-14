import { expect, test, type Page } from "@playwright/test";
import { isPhone, pickFullSquad, signInDemo, skipIntro } from "./helpers";

const shirts = (page: Page) => page.locator(".pitch-grass button");
const stats = (page: Page) => page.locator("main dl").last();

async function setRole(page: Page, shirt: number, role: "Captain" | "Vice-captain") {
  await shirts(page).nth(shirt).click();
  await page.getByLabel(role, { exact: true }).check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

test("build, save, change and delete a squad", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await skipIntro(page);
  await page.goto("/la-liga");
  await signInDemo(page);

  await test.step("a new squad opens on Pick team", async () => {
    await page.getByText("New squad", { exact: true }).click();
    await expect(page).toHaveURL(/\/la-liga\/squads\/\d+\?tab=pick/);
  });

  await test.step("eleven players and 4 substitutions fill the squad", async () => {
    await pickFullSquad(page);
    await expect(stats(page)).toContainText("15 / 15");
  });

  await test.step("saving needs a captain and vice-captain, then works", async () => {
    await expect(page.getByText("Choose a captain from your starting XI")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save squad" })).toBeDisabled();
    await setRole(page, 10, "Captain");
    await setRole(page, 9, "Vice-captain");
    await expect(page.getByRole("button", { name: "Save squad" })).toBeEnabled();
    await page.getByRole("button", { name: "Save squad" }).click();
    await expect(page.getByText(/Saved for gameweek \d+/)).toBeVisible();
  });

  await test.step("a transfer can be undone without emptying the list", async () => {
    await shirts(page).nth(5).click();
    await page.getByRole("button", { name: "Transfer out" }).click();
    await expect(page.getByText(/^Add a /)).toBeAttached();   // the list's heading only shows on phones
    if (isPhone(page)) await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(stats(page)).toContainText("14 / 15");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(stats(page)).toContainText("15 / 15");
    if (isPhone(page)) await page.getByRole("button", { name: "Player list" }).click();
    await expect(page.getByText(/^\d+ players?$/)).not.toHaveText("0 players");
    if (isPhone(page)) await page.getByRole("button", { name: "Done", exact: true }).click();
  });

  await test.step("a substitution can be cancelled", async () => {
    await shirts(page).nth(6).click();
    await page.getByRole("button", { name: "Substitute" }).click();
    await expect(page.getByText("Tap the player to swap with.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Tap the player to swap with.")).toHaveCount(0);
  });

  await test.step("each squad tab opens", async () => {
    for (const [tab, text] of [["Points", "hasn't scored yet"], ["Fixtures", "Gameweek"], ["Table", "Season table"], ["Team news", /news|injur/i]] as const) {
      await page.getByRole("main").getByText(tab, { exact: true }).first().click();
      await expect(page.locator("main")).toContainText(text);
    }
  });

  await test.step("the league page shows it ready, and it can be renamed and deleted", async () => {
    await page.goto("/la-liga");
    await expect(page.getByText("Ready for this gameweek")).toBeVisible();
    await page.getByRole("button", { name: /^Rename / }).click();
    await page.getByLabel("Squad name").fill("E2E XI");
    await page.getByLabel("Squad name").press("Enter");
    await expect(page.getByText("E2E XI")).toBeVisible();
    await page.getByRole("button", { name: "Delete E2E XI" }).click();
    await expect(page.getByText("E2E XI")).toHaveCount(0);
  });

  await test.step("signing out returns to the sign-in prompt", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("header").getByText(/…/).click();
    await page.getByText("Disconnect", { exact: true }).click();
    await expect(page.getByText("Sign in to build your squad")).toBeVisible();
  });
});
