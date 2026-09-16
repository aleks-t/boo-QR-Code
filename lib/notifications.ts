import webpush from "web-push";
import { Resend } from "resend";
import { db } from "./db";
export type Delivery = {
  push: (subscription: string, title: string, url: string) => Promise<void>;
  email: (
    email: string,
    title: string,
    url: string,
    id: string,
  ) => Promise<void>;
};
const transport: Delivery = {
  async push(subscription, title, url) {
    if (
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    )
      throw new Error("Push is not configured.");
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    await webpush.sendNotification(
      JSON.parse(subscription),
      JSON.stringify({ title, url }),
      { timeout: 5000 },
    );
  },
  async email(email, title, url, id) {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
      throw new Error("Email is not configured.");
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.RESEND_FROM,
        to: email,
        subject: title,
        text: `${title}\n\n${process.env.APP_URL}${url}`,
      },
      { idempotencyKey: id },
    );
    if (result.error) throw result.error;
  },
};
export async function deliverNotifications(delivery: Delivery = transport) {
  // Only one worker sends the queue, even when Railway runs multiple replicas.
  // Queue rows commit with the revision, so a process restart cannot lose the event.
  return db.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(428701) AS locked`;
      if (!lock.locked) return;
      const jobs = await tx.notification.findMany({
        where: { deliveredAt: null },
        orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
        take: 25,
      });
      for (const job of jobs) {
        const user = await tx.user.findUnique({ where: { id: job.userId } });
        if (!user) continue;
        let sent = false,
          failure = "Add an email address or enable push notifications.";
        if (user.pushSub) {
          try {
            await delivery.push(user.pushSub, job.title, job.url);
            sent = true;
          } catch (e) {
            failure = "Push delivery failed.";
            if ([404, 410].includes((e as { statusCode: number }).statusCode))
              await tx.user.update({
                where: { id: user.id },
                data: { pushSub: null },
              });
          }
        }
        if (!sent && user.email) {
          try {
            await delivery.email(user.email, job.title, job.url, job.id);
            sent = true;
          } catch {
            failure =
              "Email delivery failed. Check the sender and Resend configuration.";
          }
        }
        await tx.notification.update({
          where: { id: job.id },
          data: {
            attempts: { increment: 1 },
            deliveredAt: sent ? new Date() : null,
            lastFailure: sent ? null : failure,
          },
        });
      }
    },
    { timeout: 180000, maxWait: 5000 },
  );
}
