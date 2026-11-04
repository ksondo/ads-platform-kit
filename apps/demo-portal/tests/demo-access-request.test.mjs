// ADS Demo Access (Commerce pilot): the portal sends visitors to the platform's introduction and request
// page, labels the button "Request demo access" / "Demander un accès de démonstration", and never shows
// demo passwords or links to any administration page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const load = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const catalogue = JSON.parse(load("catalogue.json"));
const script = load("main.js");
const REQUEST_PAGE = "https://commerce.demo.africadigitalsynergy.com/commerce/demo";
const ADMIN_LINK = /admin\.demo\.|\/demo-admin|href="[^"]*\/admin(?:[/?"#]|$)/i;
// Shared demo credentials: demo account addresses, demo passwords or the old "use demo account" shortcut.
// (The guide may say that an approved visitor sets their OWN password.)
const PASSWORD_TEXT = /demo password|password:|mot de passe (de )?démo|mot de passe :|DEMO_[A-Z0-9_]*PASSWORD|Use demo account|Utiliser le compte démo|demo\.(user|admin|checker)@/i;

// Renders portal pages in a sandbox, in the given language, without a browser.
function renderer(lang) {
  const source = script.replace(/^import[^\n]*\n/gm, "").replace(/start\(\);\s*$/,
    "globalThis.__render = { setCatalogue: c => { catalogue = c; }, platformDetail, toolDetail, platformCard, toolCard, demoAccessGuide, landing };");
  const sandbox = {
    imageUrl: () => "", platformImage: () => "", photo: () => "", credits: [], opportunityCredits: [],
    ADSOpportunities: {}, URLSearchParams,
    document: { getElementById: () => ({ innerHTML: "" }), documentElement: {}, addEventListener: () => {} },
    localStorage: { getItem: () => lang },
    navigator: { language: lang },
    location: { pathname: "/", search: "" },
    window: { location: { pathname: "/", search: "" }, addEventListener: () => {} },
  };
  vm.runInNewContext(source, sandbox);
  sandbox.__render.setCatalogue({ ...catalogue, publicSite: catalogue.publicSite ?? "https://africadigitalsynergy.com" });
  return sandbox.__render;
}

const commerceEntries = () => [
  catalogue.platforms.find(p => p.id === "commerce"),
  ...catalogue.tools.filter(x => x.platformId === "commerce" && x.demoUrl),
];

test("Commerce demo links go only to the contract-protected introduction and request page", () => {
  const entries = commerceEntries();
  assert.deepEqual(entries.map(x => x.id).sort(), ["commerce", "ecommerce", "pos"]);
  for (const x of entries) {
    assert.equal(x.demoUrl, REQUEST_PAGE, x.id);
    assert.equal(x.demoAccess, "request", x.id);
  }
  for (const x of [...catalogue.platforms, ...catalogue.tools]) {
    if (x.demoUrl) assert.equal(x.demoUrl, REQUEST_PAGE, "unexpected demo link on " + x.id);
    if (x.demoAccess !== undefined) assert.equal(x.demoAccess, "request", x.id);
  }
});

test("availability labels stay accurate: only Commerce is a verified demo, every other platform is coming soon", () => {
  for (const p of catalogue.platforms) {
    if (p.id === "commerce") assert.equal(p.availability, "verified_demo");
    else {
      assert.equal(p.availability, "coming_soon", p.id);
      assert.equal(p.demoUrl, null, p.id);
    }
  }
});

for (const [lang, button, pill] of [["en", "Request demo access", "Demo on request"], ["fr", "Demander un accès de démonstration", "Démo sur demande"]]) {
  test(`${lang.toUpperCase()}: Commerce buttons read "${button}" and open the request page in a new tab`, () => {
    const r = renderer(lang);
    const commerce = catalogue.platforms.find(p => p.id === "commerce");
    const detail = r.platformDetail(commerce);
    assert.ok(detail.includes(button), "platform detail button");
    assert.ok(detail.includes('href="' + REQUEST_PAGE + '"'));
    assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
    assert.ok(r.platformCard(commerce).includes(button), "platform card label");
    for (const id of ["ecommerce", "pos"]) {
      const tool = catalogue.tools.find(x => x.id === id);
      assert.ok(r.toolDetail(tool).includes(button), id + " detail button");
      assert.ok(r.toolCard(tool).includes(pill), id + " card pill");
    }
    // A platform without a verified demo keeps its "being prepared" label.
    const education = catalogue.platforms.find(p => p.id === "education");
    assert.ok(!r.platformDetail(education).includes(button));
  });

  test(`${lang.toUpperCase()}: no rendered page shows demo passwords or links to administration pages`, () => {
    const r = renderer(lang);
    const pages = [r.demoAccessGuide(), r.landing(),
      ...catalogue.platforms.map(r.platformDetail), ...catalogue.tools.map(r.toolDetail)];
    for (const html of pages) {
      assert.doesNotMatch(html, PASSWORD_TEXT);
      assert.doesNotMatch(html, ADMIN_LINK);
      assert.doesNotMatch(html, /<input\b[^>]*type="password"/i);
    }
    assert.ok(r.demoAccessGuide().includes(button), "guide explains the request step");
  });
}

test("portal source files contain no administration links and no demo password references", () => {
  for (const file of ["main.js", "index.html", "catalogue.json", "opportunities-v2.js", "opportunities-page.js", "nginx.conf"]) {
    const text = load(file);
    assert.doesNotMatch(text, ADMIN_LINK, file);
    assert.doesNotMatch(text, /DEMO_[A-Z0-9_]*PASSWORD|demo\.(user|admin|checker)@/i, file);
  }
});
