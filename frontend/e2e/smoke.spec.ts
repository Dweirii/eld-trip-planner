import { expect, test } from "@playwright/test";
import trip from "../lib/api/__fixtures__/trip-multi-day.json";

test.beforeEach(async ({ page }) => {
  // No network in tests: stub the API in the browser and skip map tiles.
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
  await page.route("**/api/health/", (route) => route.fulfill({ json: { status: "ok", engine_version: "1.0.0" } }));
  await page.route("**/api/trips/", (route) => route.fulfill({ status: 201, json: trip }));
  // Not a first visit: the tour invitation's bubble has been dismissed, so it never sits over the map.
  await page.addInitScript(() => window.localStorage.setItem("milepost:tour-invite-dismissed", "1"));
});

test("an example trip produces the itinerary, rule checks and daily logs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Plan a trip" })).toBeVisible();

  await page.getByRole("button", { name: /Multi-day/ }).click();

  await expect(page.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
  const itinerary = page.getByRole("list", { name: "Itinerary" });
  await expect(itinerary.getByRole("button", { name: /10-h rest · Jasper, AR/ })).toBeVisible();

  await page.getByRole("tab", { name: "Directions" }).click();
  await expect(page.getByRole("heading", { name: /^Leg 1 · / })).toBeVisible();

  await page.getByRole("tab", { name: /Rules 7\/7/ }).click();
  await expect(page.getByText("11-hour driving limit")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Daily logs" })).toBeVisible();
  await expect(page.getByRole("article", { name: /Driver's daily log for 2026-10-01/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Driver's daily log for 2026-10-02/ })).toBeHidden();

  // Trip replay: the home-terminal clock moves once the trip plays.
  await page.getByRole("button", { name: "Play trip" }).click();
  const replay = page.getByRole("group", { name: "Trip replay" });
  await expect(replay.getByRole("button", { name: "Pause trip" })).toBeVisible();
  const clock = replay.getByText(/^(Thu|Fri), Oct \d · \d\d:\d\d CDT$/);
  const initial = await clock.textContent();
  await page.waitForTimeout(1500);
  await expect(clock).not.toHaveText(initial ?? "");
});
