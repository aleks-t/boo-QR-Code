// Isolated verification only. Never reads .env or connects to the user's database.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const port = await freePort(),
  appPort = await freePort();
const directory = await mkdtemp(join(tmpdir(), "partbook-sample-tests-"));
const pg = new EmbeddedPostgres({
  databaseDir: join(directory, "db"),
  port,
  user: "tester",
  password: "isolated",
  persistent: false,
  onLog: () => {},
  onError: () => {},
});
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://tester:isolated@127.0.0.1:${port}/partbook_samples_test`,
  APP_URL: `http://127.0.0.1:${appPort}`,
  SAMPLE_TEST_URL: `http://127.0.0.1:${appPort}`,
  REVISION_TEST_URL: `http://127.0.0.1:${appPort}`,
  VAPID_PRIVATE_KEY: "",
  RESEND_API_KEY: "",
};
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
let server;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("partbook_samples_test");
  await pg.createDatabase("partbook_samples_migration");
  const client = pg.getPgClient("partbook_samples_migration", "127.0.0.1");
  await client.connect();
  try {
    for (const migration of ["202609160001_initial", "202609160002_samples"])
      await client.query(
        await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
      );
    await client.query(`
      INSERT INTO "Vendor" (id,code,name) VALUES ('v','LEG','Legacy vendor');
      INSERT INTO "Category" (id,code,name) VALUES ('c','OLD','Legacy category');
      INSERT INTO "Part" (id,"partNumber","partName","vendorId","categoryId",sequence,"updatedAt") VALUES ('p','LEG-0001','Existing paint','v','c',1,'2026-07-01');
      INSERT INTO "Revision" (id,"partId","revisionNum","changeNote","loggedBy","createdAt") VALUES ('r','p',4,'Existing V4','Owner','2026-08-01');
      INSERT INTO "Sample" (id,"partId","sampleNumber",status,note,"updatedAt","createdAt") VALUES ('s','p',1,'PASSED','Q14','2026-09-01','2026-07-01');
      INSERT INTO "SampleEvent" (id,"sampleId",status,note,"revisionNum","loggedBy") VALUES ('e','s','PASSED','Q14',4,'Owner');
    `);
    const before = (await client.query('SELECT * FROM "Sample"')).rows[0];
    await client.query(
      await readFile(
        "prisma/migrations/202609300001_sample_labels_dates/migration.sql",
        "utf8",
      ),
    );
    const after = (await client.query('SELECT * FROM "Sample"')).rows[0];
    for (const key of Object.keys(before))
      assert.deepEqual(after[key], before[key]);
    assert.equal(after.revisionNum, null);
    assert.equal(after.receivedOn, null);
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM "SampleEvent"'))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await client.query('SELECT "changeNote" FROM "Revision"')).rows[0]
        .changeNote,
      "Existing V4",
    );
    console.log(
      "PASS: additive migration preserved existing sample status, notes, timestamps, event and revision.",
    );
  } finally {
    await client.end();
  }
  await run("npx", ["prisma", "migrate", "deploy"]);
  await run("node", [
    "--import",
    "tsx",
    "--test",
    "tests/domain.test.ts",
    "tests/samples.test.ts",
  ]);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let logs = "";
  server.stdout.on("data", (d) => {
    logs += d;
  });
  server.stderr.on("data", (d) => {
    logs += d;
  });
  let up = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(env.APP_URL + "/api/health")).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) throw new Error("Test app failed to start: " + logs);
  await run("npx", [
    "playwright",
    "test",
    "tests/browser/sample-workflow.spec.ts",
    "tests/browser/revision-visibility.spec.ts",
  ]);
} finally {
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  await pg.stop();
}
