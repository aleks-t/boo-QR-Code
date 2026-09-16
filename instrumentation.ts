export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    (process.env.VAPID_PRIVATE_KEY || process.env.RESEND_API_KEY)
  ) {
    const { deliverNotifications } = await import("./lib/notifications");
    const globalWorker = globalThis as unknown as {
      partbookWorker?: ReturnType<typeof setInterval>;
    };
    if (!globalWorker.partbookWorker) {
      const deliver = () =>
        void deliverNotifications().catch(() =>
          console.warn(
            "Notification retry will continue on the next interval.",
          ),
        );
      globalWorker.partbookWorker = setInterval(deliver, 60000);
      globalWorker.partbookWorker.unref();
      deliver();
    }
  }
}
