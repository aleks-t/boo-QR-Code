const { APP_URL, CRON_SECRET } = process.env;
if (!APP_URL || !CRON_SECRET) throw new Error("Set APP_URL and CRON_SECRET.");
const response = await fetch(new URL("/api/notifications/retry", APP_URL), {
  method: "POST",
  headers: { authorization: `Bearer ${CRON_SECRET}` },
});
if (!response.ok)
  throw new Error(`Notification retry returned HTTP ${response.status}.`);
console.log("Notification queue processed.");
