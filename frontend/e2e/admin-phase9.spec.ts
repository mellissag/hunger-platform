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

test.describe("Admin phase 9", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!creds()) {
      testInfo.skip();
      return;
    }
    await login(page);
  });

  test("login leads to dashboard with KPI cards", async ({ page }) => {
    await expect(page.getByTestId("dashboard-kpi-today-bookings")).toBeVisible();
    await expect(page.getByTestId("dashboard-kpi-today-revenue")).toBeVisible();
  });

  test("clients: create client and add note", async ({ page }) => {
    const phone = `+1000${Date.now().toString().slice(-7)}`;
    await page.goto("/clients");
    await page.getByTestId("client-create-open").click();
    await page.getByLabel(/phone/i).fill(phone);
    await page.getByLabel(/first name|ім'я|име/i).fill("E2E");
    await page.getByTestId("client-create-submit").click();
    await expect(page.getByRole("link", { name: new RegExp(phone) })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: new RegExp(phone) }).click();
    await page.getByTestId("client-add-note").click();
    await page.getByTestId("client-note-input").fill("E2E allergy note");
    await page.getByTestId("client-note-save").click();
    await expect(page.getByTestId("client-note").filter({ hasText: "E2E allergy note" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("masters: schedule block form submits", async ({ page }) => {
    await page.goto("/masters");
    await page.getByRole("link", { name: /open|открыть|відкрити|отвори/i }).first().click();
    await page.getByRole("tab", { name: /schedule|расписание|розклад|график/i }).click();
    const tomorrow = new Date(Date.now() + 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:00`;
    const localEnd = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T12:00`;
    await page.locator("#starts").fill(local);
    await page.locator("#ends").fill(localEnd);
    await page.getByTestId("schedule-block-submit").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
  });

  test("bookings: create and see on calendar", async ({ page }) => {
    await page.goto("/bookings");
    await page.getByTestId("booking-create-open").click();
    await page.locator("#client_id").selectOption({ index: 1 });
    await page.locator("#master_id").selectOption({ index: 1 });
    await page.locator("#service_id").selectOption({ index: 1 });
    const t = new Date(Date.now() + 48 * 3600000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T15:00`;
    await page.locator("#starts_at_local").fill(local);
    await page.getByTestId("booking-create-submit").click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("booking-calendar")).toBeVisible();
  });
});
