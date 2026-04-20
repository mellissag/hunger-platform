import { expect, test } from "@playwright/test";

function creds(): { email: string; password: string } | null {
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

async function login(page: import("@playwright/test").Page) {
  const c = creds();
  if (!c) throw new Error("E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD must be set");
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(c.email);
  await page.getByLabel(/password/i).fill(c.password);
  await page.getByRole("button", { name: /sign in|войти|увійти|вход/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("Settings phase 12", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!creds()) {
      testInfo.skip();
      return;
    }
    await login(page);
  });

  test("localization: currency change persists after reload", async ({ page }) => {
    await page.goto("/settings/localization");
    const sel = page.getByTestId("settings-currency");
    await sel.selectOption("USD");
    await page.getByTestId("settings-localization-save").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(sel).toHaveValue("USD");
    await sel.selectOption("EUR");
    await page.getByTestId("settings-localization-save").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
  });

  test("brand: primary color save", async ({ page }) => {
    await page.goto("/settings/brand");
    await page.getByTestId("settings-primary-color").fill("#3366cc");
    await page.getByTestId("settings-primary-save").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
  });

  test("prepayment toggle", async ({ page }) => {
    await page.goto("/settings/prepayment");
    await page.getByTestId("settings-prepayment-enabled").click();
    await page.getByTestId("settings-prepayment-save").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
  });
});
