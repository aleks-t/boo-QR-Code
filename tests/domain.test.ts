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
