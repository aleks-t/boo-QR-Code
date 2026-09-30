import { test, expect } from "@playwright/test";

// All API requests are intercepted: these tests never read or write inventory.
test.use({
  baseURL: process.env.REVISION_TEST_URL || "http://localhost:3187",
  serviceWorkers: "block",
});

test("latest revision and 100 searchable versions stay visible", async ({
  page,
}, info) => {
  const revisions = Array.from({ length: 100 }, (_, i) => ({
    id: `revision-${100 - i}`,
    revisionNum: 100 - i,
    changeNote:
      i === 96 ? "Reformulated paint" : `Change for version ${100 - i}`,
    loggedBy: "Owner",
    createdAt: "2026-09-29T12:00:00.000Z",
    voided: i === 1,
    voidReason: i === 1 ? "Duplicate entry" : null,
  }));
  const vendor = {
    id: "vendor",
    code: "SRG",
    name: "SRG GLOBAL",
    approved: true,
  };
  const category = { id: "category", code: "INT", name: "Interior" };
  const part = {
    id: "part",
    partNumber: "SRG-0001",
    partName: "Trim Panel sub-asm reformulated paint",
    vendorId: vendor.id,
    categoryId: category.id,
    vendor,
    category,
    sequence: 1,
    labelPrinted: false,
    archivedAt: null,
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
    samples: [],
    changes: [],
    revisions,
    current: revisions[0],
    displayId: "SRG-0001-V100",
    nextRevision: 101,
  };
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.url());
    const path = new URL(request.url()).pathname;
    const json =
      path === "/api/session"
        ? {
            user: { id: "owner", name: "Owner", email: null, hasPush: false },
            vapidPublicKey: null,
            emailConfigured: false,
          }
        : path === "/api/vendors"
          ? [vendor]
          : path === "/api/categories"
            ? [category]
            : path === "/api/stats"
              ? { parts: 1, labels: 1, pending: 0, changes: 100 }
              : path === "/api/parts"
                ? { parts: [part], total: 1, pages: 1 }
                : path.startsWith("/api/parts/")
                  ? part
                  : {};
    await route.fulfill({ json });
  });
  await page.goto("/labels");
  await expect(page.locator(".version-badge")).toHaveText("V100");
  await page.getByRole("link", { name: "100 versions", exact: true }).click();
  const history = page.getByRole("region", {
    name: "All revisions, newest first",
  });
  await expect(history).toBeInViewport();
  await expect(history.locator(".history-entry")).toHaveCount(100);
  expect(
    await history.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await history.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(history.locator(".history-entry").last()).toBeInViewport();
  await expect(history.locator(".history-entry").last()).toContainText("V1");
  await page.getByLabel("Find a version").fill("V4");
  await expect(history.locator(".history-entry")).toHaveCount(1);
  await expect(history).toContainText("Reformulated paint");
  await expect(history.locator(".history-entry")).toBeInViewport();
  await page.getByLabel("Find a version").fill("duplicate entry");
  await expect(history).toContainText("V99");
  await expect(history).toContainText("Voided: Duplicate entry");
  await page.getByLabel("Find a version").fill("does not exist");
  await expect(history).toContainText("No matching versions");
  await page.getByLabel("Find a version").fill("");
  await expect(history.locator(".history-entry")).toHaveCount(100);
  await page.goto("/parts/SRG-0001-V4");
  await expect(page.locator(".current-version")).toContainText("V100");
  await expect(
    page.getByRole("link", { name: "View all 100 versions" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "mobile") {
    await page.locator(".detail-actions").scrollIntoViewIfNeeded();
    const actions = await page.locator(".detail-actions").boundingBox();
    const nav = await page.locator(".mobile-bottom").boundingBox();
    expect(actions!.y + actions!.height).toBeLessThanOrEqual(nav!.y);
  }
  await page.getByRole("link", { name: "View all 100 versions" }).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-revision-history.png`,
  });
  expect(writes).toEqual([]);
});
