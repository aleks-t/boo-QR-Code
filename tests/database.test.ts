if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL || "postgresql://invalid").hostname,
  )
)
  throw new Error("These tests require an isolated local PostgreSQL database.");
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { createPart, logRevision, voidRevision, findPart } from "../lib/parts";
import { randomBytes } from "node:crypto";
const suffix = () =>
  Array.from(randomBytes(3), (b) => String.fromCharCode(65 + (b % 26))).join(
    "",
  );
test("PostgreSQL: concurrent assignment, void gaps, label stability, historical prefixes, transactional rollback", async () => {
  const vendor = await db.vendor.create({
    data: { code: "Z" + suffix(), name: "Test isolated vendor" },
  });
  const replacement = await db.vendor.create({
    data: { code: "Z" + suffix(), name: "Replacement test vendor" },
  });
  const category = await db.category.create({
    data: { code: `TEST-${Date.now()}`, name: "Test isolated category" },
  });
  const user = await db.user.create({
      data: { name: "Automated verification" },
    }),
    other = await db.user.create({ data: { name: "Notification recipient" } });
  let ids: string[] = [];
  try {
    const input = {
      partName: "Concurrency fixture",
      vendorId: vendor.id,
      categoryId: category.id,
    };
    const [a, b] = await Promise.all([
      createPart(input, user),
      createPart({ ...input, partName: "Second fixture" }, user),
    ]);
    ids = [a.id, b.id];
    assert.notEqual(a.partNumber, b.partNumber);
    assert.deepEqual([a.sequence, b.sequence].sort(), [1, 2]);
    await db.part.update({ where: { id: a.id }, data: { labelPrinted: true } });
    const [r1, r2] = await Promise.all([
      logRevision(a.id, "Simultaneous change A", user),
      logRevision(a.id, "Simultaneous change B", user),
    ]);
    assert.deepEqual(
      [r1.revision.revisionNum, r2.revision.revisionNum].sort(),
      [2, 3],
    );
    const latest = [r1, r2].find((r) => r.revision.revisionNum === 3)!;
    const voided = await voidRevision(
      latest.revision.id,
      "Test correction",
      user.id,
    );
    assert.equal(voided.current?.revisionNum, 2);
    const next = await logRevision(a.id, "After void", user);
    assert.equal(next.revision.revisionNum, 4);
    const part = await findPart(`${a.partNumber}-V99`);
    assert.equal(part.current?.revisionNum, 4);
    assert.equal(part.labelPrinted, true);
    assert.equal(part.revisions.length, 4);
    assert.equal(
      await db.notification.count({
        where: { revisionId: next.revision.id, userId: user.id },
      }),
      0,
    );
    assert.equal(
      await db.notification.count({
        where: { revisionId: next.revision.id, userId: other.id },
      }),
      1,
    );
    await assert.rejects(() =>
      voidRevision(next.revision.id, "Wrong actor", other.id, true),
    );
    await db.part.updateMany({
      where: { id: { in: ids } },
      data: { vendorId: replacement.id },
    });
    const c = await createPart(input, user);
    ids.push(c.id);
    assert.equal(c.sequence, 3);
    const before = await db.part.count({
      where: { partNumber: { startsWith: vendor.code + "-" } },
    });
    await assert.rejects(() =>
      createPart({ ...input, categoryId: "missing-category" }, user),
    );
    assert.equal(
      await db.part.count({
        where: { partNumber: { startsWith: vendor.code + "-" } },
      }),
      before,
    );
    await db.part.update({
      where: { id: a.id },
      data: { archivedAt: new Date() },
    });
    await assert.rejects(() => logRevision(a.id, "Archived", user));
  } finally {
    const revisions = await db.revision.findMany({
      where: { partId: { in: ids } },
      select: { id: true },
    });
    await db.notification.deleteMany({
      where: { revisionId: { in: revisions.map((r) => r.id) } },
    });
    await db.partChange.deleteMany({ where: { partId: { in: ids } } });
    await db.revision.deleteMany({ where: { partId: { in: ids } } });
    await db.part.deleteMany({ where: { id: { in: ids } } });
    await db.vendor.deleteMany({
      where: { id: { in: [vendor.id, replacement.id] } },
    });
    await db.category.delete({ where: { id: category.id } });
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  }
});
after(() => db.$disconnect());
