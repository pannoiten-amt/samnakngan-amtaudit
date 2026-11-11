import { DurableObject } from "cloudflare:workers";
import {
  bangkokDay,
  corsHeaders,
  readVisitorId,
  shiftIsoDay,
  siteFromOrigin,
  visitorHashes,
} from "./lib.js";

function asCount(value) {
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

/**
 * One SQLite Durable Object per site (amtaudit / amtsolution).
 * Stores daily unique counts, a running total, and same-day dedupe hashes.
 * Hashes older than two Bangkok days are deleted. Totals are kept.
 */
export class VisitorCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS seen (
          day TEXT NOT NULL,
          hash TEXT NOT NULL,
          PRIMARY KEY (day, hash)
        );
        CREATE TABLE IF NOT EXISTS daily (
          day TEXT PRIMARY KEY,
          uniques INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO meta (key, value) VALUES ('total', 0);
      `);
    });
  }

  /**
   * @param {string} day YYYY-MM-DD in Asia/Bangkok
   * @param {string[]} hashes SHA-256 hex strings for this visitor
   */
  recordVisit(day, hashes) {
    const list = [...new Set(hashes)].filter(
      (hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash),
    );
    return this.ctx.storage.transactionSync(() => {
      let already = false;
      for (const hash of list) {
        const found = this.ctx.storage.sql
          .exec("SELECT 1 AS x FROM seen WHERE day = ? AND hash = ? LIMIT 1", day, hash)
          .toArray();
        if (found.length > 0) already = true;
      }
      const counted = !already && list.length > 0;
      if (counted) {
        this.ctx.storage.sql.exec(
          `INSERT INTO daily (day, uniques) VALUES (?, 1)
           ON CONFLICT(day) DO UPDATE SET uniques = uniques + 1`,
          day,
        );
        this.ctx.storage.sql.exec("UPDATE meta SET value = value + 1 WHERE key = 'total'");
      }
      for (const hash of list) {
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO seen (day, hash) VALUES (?, ?)",
          day,
          hash,
        );
      }
      if (counted) {
        this.ctx.storage.sql.exec("DELETE FROM seen WHERE day < ?", shiftIsoDay(day, -2));
      }
      const todayRow = this.ctx.storage.sql
        .exec("SELECT uniques FROM daily WHERE day = ?", day)
        .toArray()[0];
      const total = asCount(
        this.ctx.storage.sql.exec("SELECT value FROM meta WHERE key = 'total'").one().value,
      );
      return {
        day,
        today: todayRow ? asCount(todayRow.uniques) : 0,
        total,
      };
    });
  }
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname !== "/v1/visit") {
      return json({ error: "not_found" }, 404, origin);
    }

    if (request.method === "OPTIONS") {
      if (!siteFromOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    const site = siteFromOrigin(origin);
    if (!site) return json({ error: "origin_not_allowed" }, 403, null);

    const day = bangkokDay(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return json({ error: "unavailable" }, 503, origin);
    }

    const vid = await readVisitorId(request);
    const pepper = typeof env.HASH_PEPPER === "string" ? env.HASH_PEPPER : "";
    const hashes = await visitorHashes({
      vid,
      ip: request.headers.get("CF-Connecting-IP") || "",
      ua: request.headers.get("User-Agent") || "",
      pepper,
    });

    try {
      const stub = env.VISITOR_COUNTER.get(env.VISITOR_COUNTER.idFromName(site));
      const counts = await stub.recordVisit(day, hashes);
      return json({ site, ...counts }, 200, origin);
    } catch {
      console.log(JSON.stringify({ event: "counter_error", site }));
      return json({ error: "unavailable" }, 503, origin);
    }
  },
};
