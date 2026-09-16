if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL || "postgresql://invalid").hostname,
  )
)
  throw new Error("These tests require an isolated local PostgreSQL database.");
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { deliverNotifications, Delivery } from "../lib/notifications";
test("delivery prefers push, falls back to email, removes expired subscriptions, and retains failures", async () => {
  const users = await Promise.all([
    db.user.create({
      data: {
        name: "Notify test push",
        pushSub: "{}",
        email: "push@example.com",
      },
    }),
    db.user.create({
      data: {
        name: "Notify test expired",
        pushSub: '{"expired":true}',
        email: "fallback@example.com",
      },
    }),
    db.user.create({
      data: { name: "Notify test email", email: "email@example.com" },
    }),
    db.user.create({ data: { name: "Notify test missing" } }),
  ]);
  const marker = `test-notify-${Date.now()}`;
  const events: string[] = [];
  const delivery: Delivery = {
    push: async (sub) => {
      if (sub.includes("expired")) throw { statusCode: 410 };
      events.push("push");
    },
    email: async (email) => {
      events.push(email);
    },
  };
  try {
    await db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        revisionId: marker,
        title: "Test revision",
        url: "/",
      })),
    });
    await deliverNotifications(delivery);
    const rows = await db.notification.findMany({
      where: { revisionId: marker },
    });
    assert.equal(rows.filter((r) => r.deliveredAt).length, 3);
    assert.equal(
      rows.find((r) => r.userId === users[3].id)?.lastFailure,
      "Add an email address or enable push notifications.",
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: users[1].id } })).pushSub,
      null,
    );
    assert.ok(events.includes("push"));
    assert.ok(events.includes("fallback@example.com"));
    assert.ok(events.includes("email@example.com"));
    assert.ok(!events.includes("push@example.com"));
    const deliveredBefore = events.length;
    await deliverNotifications(delivery);
    assert.equal(events.length, deliveredBefore);
  } finally {
    await db.notification.deleteMany({ where: { revisionId: marker } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  }
});
after(() => db.$disconnect());
