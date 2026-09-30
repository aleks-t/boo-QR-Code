import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createPart, findPart, logRevision, voidRevision } from "../lib/parts";
import {
  receiveDelivery,
  updateSample,
  markSamplePrinted,
} from "../lib/samples";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
const isolated =
  url.hostname === "127.0.0.1" && url.pathname === "/partbook_samples_test";

test(
  "sample identity survives revisions, backdating, edits, retries and concurrent additions",
  {
    skip: isolated
      ? false
      : "Run scripts/test-sample-workflow.mjs with its isolated database.",
  },
  async () => {
    const vendor = await db.vendor.create({
      data: { code: "TST", name: "Sample test vendor" },
    });
    const category = await db.category.create({
      data: { code: "INT", name: "Interior" },
    });
    const user = await db.user.create({ data: { name: "Sample tests" } });
    const part = await createPart(
      {
        partName: "Test paint",
        vendorId: vendor.id,
        categoryId: category.id,
        receivedOn: "2026-06-01",
      },
      user,
    );
    assert.equal(part.samples[0].revisionNum, 1);
    assert.equal(
      part.samples[0].receivedOn?.toISOString().slice(0, 10),
      "2026-06-01",
    );
    await logRevision(part.id, "V2", user, "2026-07-01");
    await logRevision(part.id, "V3", user, "2026-08-01");
    const r4 = await logRevision(part.id, "V4", user, "2026-09-01");
    const input = {
      requestId: randomUUID(),
      receivedOn: "2026-06-20",
      lines: [{ partId: part.id, revisionNum: 4, count: 2, note: "Shelf Q14" }],
    };
    const [a, b] = await Promise.all([
      receiveDelivery(input, user),
      receiveDelivery(input, user),
    ]);
    assert.deepEqual(a, b);
    assert.deepEqual(
      a.samples.map((s) => s.sampleNumber),
      [2, 3],
    );
    assert.equal(await db.sample.count({ where: { partId: part.id } }), 3);
    await assert.rejects(
      receiveDelivery({ ...input, receivedOn: "2026-08-01" }, user),
      /already saved/,
    );
    const scanned = await findPart(`${part.partNumber}-S2`);
    assert.equal(scanned.scannedSampleId, a.samples[0].id);
    assert.equal(scanned.current?.revisionNum, 4);
    assert.equal(
      (await findPart(`${part.partNumber}-V3`)).scannedRevisionNum,
      3,
    );
    await assert.rejects(findPart(`${part.partNumber}-S999`), /No sample/);
    const sample = scanned.samples.find(
      (s) => s.id === scanned.scannedSampleId,
    )!;
    const printed = await markSamplePrinted(
      sample.id,
      sample.updatedAt.toISOString(),
    );
    assert.equal(printed.labelPrinted, true);
    const edited = await updateSample(
      sample.id,
      {
        updatedAt: printed.updatedAt.toISOString(),
        revisionNum: 3,
        receivedOn: "2026-05-03",
        note: "Corrected version",
        status: "PASSED",
      },
      user,
    );
    assert.equal(
      edited.createdAt.toISOString(),
      sample.createdAt.toISOString(),
    );
    assert.equal(edited.labelPrinted, false);
    assert.equal(edited.events[0].revisionNum, 3);
    assert.ok(edited.events[0].details);
    assert.equal(
      (await findPart(`${part.partNumber}-S2`)).scannedSampleId,
      sample.id,
    );
    await assert.rejects(
      updateSample(
        sample.id,
        { updatedAt: sample.updatedAt.toISOString(), note: "Stale overwrite" },
        user,
      ),
      /changed in another/,
    );
    await voidRevision(r4.revision.id, "Mistake", user.id);
    assert.equal(
      (await findPart(`${part.partNumber}-S3`)).samples.find(
        (s) => s.sampleNumber === 3,
      )?.revisionNum,
      4,
    );
    await assert.rejects(
      receiveDelivery({ ...input, requestId: randomUUID() }, user),
      /non-voided/,
    );
    const fresh = (version: number) => ({
      requestId: randomUUID(),
      receivedOn: "2026-01-01",
      lines: [{ partId: part.id, revisionNum: version, count: 1 }],
    });
    const concurrent = await Promise.all([
      receiveDelivery(fresh(1), user),
      receiveDelivery(fresh(3), user),
    ]);
    assert.equal(
      new Set(concurrent.map((r) => r.samples[0].sampleNumber)).size,
      2,
    );
    const before = await db.sample.count({ where: { partId: part.id } });
    await assert.rejects(
      receiveDelivery(
        {
          requestId: randomUUID(),
          receivedOn: "2026-02-01",
          lines: [
            { partId: part.id, revisionNum: 1, count: 2 },
            { partId: part.id, revisionNum: 999, count: 1 },
          ],
        },
        user,
      ),
    );
    assert.equal(await db.sample.count({ where: { partId: part.id } }), before);
    await db.part.update({
      where: { id: part.id },
      data: { archivedAt: new Date() },
    });
    await assert.rejects(
      updateSample(
        sample.id,
        { updatedAt: edited.updatedAt.toISOString(), note: "Blocked" },
        user,
      ),
      /Restore/,
    );
    await assert.rejects(receiveDelivery(fresh(1), user), /Trash/);
  },
);
after(() => db.$disconnect());
