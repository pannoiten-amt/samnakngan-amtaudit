import assert from "node:assert/strict";
import test from "node:test";
import {
  bangkokDay,
  corsHeaders,
  fingerprint,
  isVisitorId,
  readVisitorId,
  shiftIsoDay,
  siteFromOrigin,
  visitorHashes,
} from "../src/lib.js";

const VID = "550e8400-e29b-41d4-a716-446655440000";

test("bangkok day rolls over at midnight ICT (17:00 UTC)", () => {
  assert.equal(bangkokDay(new Date("2026-11-10T16:59:59.000Z")), "2026-11-10");
  assert.equal(bangkokDay(new Date("2026-11-10T17:00:00.000Z")), "2026-11-11");
  assert.equal(bangkokDay(new Date("2026-11-11T16:59:59.000Z")), "2026-11-11");
  assert.equal(bangkokDay(new Date("2026-11-11T17:00:00.000Z")), "2026-11-12");
});

test("shiftIsoDay stays on the calendar date", () => {
  assert.equal(shiftIsoDay("2026-11-11", -2), "2026-11-09");
  assert.equal(shiftIsoDay("2026-03-01", -1), "2026-02-28");
});

test("site key comes only from the two allowed origins", () => {
  assert.equal(siteFromOrigin("https://samnakngan-amtaudit.com"), "amtaudit");
  assert.equal(siteFromOrigin("https://samnakngan-amtsolution.com"), "amtsolution");
  assert.equal(siteFromOrigin("https://www.samnakngan-amtaudit.com"), null);
  assert.equal(siteFromOrigin("http://samnakngan-amtaudit.com"), null);
  assert.equal(siteFromOrigin("https://evil.example"), null);
  assert.equal(siteFromOrigin(null), null);
});

test("cors echoes only an allowed origin", () => {
  const ok = corsHeaders("https://samnakngan-amtaudit.com");
  assert.equal(ok["Access-Control-Allow-Origin"], "https://samnakngan-amtaudit.com");
  assert.equal(ok["Vary"], "Origin");
  assert.deepEqual(corsHeaders("https://evil.example"), {});
  assert.deepEqual(corsHeaders(null), {});
});

test("visitor id must be a uuid v4", () => {
  assert.equal(isVisitorId(VID), true);
  assert.equal(isVisitorId(VID.toUpperCase()), true);
  assert.equal(isVisitorId("not-a-uuid"), false);
  assert.equal(isVisitorId("550e8400-e29b-11d4-a716-446655440000"), false);
});

test("fingerprint is sha-256 hex and changes with the pepper", async () => {
  const a = await fingerprint("vid:abc", "pepper");
  const b = await fingerprint("vid:abc", "pepper");
  const c = await fingerprint("vid:abc", "other");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("same browser id dedupes across IP changes; same IP dedupes a new id", async () => {
  const first = await visitorHashes({ vid: VID, ip: "203.0.113.5", ua: "UA", pepper: "p" });
  const newIp = await visitorHashes({ vid: VID, ip: "203.0.113.9", ua: "UA", pepper: "p" });
  const cleared = await visitorHashes({
    vid: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
    ip: "203.0.113.5",
    ua: "UA",
    pepper: "p",
  });
  assert.equal(first[0], newIp[0]);
  assert.notEqual(first[1], newIp[1]);
  assert.equal(first[1], cleared[1]);
  assert.notEqual(first[0], cleared[0]);
});

test("readVisitorId ignores oversized or invalid bodies", async () => {
  const ok = new Request("https://worker.test/v1/visit", {
    method: "POST",
    body: JSON.stringify({ vid: VID }),
  });
  assert.equal(await readVisitorId(ok), VID);

  const junk = new Request("https://worker.test/v1/visit", {
    method: "POST",
    body: JSON.stringify({ vid: "nope" }),
  });
  assert.equal(await readVisitorId(junk), "");

  const huge = new Request("https://worker.test/v1/visit", {
    method: "POST",
    headers: { "content-length": "5000" },
    body: "{}",
  });
  assert.equal(await readVisitorId(huge), "");
});
