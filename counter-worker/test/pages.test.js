import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const GA = "https://www.googletagmanager.com/gtag/js?id=G-KK5JZ2B1RT";

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "counter-worker" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) htmlFiles(path, out);
    else if (name.endsWith(".html")) out.push(path);
  }
  return out;
}

test("every page has the GA snippet and a hidden counter hook", () => {
  const files = htmlFiles(repoRoot);
  assert.ok(files.length >= 20, `expected the static pages, found ${files.length}`);
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    const label = relative(repoRoot, file);
    assert.equal(html.split(GA).length - 1, 1, label);
    assert.match(html, /gtag\('config', 'G-KK5JZ2B1RT'\);/, label);
    assert.match(html, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-KK5JZ2B1RT"><\/script>/, label);
    assert.match(html, /<script src="\/assets\/visitor-counter\.js" defer><\/script>/, label);
    assert.match(html, /<p id="amt-visitor-counter" hidden><\/p>/, label);
  }
});

test("counter config points at the deployed Worker", () => {
  const js = readFileSync(join(repoRoot, "assets/visitor-counter.js"), "utf8");
  assert.match(js, /var AMT_VISITOR_COUNTER_ENDPOINT = "https:\/\/amt-visitor-counter\.pannoi-ten\.workers\.dev";/);
});
