import assert from "node:assert/strict";
import test from "node:test";

import { zonedDateTimeToTimestamp } from "../src/utils/zoned-time.ts";

test("zonedDateTimeToTimestamp handles fixed offsets and daylight-saving changes", () => {
  assert.equal(
    new Date(zonedDateTimeToTimestamp("2026-08-10", "09:00", "Asia/Shanghai")).toISOString(),
    "2026-08-10T01:00:00.000Z",
  );
  assert.equal(
    new Date(zonedDateTimeToTimestamp("2026-01-15", "09:00", "America/New_York")).toISOString(),
    "2026-01-15T14:00:00.000Z",
  );
  assert.equal(
    new Date(zonedDateTimeToTimestamp("2026-07-15", "09:00", "America/New_York")).toISOString(),
    "2026-07-15T13:00:00.000Z",
  );
});
