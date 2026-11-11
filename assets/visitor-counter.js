/* Visitor counter for AMT static sites.
 * Set AMT_VISITOR_COUNTER_ENDPOINT to the deployed Worker origin
 * (https, no path) after `npx wrangler deploy`. Leave the placeholder
 * to keep the footer badge hidden.
 * Example: "https://amt-visitor-counter.<account>.workers.dev"
 */
var AMT_VISITOR_COUNTER_ENDPOINT = "https://amt-visitor-counter.pannoi-ten.workers.dev";

(function () {
  var STORAGE_KEY = "amt_visitor_id";
  var VID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var STYLE_ID = "amt-visitor-counter-style";
  /* White badge on the dark footer. Ink #12213A on white is 16.1:1.
     Brand blue #144891 on white is 8.9:1. Navy icon on amber #F08A24 is 6.4:1.
     Amber is only the icon chip, not the words (amber on white is 2.5:1). */
  var STYLE = [
    "#amt-visitor-counter[hidden]{display:none !important}",
    "#amt-visitor-counter:not([hidden]){display:flex;width:fit-content;max-width:100%;align-items:center;flex-wrap:wrap;gap:6px 10px;margin:12px 0 2px;padding:6px 14px 6px 6px;background:#fff;color:#12213A;border-radius:999px;font-size:.82rem;line-height:1.45;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.28)}",
    "#amt-visitor-counter strong{font-weight:700;color:#144891;font-variant-numeric:tabular-nums}",
    "#amt-visitor-counter .vc-badge{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#F08A24;color:#12213A}",
    "#amt-visitor-counter .vc-sep{color:#12213A;font-weight:700}"
  ].join("");
  var ICON = '<span class="vc-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" focusable="false"><path fill="currentColor" d="M8.5 11.2a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8zm7.1.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM8.5 12.6c-2.7 0-4.9 1.5-4.9 3.5V18h9.8v-1.9c0-2-2.2-3.5-4.9-3.5zm6.3.5c-.4 0-.9.1-1.3.2 1.3.8 2.1 2 2.1 3.3V18H21v-1.3c0-1.8-2.5-3.6-6.2-3.6z"/></svg></span>';

  function endpoint() {
    var value = typeof AMT_VISITOR_COUNTER_ENDPOINT === "string" ? AMT_VISITOR_COUNTER_ENDPOINT.trim() : "";
    if (!value || value.indexOf("PLACEHOLDER") !== -1) return "";
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
      return parsed.origin;
    } catch (e) {
      return "";
    }
  }

  function visitorId() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing && VID_RE.test(existing)) return existing;
      if (!crypto.randomUUID) return "";
      var id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
      return id;
    } catch (e) {
      return "";
    }
  }

  function asCount(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0 || Math.floor(value) !== value) return null;
    if (value > 1e12) return null;
    return value;
  }

  function formatCount(value) {
    return new Intl.NumberFormat("th-TH", { numberingSystem: "latn" }).format(value);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function reveal(el, today, total) {
    ensureStyle();
    el.innerHTML = ICON
      + "<span>ผู้เข้าชมวันนี้ <strong>" + formatCount(today) + "</strong> คน</span>"
      + '<span class="vc-sep" aria-hidden="true">·</span>'
      + "<span>ผู้เข้าชมทั้งหมด <strong>" + formatCount(total) + "</strong> คน</span>";
    el.hidden = false;
  }

  function start() {
    var el = document.getElementById("amt-visitor-counter");
    var url = endpoint();
    if (!el || !url) return;
    var signal;
    try {
      signal = AbortSignal.timeout(4000);
    } catch (e) {
      return;
    }
    var vid = visitorId();
    fetch(url + "/v1/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vid ? { vid: vid } : {}),
      credentials: "omit",
      cache: "no-store",
      signal: signal
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data) return;
      var today = asCount(data.today);
      var total = asCount(data.total);
      if (today === null || total === null) return;
      reveal(el, today, total);
    }).catch(function () {
      /* Endpoint unset, blocked, or down: leave the badge hidden. */
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
