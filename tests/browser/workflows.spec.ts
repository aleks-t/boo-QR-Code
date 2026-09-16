import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { PNG } from "pngjs";
import jsQR from "jsqr";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Browser verification");
  await page.getByLabel("Access code").fill("workshop-local");
  await page.getByRole("button", { name: "Enter workshop" }).click();
  await expect(
    page.getByRole("heading", { name: "Know the part. Know what changed." }),
  ).toBeVisible();
});
test("new part → revision → undo → edit → delete → restore → export", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({
    path: `test-results/${info.project.name}-home.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/new");
  await page.getByRole("button", { name: "Vendor", exact: true }).click();
  await page.getByRole("textbox", { name: "Search vendor" }).fill("Acme");
  await page.getByRole("option", { name: /Acme Manufacturing/ }).click();
  const name = `Browser fixture ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Part name").fill(name);
  await page.getByRole("button", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: /Brackets/ }).click();
  await page.getByRole("button", { name: "Create part", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Created: ACM-/ }),
  ).toBeVisible();
  const number = page.url().split("/parts/")[1].split("/")[0];
  const initial = await (await page.request.get(`/api/parts/${number}`)).json();
  expect(initial.current.revisionNum).toBe(1);
  expect(initial.labelPrinted).toBe(false);
  const png = PNG.sync.read(
    await (await page.request.get(`/api/parts/${number}/qr`)).body(),
  );
  expect(
    jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
  ).toBe(number);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.getByRole("link", { name: "Log new revision" }).click();
  await expect(
    page.getByRole("heading", { name: `Log version 2 of ${name}?` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log version 2", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("What changed?").fill("Improved mounting clearance.");
  await page
    .getByRole("button", { name: "Log version 2", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${name} is now on version 2.` }),
  ).toBeVisible();
  await expect(
    page.getByText("The existing label is still correct. No reprint needed."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `${name} is back on version 1.` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View part", exact: true }).click();
  await page.getByRole("link", { name: "Log new revision" }).click();
  await expect(
    page.getByRole("heading", { name: `Log version 3 of ${name}?` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Part name")
    .fill(name + " edited");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: name + " edited", exact: true }),
  ).toBeVisible();
  await page.getByText("Edit history", { exact: false }).first().click();
  await page
    .getByRole("button", { name: "Restore previous details", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore previous details", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goto("/inventory");
  await page.getByRole("textbox", { name: "Search parts" }).fill(number);
  await expect(
    page.getByRole("link", { name: new RegExp(name) }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-inventory.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: `Delete ${name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(
    page.getByText(`${name} moved to Trash. Restore it there at any time.`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByText(`${name} is back in your inventory.`),
  ).toBeVisible();
  const restored = await (
    await page.request.get(`/api/parts/${number}-V29`)
  ).json();
  expect(restored.id).toBe(initial.id);
  expect(restored.revisions.length).toBe(2);
  expect(restored.nextRevision).toBe(3);
  expect(restored.labelPrinted).toBe(false);
  // Conflicting sheet updates cannot silently overwrite each other.
  const edit = {
    partName: name,
    vendorId: restored.vendorId,
    categoryId: restored.categoryId,
    updatedAt: restored.updatedAt,
  };
  const updates = await Promise.all([
    page.request.patch(`/api/parts/${initial.id}`, { data: edit }),
    page.request.patch(`/api/parts/${initial.id}`, {
      data: { ...edit, partName: name + " concurrent" },
    }),
  ]);
  expect(updates.map((r) => r.status()).sort()).toEqual([200, 409]);
  await page.goto("/labels");
  await page.getByRole("textbox", { name: "Search parts" }).fill(number);
  await expect(
    page.getByRole("checkbox", { name: /Select Browser fixture/ }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Select Browser fixture/ }).check();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download CSV for Print Master" })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "partbook-labels.csv",
  );
  const csv = await page.request.post("/api/export/csv", {
    data: { ids: [initial.id] },
  });
  expect(await csv.text()).toContain(
    '"Part Number","Part Name","Vendor","Category"',
  );
  expect(await csv.text()).toContain(number);
  expect(await csv.text()).not.toContain(number + "-V");
  const zip = await JSZip.loadAsync(
    await (
      await page.request.post("/api/export/qr", { data: { ids: [initial.id] } })
    ).body(),
  );
  expect(Object.keys(zip.files)).toEqual([number + ".png"]);
  expect(
    (await (await page.request.get(`/api/parts/${number}`)).json())
      .labelPrinted,
  ).toBe(true);
  // Move the temporary fixture to Trash, without touching sample data.
  const final = await (await page.request.get(`/api/parts/${number}`)).json();
  await page.request.post(`/api/parts/${final.id}/archive`, {
    data: { updatedAt: final.updatedAt },
  });
  expect(errors).toEqual([]);
});
test("unknown codes and phone layout stay usable", async ({ page }, info) => {
  await page.goto("/parts/ZZZ-9999-V3");
  await expect(
    page.getByRole("heading", { name: /No part matches/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a new part" }),
  ).toBeVisible();
  await page.goto("/parts/ACM-0001");
  await expect(
    page.getByRole("heading", { name: "Mounting bracket", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-detail.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Your settings." }),
  ).toBeVisible();
  await expect(
    page.getByText("Email delivery is not configured yet.", { exact: false }),
  ).toBeVisible();
});
test("API protects writes and preserves identifiers through vendor merge", async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "Server behavior is the same at every viewport.",
  );
  const anonymous = await browser.newContext();
  expect(
    (await anonymous.request.get("http://localhost:3000/api/parts")).status(),
  ).toBe(401);
  await anonymous.close();
  expect(
    (
      await page.request.post("/api/categories", {
        headers: { Origin: "https://another-site.example" },
        data: { name: "Blocked" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/parts", {
        data: { partNumber: "FAKE-0001" },
      })
    ).status(),
  ).toBe(400);
  const code =
    "Q" +
    Array.from({ length: 3 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("");
  const vendor = await (
    await page.request.post("/api/vendors", {
      data: { code, name: "Browser merge fixture" },
    })
  ).json();
  expect(vendor.approved).toBe(false);
  const vendors = await (await page.request.get("/api/vendors")).json();
  const target = vendors.find((v: { code: string }) => v.code === "ACM");
  const categories = await (await page.request.get("/api/categories")).json();
  const part = await (
    await page.request.post("/api/parts", {
      data: {
        vendorId: vendor.id,
        categoryId: categories[0].id,
        partName: "Merge verification fixture",
      },
    })
  ).json();
  expect(part.partNumber).toBe(code + "-0001");
  const revisions = await Promise.all([
    page.request.post(`/api/parts/${part.id}/revisions`, {
      data: { changeNote: "Concurrent API A" },
    }),
    page.request.post(`/api/parts/${part.id}/revisions`, {
      data: { changeNote: "Concurrent API B" },
    }),
  ]);
  expect(revisions.map((r) => r.status())).toEqual([201, 201]);
  expect(
    (await Promise.all(revisions.map((r) => r.json())))
      .map((r) => r.revision.revisionNum)
      .sort(),
  ).toEqual([2, 3]);
  expect(
    (
      await page.request.post(`/api/vendors/${vendor.id}/merge`, {
        data: { targetId: target.id },
      })
    ).status(),
  ).toBe(200);
  const merged = await (
    await page.request.get(`/api/parts/${part.partNumber}`)
  ).json();
  expect(merged.vendorId).toBe(target.id);
  expect(merged.partNumber).toBe(part.partNumber);
  expect(merged.revisions.length).toBe(3);
  const duplicate = await (
    await page.request.post("/api/vendors", {
      data: { code, name: "Recreated historical prefix" },
    })
  ).json();
  const second = await (
    await page.request.post("/api/parts", {
      data: {
        vendorId: duplicate.id,
        categoryId: categories[0].id,
        partName: "Historical prefix fixture",
      },
    })
  ).json();
  expect(second.partNumber).toBe(code + "-0002");
  await page.request.post(`/api/vendors/${duplicate.id}/merge`, {
    data: { targetId: target.id },
  });
  for (const number of [part.partNumber, second.partNumber]) {
    const p = await (await page.request.get(`/api/parts/${number}`)).json();
    await page.request.post(`/api/parts/${p.id}/archive`, {
      data: { updatedAt: p.updatedAt },
    });
  }
});
