import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { readFile } from "node:fs/promises";

test.use({
  baseURL: process.env.SAMPLE_TEST_URL || "http://127.0.0.1:3188",
  serviceWorkers: "block",
});
test("physical samples, later labels and editable actual dates work on desktop and phone", async ({
  page,
}, info) => {
  test.skip(
    !process.env.SAMPLE_TEST_URL,
    "Run scripts/test-sample-workflow.mjs with an isolated database.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const categories = await (await page.request.get("/api/categories")).json();
  const vendors = await (await page.request.get("/api/vendors")).json();
  const created = await page.request.post("/api/parts", {
    data: {
      partName: `Paint ${info.project.name}`,
      vendorId: vendors[0].id,
      categoryId: categories[0].id,
      sampleCount: 1,
      receivedOn: "2026-06-01",
    },
  });
  expect(created.status()).toBe(201);
  const part = await created.json();
  for (let i = 2; i <= 4; i++)
    expect(
      (
        await page.request.post(`/api/parts/${part.id}/revisions`, {
          data: {
            changeNote: `Reformulation ${i}`,
            effectiveOn: `2026-0${i}-10`,
          },
        })
      ).status(),
    ).toBe(201);
  await page.goto(`/parts/${part.partNumber}`);
  await expect(page.locator(".current-version")).toContainText("V4");
  const old = page.getByRole("article", { name: "Sample 1", exact: true });
  await expect(old).toContainText("Jun 1, 2026");
  await expect(old.locator("xpath=../..")).toContainText("V1");
  await page.getByRole("button", { name: "Add samples", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("How many more samples?").fill("2");
  await expect(dialog).toContainText("1 existing + 2 new = 3 samples");
  await dialog.getByLabel("Received on", { exact: false }).fill("2026-08-15");
  await dialog.getByLabel("Details / notes").fill("Q14 · batch A");
  await dialog
    .getByRole("button", { name: "Add samples", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(
    page.getByRole("article", { name: "Sample 2", exact: true }),
  ).toContainText("Aug 15, 2026");
  await page.getByRole("button", { name: "Add samples", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Version", exact: true })
    .selectOption("3");
  await dialog.getByLabel("How many more samples?").fill("17");
  await dialog.getByLabel("Received on", { exact: false }).fill("2026-07-14");
  await dialog
    .getByRole("button", { name: "Add samples", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(20);
  await expect(page.locator(".current-version")).toContainText("V4");
  await page
    .getByRole("article", { name: "Sample 2", exact: true })
    .getByRole("button", { name: "Edit details" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Received on", { exact: false }).fill("2026-05-03");
  await dialog
    .getByRole("combobox", { name: "Version", exact: true })
    .selectOption("3");
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("PASSED");
  await dialog.getByLabel("Details / notes").fill("Q14 · corrected version");
  await page.screenshot({
    path: `test-results/${info.project.name}-edit-sample.png`,
  });
  await dialog.getByRole("button", { name: "Save sample" }).click();
  const sample2 = page.getByRole("article", { name: "Sample 2", exact: true });
  await expect(sample2).toContainText("May 3, 2026");
  await expect(sample2).toContainText("Passed");
  await expect(sample2.locator("xpath=../..")).toContainText("V3");
  await sample2.getByRole("link", { name: "Print label", exact: true }).click();
  await expect(page.locator(".physical-label")).toContainText("V3 · Sample 2");
  await expect(page.locator(".physical-label")).toContainText(
    `${part.partNumber}-S2`,
  );
  await expect(page.locator(".physical-label img")).toHaveJSProperty(
    "complete",
    true,
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-sample-label.png`,
  });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download label PNG" }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe(`${part.partNumber}-S2-label.png`);
  const png = PNG.sync.read(await readFile((await download.path())!));
  expect(png.height).toBeGreaterThan(600);
  expect(
    jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
  ).toBe(`${part.partNumber}-S2`);
  await expect(page.getByText("Label recorded as exported.")).toBeVisible();
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("Scanned Sample 2 · V3", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".current-version")).toContainText("V4");
  await page.getByRole("link", { name: "Go to this sample" }).click();
  await expect(sample2).toBeInViewport();
  await expect(sample2).toHaveClass(/scanned-sample/);
  await page.screenshot({
    path: `test-results/${info.project.name}-sample-tree.png`,
  });
  const fetched = await (
    await page.request.get(`/api/parts/${part.partNumber}`)
  ).json();
  const savedSample = fetched.samples.find(
    (s: { sampleNumber: number }) => s.sampleNumber === 2,
  );
  expect(savedSample.labelPrinted).toBe(true);
  expect(savedSample.receivedOn.slice(0, 10)).toBe("2026-05-03");
  await page.request.post("/api/export/printed", { data: { ids: [part.id] } });
  const waiting = await (
    await page.request.get(`/api/parts?q=${part.partNumber}&unprinted=true`)
  ).json();
  expect(waiting.parts.map((p: { id: string }) => p.id)).toContain(part.id);
  const v3 = fetched.revisions.find(
    (r: { revisionNum: number }) => r.revisionNum === 3,
  );
  await page.getByLabel("Find a version").fill("V3");
  await page.getByRole("button", { name: "Edit date", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Revision date", { exact: false }).fill("2025-12-20");
  await dialog.getByRole("button", { name: "Save date" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await (
    await page.request.get(`/api/parts/${part.partNumber}`)
  ).json();
  const editedRevision = after.revisions.find(
    (r: { revisionNum: number }) => r.revisionNum === 3,
  );
  expect(editedRevision.effectiveOn.slice(0, 10)).toBe("2025-12-20");
  expect(editedRevision.createdAt).toBe(v3.createdAt);
  expect(after.changes[0].action).toContain("revision date");
  await page.getByRole("link", { name: "Print V3 label" }).click();
  await expect(page.locator(".physical-label")).toContainText("Version 3");
  const qr = PNG.sync.read(
    await (
      await page.request.get(`/api/parts/${part.partNumber}-V3/qr`)
    ).body(),
  );
  expect(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data).toBe(
    `${part.partNumber}-V3`,
  );
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("Scanned V3 label", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".current-version")).toContainText("V4");
  // API refuses invalid historical dates and stale edits rather than overwriting.
  expect(
    (
      await page.request.patch(`/api/revisions/${v3.id}`, {
        data: {
          effectiveOn: "2026-02-30",
          updatedAt: editedRevision.updatedAt,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch(`/api/revisions/${v3.id}`, {
        data: { effectiveOn: "2026-01-01", updatedAt: v3.updatedAt },
      })
    ).status(),
  ).toBe(409);
  await page.goto("/labels");
  await page.getByLabel("Search parts", { exact: true }).fill(part.partNumber);
  await expect(
    page.getByRole("link", { name: "19 sample labels waiting" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "19 sample labels waiting" }).click();
  await expect(
    page.getByRole("heading", { name: "Physical samples 20 total" }),
  ).toBeInViewport();
  await page.getByLabel("Find a sample").fill("2");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toHaveAccessibleName("Sample 2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
