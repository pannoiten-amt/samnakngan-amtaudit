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

test("article pages show a byline and three related links, and JSON-LD parses", () => {
  const dir = join(repoRoot, "articles");
  const articles = readdirSync(dir).filter((name) => {
    const index = join(dir, name, "index.html");
    try {
      return statSync(index).isFile();
    } catch {
      return false;
    }
  });
  assert.equal(articles.length, 14);
  for (const name of articles) {
    const html = readFileSync(join(dir, name, "index.html"), "utf8");
    assert.match(html, /<p class="byline">เขียนโดย <a href="\/team\/">/, name);
    assert.match(html, /<h2 id="related-heading">บทความที่เกี่ยวข้อง<\/h2>/, name);
    const links = html.match(/<section class="alt relarts"[\s\S]*?<\/section>/)[0].match(/href="\/articles\/[^"]+\/"/g);
    assert.equal(links.length, 3, name);
    assert.equal(new Set(links).size, 3, name);
    assert.ok(!links.some((href) => href.includes(`/articles/${name}/`)), name);
    const blocks = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/g);
    for (const block of blocks) {
      const data = JSON.parse(block.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, ""));
      if (data["@type"] !== "Article") continue;
      assert.equal(data.publisher["@type"], "Organization", name);
      if (data.author["@type"] === "Person") {
        assert.equal(data.author.name, "สุพจน์ ปานน้อย", name);
        assert.equal(data.author.jobTitle, "Chief Executive Officer, AMT Group", name);
        assert.equal(data.author.url, "https://samnakngan-amtaudit.com/team/", name);
        assert.equal(data.author.identifier.value, "9240", name);
        assert.match(html, /เลขทะเบียนผู้สอบบัญชีรับอนุญาต 9240/, name);
      } else {
        assert.equal(data.author.name, "ทีมงาน AMT Audit Group", name);
        assert.equal(data.author.identifier, undefined, name);
        assert.doesNotMatch(html, /เลขทะเบียนผู้สอบบัญชีรับอนุญาต 9240/, name);
      }
    }
  }
});

test("home and English page alternate th and en, and llms.txt is present", () => {
  const home = readFileSync(join(repoRoot, "index.html"), "utf8");
  const en = readFileSync(join(repoRoot, "en/index.html"), "utf8");
  for (const html of [home, en]) {
    assert.match(html, /hreflang="th" href="https:\/\/samnakngan-amtaudit\.com\/"/);
    assert.match(html, /hreflang="en" href="https:\/\/samnakngan-amtaudit\.com\/en\/"/);
  }
  assert.match(en, /Sisa Chorakhe Noi, Bang Sao Thong, Samut Prakan 10570/);
  const sitemap = readFileSync(join(repoRoot, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/samnakngan-amtaudit\.com\/en\/<\/loc>/);
  const llms = readFileSync(join(repoRoot, "llms.txt"), "utf8");
  assert.match(llms, /^# AMT Audit Group\n/);
  assert.match(llms, /79\/109 หมู่ 2 ซ\.ลาดกระบัง 54 ต\.ศีรษะจระเข้น้อย อ\.บางเสาธง จ\.สมุทรปราการ 10570/);
  assert.match(llms, /02-821-6928/);
  assert.match(llms, /info@amtaudit\.com/);
  assert.match(llms, /## Services\n/);
  assert.match(llms, /## Articles\n/);
  const org = JSON.parse(home.match(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "AccountingService".*?)<\/script>/)[1]);
  assert.ok(org.sameAs.includes("https://www.facebook.com/AMTaudit"));
  assert.ok(org.sameAs.includes("https://page.line.me/amtaudit"));
  assert.ok(org.sameAs.includes("https://lin.ee/x7Xg8Ob"));
  assert.equal(org.geo, undefined);
  assert.equal(JSON.stringify(org).includes("latitude"), false);
});
