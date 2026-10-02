import { expect, test } from "@playwright/test";
import trip from "../lib/api/__fixtures__/trip-multi-day.json";

test.beforeEach(async ({ page }) => {
  // No network in tests: stub the API in the browser and skip map tiles.
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
  // And no sound: a clip that can't be fetched is skipped, and the tour keeps its own pace.
  await page.route("**/tour/voice/**", (route) => route.abort());
  await page.route("**/api/health/", (route) => route.fulfill({ json: { status: "ok", engine_version: "1.0.0" } }));
  await page.route("**/api/trips/", (route) => route.fulfill({ status: 201, json: trip }));
});

test("the guided tour types the trip, plans it and walks through the results", async ({ page }) => {
  const clips: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/tour/voice/")) clips.push(request.url());
  });
  // ?tourSpeed= is a test-only speed-up (1–20) for the tour's own waits; sped up, the voice is off.
  await page.goto("/?tour=1&tourSpeed=4");
  const tour = page.getByRole("region", { name: "Guided tour" });
  await expect(tour).toContainText("Milepost plans a truck trip under FMCSA Hours-of-Service rules");
  await expect(page).toHaveURL(/localhost:\d+\/$/); // the param is gone, so a reload doesn't restart it
  await expect(tour.getByRole("button", { name: "Turn voice on" })).toBeVisible();

  await expect(page.getByRole("combobox", { name: "Current location" })).toHaveValue("Chicago, IL");

  // Next, step by step, until the results caption: the tour plans the trip itself on the way.
  await expect
    .poll(
      async () => {
        const text = (await tour.textContent()) ?? "";
        if (/972 miles and 2 log days/.test(text)) return "results";
        if (!text.includes("Routing a heavy truck")) await page.keyboard.press("ArrowRight");
        return text;
      },
      { intervals: [400], timeout: 20_000 },
    )
    .toBe("results");
  await expect(page.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(page.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeVisible();
  expect(clips).toEqual([]);
});

test("the top bar starts the tour", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Take the tour" }).click();
  const tour = page.getByRole("region", { name: "Guided tour" });
  await expect(tour).toContainText("1 / 16");
  // At its real pace the tour speaks, and V mutes it.
  await expect(tour.getByRole("button", { name: "Turn voice off" })).toBeVisible();
  await page.keyboard.press("v");
  await expect(tour.getByRole("button", { name: "Turn voice on" })).toBeVisible();
  await page.getByRole("button", { name: "Exit tour" }).click();
  await expect(tour).toBeHidden();
});
