import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("universal entry is informational and grants no eligibility or posting control", () => {
  assert.match(page, /path: "\/post-free"/);
  assert.match(page, /does not establish eligibility or publish a job/);
  assert.match(page, /email verification, server-side eligibility review, and RNH Admin approval/);
  assert.doesNotMatch(page, /<form|fetch\(|source_type|company_id|approved_at/);
});
