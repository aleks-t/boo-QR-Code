import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCode,
  currentRevision,
  csvCell,
  similarCode,
} from "../lib/domain";
test("old printed revisions resolve to permanent identifiers", () => {
  assert.equal(resolveCode(" acm-0043-v12 "), "ACM-0043");
  assert.equal(resolveCode("ACM-0043"), "ACM-0043");
  assert.equal(resolveCode("ACM-0043-V2-other"), "ACM-0043-V2-OTHER");
});
test("current excludes voided rows and can be absent", () => {
  assert.equal(
    currentRevision([
      { voided: false, revisionNum: 1 },
      { voided: true, revisionNum: 4 },
      { voided: false, revisionNum: 3 },
    ])?.revisionNum,
    3,
  );
  assert.equal(currentRevision([{ voided: true, revisionNum: 1 }]), null);
});
test("100 versions remain available and old labels still resolve to the latest part", () => {
  const revisions = Array.from({ length: 100 }, (_, i) => ({
    revisionNum: i + 1,
    voided: i === 98,
  }));
  const before = structuredClone(revisions);
  assert.equal(currentRevision(revisions)?.revisionNum, 100);
  assert.deepEqual(revisions, before);
  for (const version of [1, 4, 99, 100])
    assert.equal(resolveCode(` SRG-0001-v${version} `), "SRG-0001");
});
test("CSV quotes names, multiline notes and neutralizes formulas", () => {
  assert.equal(csvCell('A, "bracket"'), '"A, ""bracket"""');
  assert.equal(csvCell('=IMPORTXML("secret")'), '"\'=IMPORTXML(""secret"")"');
  assert.equal(csvCell("ACM-0043"), '"ACM-0043"');
});
test("near vendor codes produce suggestions", () => {
  assert.equal(similarCode("ACME", "ACM"), true);
  assert.equal(similarCode("ACN", "ACM"), true);
  assert.equal(similarCode("XYZ", "ACM"), false);
});

test("sample and version scans preserve context; real calendar dates validate", async () => {
  const { parseCode, normalizeCode, calendarDate } =
    await import("../lib/domain");
  assert.deepEqual(parseCode(" srg-0001-s12 "), {
    code: "SRG-0001-S12",
    partNumber: "SRG-0001",
    sampleNumber: 12,
    revisionNum: null,
  });
  assert.equal(
    normalizeCode("https://example.test/parts/SRG-0001-S2"),
    "SRG-0001-S2",
  );
  assert.equal(parseCode("SRG-0001-V4").revisionNum, 4);
  assert.equal(calendarDate("2026-02-30"), false);
  assert.equal(calendarDate("2024-02-29"), true);
});
