# Private-access portal UI verification, 5 November 2026

Scope: preserve the approved navy/gold portal and correct the availability wording while public invitations are disabled. The portal remains public discovery; it has no login, cookies, tokens, account approval or credential storage.

`catalogue.json` now explicitly defaults `publicDemoRequestsEnabled` to false. Its absence also means false. Existing Commerce/POS/E-commerce introduction URLs remain unchanged. Those entries show "Open private demo" / "Ouvrir la démo privée", with "By prior approval" / "Sur autorisation" status and an explicit unavailable-public-requests notice. The access guide describes approved individual sign-in rather than promising an emailed invitation. The explicitly enabled future request-guidance path retains its regression tests. No CSP rule was loosened.

Local verification:

- All portal unit tests: **59 passed, 0 failed**.
- `browser-private-access.mjs`: **1 passed, 0 failed**, covering EN/FR × 360/768/1280 px × three pages (portal Commerce detail, portal access guide, built Commerce introduction), **18 page checks and 18 screenshots**. Automated WCAG 2 A/AA, 2.1 AA and 2.2 AA checks returned no violations; no horizontal overflow, request POST, page error or application CSP error was observed.
- Corrected contrast for the existing detail note and access-guide step numbers using darker shades in the established palette. Commerce's owning component applies its existing emerald token to its introduction eyebrow.
- Screenshots were saved under the task output directory `outputs/visitor-access-ui`, with filenames `{portal-commerce,portal-access,commerce-intro}-{360,768,1280}-{en,fr}.png`. Representative mobile/tablet/desktop screenshots were visually inspected.

Reproduce from repository root after installing transient test tools:

```powershell
npm install --prefix apps/demo-portal --no-save --package-lock=false playwright@1.56.1 @axe-core/playwright@4.10.2
$env:PLAYWRIGHT_BROWSERS_PATH='<existing Chromium browser directory>'
$env:ADS_UI_SCREENSHOT_DIR='<approved output directory>'
$env:COMMERCE_UI_DIST='<private-mode Commerce production dist directory>'
node --test apps/demo-portal/tests/browser-private-access.mjs
```

This browser fixture serves the actual portal files with the existing Nginx CSP and the real built Commerce assets from local loopback static servers. External font/image variability is blocked; axe external CSS preloading is disabled while all selected WCAG rules run against rendered computed styles. Local `/api` requests receive an explicit unavailable response. This is UI/layout evidence, **not** hosted Identity/API/database acceptance, a container test, or Contabo deployment evidence.

The catalogue flag controls presentation only. Identity must independently refuse public requests/registration/approval when operating in private-only mode. Future activation requires tested SMTP, administrator DNS/TLS/dashboard and invitation/grant controls, followed by reviewed source/image promotion. The existing manual portal deployment path remains `deploy/contabo-demo/deploy-portal.sh`; this change does not invoke any publisher or modify the server. No source push, merge, deployment or owner acceptance is claimed here.
