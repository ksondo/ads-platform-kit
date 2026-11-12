// ADS Demo Access (Commerce pilot): the portal sends visitors to the platform's introduction and request
// page and never shows demo passwords or links to any administration page. The activated Commerce
// platform uses the same "Open Demo" / "Ouvrir la démo" action as every activated platform; its tool
// pages keep the request label "Request demo access" / "Demander un accès de démonstration".
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
function renderer(lang,publicRequestsEnabled=false) {
  const source = script.replace(/^import[^\n]*\n/gm, "").replace(/start\(\);\s*$/,
    "globalThis.__render = { setCatalogue: c => { catalogue = c; }, platformDetail, toolDetail, platformCard, toolCard, demoAccessGuide, landing };");
  const sandbox = {
    imageUrl: () => "", platformImage: () => "", photo: () => "", credits: [], opportunityCredits: [],
    ADSOpportunities: {}, URLSearchParams, URL,
    document: { getElementById: () => ({ innerHTML: "" }), documentElement: {}, addEventListener: () => {} },
    localStorage: { getItem: () => lang },
    navigator: { language: lang },
    location: { pathname: "/", search: "" },
    window: { location: { pathname: "/", search: "" }, addEventListener: () => {} },
  };
  vm.runInNewContext(source, sandbox);
  sandbox.__render.setCatalogue({ ...catalogue, publicDemoRequestsEnabled:publicRequestsEnabled, publicSite: catalogue.publicSite ?? "https://africadigitalsynergy.com" });
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

for (const [lang, button, pill, openDemo, activeBadge] of [["en", "Request demo access", "Demo on request", "Open Demo", "Active demo"], ["fr", "Demander un accès de démonstration", "Démo sur demande", "Ouvrir la démo", "Démo active"]]) {
  test(`${lang.toUpperCase()}: Commerce reads "${openDemo}", its tools read "${button}", all open the request page in a new tab`, () => {
    const r = renderer(lang,true);
    const commerce = catalogue.platforms.find(p => p.id === "commerce");
    const detail = r.platformDetail(commerce);
    assert.ok(detail.includes(openDemo), "platform detail button");
    assert.ok(detail.includes('href="' + REQUEST_PAGE + '?lang=' + lang + '"'));
    assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
    const card = r.platformCard(commerce);
    assert.ok(card.includes(openDemo), "platform card label");
    assert.ok(card.includes(activeBadge), "platform card badge");
    for (const id of ["ecommerce", "pos"]) {
      const tool = catalogue.tools.find(x => x.id === id);
      assert.ok(r.toolDetail(tool).includes(button), id + " detail button");
      assert.ok(r.toolCard(tool).includes(pill), id + " card pill");
    }
    // A platform without a verified demo keeps its "being prepared" label.
    const education = catalogue.platforms.find(p => p.id === "education");
    assert.ok(!r.platformDetail(education).includes(button));
    assert.ok(!r.platformDetail(education).includes(openDemo));
  });

  test(`${lang.toUpperCase()}: no rendered page shows demo passwords or links to administration pages`, () => {
    const r = renderer(lang,true);
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

for(const [lang,button,pill,notice,openDemo] of [
 ["en","Open private demo","By prior approval","Public demo requests are temporarily unavailable.","Open Demo"],
 ["fr","Ouvrir la démo privée","Sur autorisation","Les demandes publiques de démonstration sont temporairement indisponibles.","Ouvrir la démo"]
]){
 test(`${lang}: private-first mode retains introduction links without an invitation promise`,()=>{
  const r=renderer(lang),commerce=catalogue.platforms.find(p=>p.id==='commerce');
  const pages=[[r.platformDetail(commerce),openDemo],...commerceEntries().filter(x=>x.id!=='commerce').map(x=>[r.toolDetail(x),button])];
  for(const [html,label] of pages){
   assert.ok(html.includes(label));assert.ok(html.includes(notice));
   assert.ok(html.includes('href="'+REQUEST_PAGE+'?lang='+lang+'"'));
   assert.match(html,/target="_blank" rel="noopener noreferrer"/);
   assert.doesNotMatch(html,/<form|<input/i);
  }
  for(const tool of commerceEntries().filter(x=>x.id!=='commerce'))assert.ok(r.toolCard(tool).includes(pill));
  const guide=r.demoAccessGuide();assert.ok(guide.includes(notice));
  assert.doesNotMatch(guide,/you receive an email invitation|vous recevez une invitation|enter your email address|saisissez votre adresse e-mail/i);
  assert.doesNotMatch(guide,PASSWORD_TEXT);assert.doesNotMatch(guide,ADMIN_LINK);
 });
}

test("portal source files contain no administration links and no demo password references", () => {
  for (const file of ["main.js", "index.html", "catalogue.json", "opportunities-v2.js", "opportunities-page.js", "nginx.conf"]) {
    const text = load(file);
    assert.doesNotMatch(text, ADMIN_LINK, file);
    assert.doesNotMatch(text, /DEMO_[A-Z0-9_]*PASSWORD|demo\.(user|admin|checker)@/i, file);
  }
});

test("the shipped catalogue is in private mode (owner decision 10 Nov 2026: Identity admits approved visitors only)",()=>{
 assert.equal(catalogue.publicDemoRequestsEnabled,false);
});

for(const lang of ["en","fr"]){
 test(`${lang}: every Commerce link opens the introduction in the portal language (?lang=${lang})`,()=>{
  const r=renderer(lang),commerce=catalogue.platforms.find(p=>p.id==='commerce');
  const html=[r.platformCard(commerce),r.platformDetail(commerce),...commerceEntries().filter(x=>x.id!=='commerce').map(r.toolDetail)].join("");
  const hrefs=[...html.matchAll(/href="(https:\/\/commerce\.demo\.[^"]+)"/g)].map(m=>m[1]);
  assert.ok(hrefs.length>=4,"Commerce card, detail and two tool links");
  for(const h of hrefs)assert.equal(h,REQUEST_PAGE+"?lang="+lang);
 });
}

test("private-mode guide explains sign-in for approved visitors and never offers a request step",()=>{
 for(const [lang,second] of [["en","Already approved? Sign in"],["fr","Déjà approuvé ? Connectez-vous"]]){
  const guide=renderer(lang).demoAccessGuide();
  assert.ok(guide.includes(second));
  assert.doesNotMatch(guide,/Request demo access|Demander un accès de démonstration/);
 }
});
