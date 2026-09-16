import EmbeddedPostgres from "embedded-postgres";
const pg = new EmbeddedPostgres({
  databaseDir: ".local-db",
  user: "partbook",
  password: "partbook",
  port: 54329,
  persistent: true,
});
await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("partbook");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
console.log(
  "Local PostgreSQL is ready on port 54329. Leave this terminal running.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
