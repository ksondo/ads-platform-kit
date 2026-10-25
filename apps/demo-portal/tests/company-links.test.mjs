import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const catalogue = JSON.parse(readFileSync(new URL("../catalogue.json", import.meta.url), "utf8"));
const script = readFileSync(new URL("../main.js", import.meta.url), "utf8")
  .replace(/^import[^\n]*\n/gm, ""); // VM checks classic navigation helpers only
const sandbox = {
  document: { getElementById: () => ({ innerHTML: "" }), addEventListener: () => {} },
  window: { addEventListener: () => {} },
  localStorage: { getItem: () => null },
  navigator: { language: "en-US" },
};
vm.runInNewContext(script.replace(/start\(\);\s*$/, "globalThis.__test = { companyNav, companyAction, whatsAppContact, link };"), sandbox);
const { companyNav, companyAction, whatsAppContact, link } = sandbox.__test;

test("corporate website navigation is disabled by default in the catalogue", () => {
  assert.equal(catalogue.companySiteLinksEnabled, false);
});
test("About ADS and Partners remain visible with no link or click action", () => {
  for (const [route,label] of [["/about","About ADS"],["/partners","Partners"]]) {
    const html = companyNav(route, label);
    assert.match(html, /<span[^>]*>/);
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /href=|onclick=|<a\b|<button\b/);
  }
});
test("P2-2 partner calls-to-action open company email, even while About/Partners pages are paused", () => {
  for (const label of ["Be a Partner","Discuss Cloud Partnership"]) {
    const html = companyAction("/partners",label,"btn btn-gold");
    assert.ok(html.includes(label));
    assert.match(html, /<a[^>]*href="mailto:admin@africadigitalsynergy.com\?subject=ADS%20Partnership"/);
    assert.doesNotMatch(html, /company-action-disabled/);
  }
});
test("internal portal links still function", () => {
  assert.match(link("/platforms","Platforms"), /href="\/platforms"/);
});

test("Contact uses the user-provided WhatsApp number, never the company website", () => {
  const html = whatsAppContact("Contact");
  assert.match(html, /href="https:\/\/wa\.me\/237654035075"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />Contact<\/a>/);
  assert.doesNotMatch(html, /africadigitalsynergy\.com/);
});
test("WhatsApp contact also works as a footer link", () => {
  assert.match(whatsAppContact("Contact","footer-link"), /class="footer-link"/);
});
