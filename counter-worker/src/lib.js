/** Origins allowed to read the counter. The site key is derived here, not from the client. */
export const ALLOWED_ORIGINS = {
  "https://samnakngan-amtaudit.com": "amtaudit",
  "https://samnakngan-amtsolution.com": "amtsolution",
};

const VID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function siteFromOrigin(origin) {
  if (typeof origin !== "string") return null;
  return ALLOWED_ORIGINS[origin] ?? null;
}

export function isVisitorId(value) {
  return typeof value === "string" && VID_RE.test(value);
}

/** Calendar day in Asia/Bangkok, YYYY-MM-DD. Midnight ICT is 17:00 UTC the previous day. */
export function bangkokDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shiftIsoDay(isoDay, deltaDays) {
  const [year, month, day] = isoDay.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fingerprint(material, pepper = "") {
  const data = new TextEncoder().encode(`${pepper}\n${material}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hashes used for one-day dedupe. A valid first-party id and the IP+UA pair
 * are both hashed. The caller counts the visit only when neither hash was
 * stored for this site on this Bangkok day. Raw IP, User-Agent, and id are
 * not returned.
 */
export async function visitorHashes({ vid, ip, ua, pepper }) {
  const hashes = [];
  if (isVisitorId(vid)) {
    hashes.push(await fingerprint(`vid:${vid.toLowerCase()}`, pepper));
  }
  if (ip || ua) {
    hashes.push(await fingerprint(`ipua:${ip || ""}\n${ua || ""}`, pepper));
  }
  if (hashes.length === 0) {
    hashes.push(await fingerprint("anonymous", pepper));
  }
  return hashes;
}

export async function readVisitorId(request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > 1024) return "";
  let text = "";
  try {
    text = await request.text();
  } catch {
    return "";
  }
  if (!text || text.length > 1024) return "";
  try {
    const data = JSON.parse(text);
    return isVisitorId(data?.vid) ? data.vid : "";
  } catch {
    return "";
  }
}

export function corsHeaders(origin) {
  if (!siteFromOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
