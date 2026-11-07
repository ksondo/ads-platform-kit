import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner assignment 7 Nov 2026: Education, Agriculture, Tontine and Fleet Guard get a reviewed portal
// destination and an activation switch that is OFF ("preparing") until the operator confirms the
// deployed app, HTTPS and sign-in. Commerce keeps its existing verified link.
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const catalogue = read("../catalogue.json");
const activation = read("../demo-activation.json");
const registry = read("../../../config/demo-access-platforms.json").platforms;
const clients = read("../../../config/clients.demo.json").products;
const mapping = read("../identity-mapping.json").platformClients;
const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const docker = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const nginx = readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");

const PRODUCTS = {
  education: { registry: "education", client: "education-web", host: "education.demo.africadigitalsynergy.com" },
  agriculture: { registry: "agriculture", client: "agriculture-web", host: "agriculture.demo.africadigitalsynergy.com" },
  "digital-tontine": { registry: "tontine", client: "tontine-web", host: "tontine.demo.africadigitalsynergy.com" },
  "fleet-guard": { registry: "fleet-guard", client: "fleet-guard-web", host: "fleetguard.demo.africadigitalsynergy.com" },
};

test("activation is disabled by default for exactly the four published products", () => {
  assert.equal(activation.schemaVersion, 1);
  assert.deepEqual(Object.keys(activation.products).sort(), Object.keys(PRODUCTS).sort());
  for (const [id, state] of Object.entries(activation.products)) assert.equal(state, "preparing", id + " must stay preparing until the operator confirms it");
  assert.ok(!("commerce" in activation.products), "Commerce is not activation-managed");
  assert.doesNotMatch(JSON.stringify(activation), /https?:\/\//, "the activation file never carries destinations");
});

for (const [id, x] of Object.entries(PRODUCTS)) {
  test(id + ": card, description, status and reviewed destination", () => {
    const entries = catalogue.platforms.filter(p => p.id === id);
    assert.equal(entries.length, 1);
    const [p] = entries;
    assert.ok(p.name && p.fr && p.summary && p.summary_fr, id + " needs EN/FR name and description");
    assert.equal(p.demoUrl, null, id + " is not a verified live demo: no direct demoUrl");
    assert.equal(p.availability, "coming_soon");
    assert.equal(p.demoDestination, "https://" + x.host + "/demo", id + " opens the product overview page");
    // The destination is the same host Identity allows for this product's sign-in and requests.
    const r = registry.find(e => e.key === x.registry);
    assert.equal(r.client_id, x.client);
    assert.deepEqual(r.origins, ["https://" + x.host]);
    assert.equal(r.entry_url, "https://" + x.host + "/demo/personas");
    const c = clients.find(c => c.client_id === x.client);
    assert.ok(c.redirect_uris.includes("https://" + x.host + "/"));
    assert.ok(c.post_logout_redirect_uris.includes("https://" + x.host + "/"));
    assert.equal(mapping.find(m => m.portal === id)?.clientId, x.client);
  });
}

test("Commerce links are preserved", () => {
  const commerce = catalogue.platforms.find(p => p.id === "commerce");
  assert.equal(commerce.demoUrl, "https://commerce.demo.africadigitalsynergy.com/commerce/demo");
  assert.equal(commerce.demoDestination, undefined);
  for (const id of ["pos", "ecommerce"]) assert.equal(catalogue.tools.find(t => t.id === id).demoUrl, commerce.demoUrl);
});

test("portal code fails closed and only links reviewed ADS demo destinations", () => {
  assert.match(main, /const ACTIVATION_STATES=\["preparing","open","unavailable"\];/);
  assert.match(main, /return ACTIVATION_STATES\.includes\(v\)\?v:"preparing";/, "unknown value or product means preparing");
  assert.match(main, /catch \{ return \{\}; \}/, "unreadable activation file means preparing");
  assert.match(main, /if\(!response\.ok\)return \{\};/);
  assert.match(main, /DEMO_DESTINATION=\/\^https:\\\/\\\/\[a-z0-9-\]\+\\\.demo\\\.africadigitalsynergy\\\.com\\\//, "only https://<x>.demo.africadigitalsynergy.com/");
  assert.match(main, /if\(state==="unavailable"\)return '<span class="pill pill-warn"/, "unavailable is a status, never a link");
  assert.match(main, /if\(safeDemo\(p\.demoUrl\)\)return "live";/, "existing verified links are evaluated first and unchanged");
  assert.match(main, /u\.searchParams\.set\("lang",lang\)/, "language is handed to the product overview");
  for (const lang of ["en", "fr"]) for (const key of ["demoOpen", "demoAvailable", "demoUnavailable", "demoUnavailableNote", "demoPreparingNote", "demoOpenNote"])
    assert.match(main.slice(main.indexOf(lang + ": {"), main.indexOf(lang + ": {") + 2500), new RegExp(key + ":\""), lang + " " + key);
});

test("activation file ships in the image and is never answered by the SPA fallback", () => {
  assert.match(docker, /COPY apps\/demo-portal\/demo-activation\.json \/usr\/share\/nginx\/html\/demo-activation\.json/);
  assert.match(nginx, /location = \/demo-activation\.json \{\s*default_type application\/json;\s*try_files \$uri =404;\s*\}/);
});
