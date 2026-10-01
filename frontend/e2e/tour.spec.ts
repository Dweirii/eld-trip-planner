import { expect, test } from "@playwright/test";
import trip from "../lib/api/__fixtures__/trip-multi-day.json";

test.beforeEach(async ({ page }) => {
  // No network in tests: stub the API in the browser and skip map tiles.
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
  await page.route("**/api/health/", (route) => route.fulfill({ json: { status: "ok", engine_version: "1.0.0" } }));
  await page.route("**/api/trips/", (route) => route.fulfill({ status: 201, json: trip }));
});

test("the guided tour types the trip, plans it and walks through the results", async ({ page }) => {
  // ?tourSpeed= is a test-only speed-up (1–20) for the tour's own waits.
  await page.goto("/?tour=1&tourSpeed=4");
  const tour = page.getByRole("region", { name: "Guided tour" });
  await expect(tour).toContainText("Milepost plans a truck trip under FMCSA Hours-of-Service rules");
  await expect(page).toHaveURL(/localhost:\d+\/$/); // the param is gone, so a reload doesn't restart it

  await expect(page.getByRole("combobox", { name: "Current location" })).toHaveValue("Chicago, IL");

  const results = tour.getByText(/^972 miles and 2 log days/);
  for (let press = 0; press < 12 && !(await results.isVisible()); press++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
  }
  await expect(results).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(page.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeVisible();
});

test("the top bar starts the tour", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Take the tour" }).click();
  const tour = page.getByRole("region", { name: "Guided tour" });
  await expect(tour).toContainText("1 / 16");
  await page.getByRole("button", { name: "Exit tour" }).click();
  await expect(tour).toBeHidden();
});
