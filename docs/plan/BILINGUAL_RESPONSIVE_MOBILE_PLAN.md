# Bilingual, responsive and mobile-app plan (all ADS platforms)

**Date:** 23 Oct 2026. **Owner:** Kengjiseh Sondo (ADS). **Planning only:** no product repo is changed by this document.
**Evidence:** `origin/main` of every repo, fetched 23 Oct 2026 and read with a script (method in section 10). The numbers are measured from code and are approximate where marked `~`.

## 1. What the owner asked for, and the binding rules

1. Every platform, on the web and in its app, is fully usable in **French and English**.
2. Every page is correctly styled on **phone, tablet and computer**. CSS always loads and the layout adapts. No unstyled or broken page on any device.
3. Every platform gets an **Android app** with its own version number, and there is a plan for iPhone and for other phones used in Cameroon.

**Language rule (owner clarification, binding):**
- **One app per platform, the same on every device:** phone, tablet, computer and the Android app run the same build.
- **No French-only or English-only builds, deployments or URLs** that lock a language. A language is never tied to a device or a build (no "mobile = French, web = English").
- The user chooses English or French with a **visible switch on every page**. The whole page changes immediately.
- The choice is **remembered** on the device and, where the user is signed in, **follows the account** to other devices.
- **First visit:** use the browser or phone language if it is French or English; otherwise **French**.

**The switch already exists in every platform with a web interface** (inventory below). This plan does not build a new switch. It **verifies** the existing switch on each platform with a test added to that platform's end-to-end (E2E) suite, and it lists fixes only where the verification fails.

## 2. Summary of the inventory

| Measure | Result (26 platforms with a web interface; the RAG platform has no UI) |
| --- | --- |
| EN/FR dictionaries | 25 of 26 have matching EN and FR key sets (100% or within 5 keys). **AfriCoreStack** had its dictionaries removed: `t()` now returns English text for legacy screens. |
| Text still hard-coded in English (approx.) | 0–13 strings in 16 platforms. 48–221 in 9 platforms (VentureWorks 221, Morphoo 214, Education 196, HopeBridge 189, Software Factory 178, Tourism 170, Banking 64, Hub 52, Transport 48). **~1,700 in AfriCoreStack.** |
| Language switch | Present in all 26 (in the app shell or header). Placement inside phone menus is not yet tested anywhere. |
| Language remembered | On the device: 25 of 26. **Commerce keeps it only for the browser tab (`sessionStorage`).** With the account: found in 19; **not found** in Tontine, Logistics, HopeBridge, Banking, Tourism, Transport; Crypto/IIP only for investors. |
| Default when the browser is neither FR nor EN | **English in 24 platforms; French only in Tontine and Tourism.** The rule above requires French. |
| Separate per-language builds, routes or device-tied language | **None found** (no `build:fr` scripts, no `/fr/` or `/en/` routes, no language env setting, no language chosen from screen size or user agent). |
| E2E language × screen size | **All 25 Playwright suites run exactly two combinations: computer in English and phone (360 px) in French.** No suite runs phone-English, computer-French or any tablet size. AfriCoreStack has no Playwright journeys. |
| Phone layout | Viewport tag present everywhere. 360 px is tested in 25 of 26. |
| Tablet layout | Breakpoints between 600 and 1,024 px (or Tailwind `md:`) exist in all 26, but **no tablet test exists anywhere**. |
| Installable app (PWA) | A manifest in 9 platforms, a service worker in 7. **No platform has the 192/512 px PNG icons Android needs to install.** |
| Native/Android app | **None** (no Capacitor, React Native, Expo, Flutter or TWA project in any repo). |
| How CSS reaches the page in production | 4 platforms at **risk of an unstyled or blank page** (HopeBridge, Crypto/IIP, Morphoo, SoulBridge; details in table B). This is the known failure: the static files depend on a server setting that hosting can lose. |
| Version shown to users or sent to the API | No About screen or version endpoint in a common form. `package.json` versions range from 0.0.0 to 0.4.0. |

## 3. Per-platform tables

### Table A: French and English

Columns: **Keys EN/FR** = entries in the English / French dictionaries. **Hard-coded** = user-facing English text in screens outside the dictionaries (JSX text and `placeholder`/`aria-label`/`title`/`alt`, approximate). **Est. FR coverage** = French keys ÷ (English keys + hard-coded strings). **Remembered** = device / account. **Default** = language when the browser is neither FR nor EN. **E2E runs** = Playwright projects [viewport, locale].

| # | Platform | Keys EN/FR | Hard-coded | Est. FR coverage | Switch | Remembered (device / account) | Default | E2E runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Commerce | 432/432 | 10 | ~98% | yes | session only / yes | EN | desktop-en[1366,en-US], mobile-fr[360,fr-FR] |
| 2 | VentureWorks | 612/612 | 221 | ~73% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 3 | Education | 1183/1183 | 196 | ~86% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 4 | Fleet Guard | 422/422 | 0 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 5 | Digital Tontine | 301/306 | 1 | ~100% | yes | device / not found | FR | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 6 | ADS Hub (website) | 368/368 | 52 | ~88% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 7 | Logistics | 362/362 | 0 | ~100% | yes | device / not found | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 8 | Project Management | 359/358 | 1 | ~99% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 9 | Software Factory | 683/683 | 178 | ~79% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 10 | Nutrition | 530/530 | 2 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 11 | HopeBridge | 1623/1623 | 189 | ~90% | yes | device / not found | EN | desktop-en[desktop,en-GB], mobile-fr[360,fr-FR] |
| 12 | Banking | 329/329 | 64 | ~84% | yes | device / not found | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 13 | MamaCare | 408/408 | 13 | ~97% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 14 | AfriCover Insurance | 525/525 | 4 | ~99% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 15 | Career Path | 358/358 | 1 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 16 | Morphoo | 1385/1385 | 214 | ~87% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 17 | Personal Finance (PLFI) | 317/315 | 1 | ~99% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 18 | Tourism | 424/424 | 170 | ~71% | yes | device / not found | FR | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 19 | Transport | 339/339 | 48 | ~88% | yes | device / not found | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 20 | Agriculture | 501/501 | 2 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 21 | Crypto / Investment (IIP) | 326/326 | 10 | ~97% | yes | device / investor only | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 22 | Home Services | 520/520 | 2 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 23 | Leisure & Events | 274/274 | 1 | ~100% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 24 | SoulBridge | 447/447 | 4 | ~99% | yes | device / yes | EN | desktop-en[desktop,en-GB], mobile-fr[360,fr-FR] |
| 25 | Health | 275/275 | 5 | ~98% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 26 | AfriCoreStack (retail-connect-kit) | 33/33 (dictionaries removed; `t()` returns English) | 1704 | ~2% | yes | device / yes | EN | none |
| 27 | Kit: shared sign-in + demo portal | 223/223 | 7 | ~97% | yes | device / yes | EN | desktop-en[desktop,en-US], mobile-fr[360,fr-FR] |
| 28 | RAG platform (API only) | — | 0 | — | no | — / not found | — | none |
**Flags against the language rule:**
- **Tests in one language per device (all 25 suites):** desktop runs only in English, the phone only in French. Fix: the six-run matrix in section 4 (every size in both languages).
- **Default is English (24 platforms):** change the fallback to French. Tontine and Tourism already comply.
- **Commerce** keeps the choice only for the tab: move it to `localStorage` and to the account.
- **No account sync found:** Tontine, Logistics, HopeBridge, Banking, Tourism, Transport; Crypto/IIP only for investors. Add it where the platform has signed-in users.
- **AfriCoreStack:** French is effectively missing on legacy screens (dictionaries removed). This is the largest piece of work (size L).
- **No per-language builds, routes or device-tied language were found.** The new CI check (K1) keeps it that way.

### Table B: layout, installable app, Android app and CSS delivery

**Phone / tablet / computer** = what the E2E suite proves today. **PWA** = manifest, service worker, install icons. **CSS delivery** = how the production page gets its styles.

| # | Platform | Stack | Viewport tag | Phone / tablet / computer | PWA | Android app | CSS delivery in production | Version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Commerce | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | nginx image (OK) | 0.1.0 |
| 2 | VentureWorks | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 3 | Education | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | nginx image (OK) | 0.1.0 |
| 4 | Fleet Guard | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 5 | Digital Tontine | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | nginx image (OK) | 0.1.0 |
| 6 | ADS Hub (website) | Vite+React + Tailwind | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.0.0 |
| 7 | Logistics | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | Node serves `dist` (needs build before start) | 0.2.0 |
| 8 | Project Management | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | nginx image (OK) | 0.1.0 |
| 9 | Software Factory | Vite+React + Tailwind | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist/developer-portal` under `/workspace-assets/` (base must match) | 0.1.0 |
| 10 | Nutrition | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 11 | HopeBridge | Vite+React + Tailwind | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | **RISK**: `STATIC_DIR` unset = no page (Dockerfile does not set it) | 0.0.0 |
| 12 | Banking | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 13 | MamaCare | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 14 | AfriCover Insurance | plain JS | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | no build; Node serves `src/public` (OK) | 0.2.0 |
| 15 | Career Path | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 16 | Morphoo | Vite+React + Tailwind | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | **RISK**: nginx root `/usr/share/nginx/html`, but `dist` is only copied into the API image | 0.0.0 |
| 17 | Personal Finance (PLFI) | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 18 | Tourism | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 19 | Transport | Vite+React | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | Node serves `dist` (needs build before start) | 0.1.0 |
| 20 | Agriculture | plain JS | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | no build; Node serves `src/public` (OK) | 0.4.0 |
| 21 | Crypto / Investment (IIP) | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | **RISK**: `IIP_STATIC_DIR` unset = no page | 0.1.0 |
| 22 | Home Services | plain JS | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | no build; Node serves `src/public` (OK) | 0.3.0 |
| 23 | Leisure & Events | Vite+React | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | Node serves `dist` (needs build before start) | 0.3.0 |
| 24 | SoulBridge | plain JS | yes | tested 360 / breakpoint, untested / tested | manifest, SW, no PNG icons | none | **RISK**: hand-kept asset list in `server.mjs`; a new CSS/JS file 404s | 0.3.0 |
| 25 | Health | plain JS | yes | tested 360 / breakpoint, untested / tested | —, SW, no PNG icons | none | no build; Node serves `src/public` (OK) | 0.3.0 |
| 26 | AfriCoreStack (retail-connect-kit) | Vite+React + Tailwind | yes | untested / breakpoint, untested / untested | —, —, no PNG icons | none | nginx image (OK) | 0.0.0 |
| 27 | Kit: shared sign-in + demo portal | Node pages | yes | tested 360 / breakpoint, untested / tested | —, —, no PNG icons | none | nginx image (portal) / Node (identity) (OK) | — |
| 28 | RAG platform (API only) | Node API | — | no UI / no UI / no UI | no UI | none | no UI | 0.1.0 |
**CSS delivery risks (fix before testers see them, size S each):**
- **HopeBridge:** the server serves the web app only if `STATIC_DIR` is set (`server/app.ts`: `env.STATIC_DIR || null`), and the Dockerfile copies `dist` but does not set it. Set a default of `dist` and fail start-up when the folder is missing.
- **Crypto/IIP:** the same pattern with `IIP_STATIC_DIR`.
- **Morphoo:** `deploy/nginx/morphoo.conf` serves `/usr/share/nginx/html`, but the Dockerfile copies `dist` only into the API image. Either nginx gets the built files, or the API serves them.
- **SoulBridge:** `src/server.mjs` lists every asset by hand. A new CSS or JS file returns 404 until it is added to that list.
- **All "Node serves `dist`" platforms:** a page with no build gives 404 or an unstyled page. The deploy smoke test (K3) must load one page and confirm that its CSS loaded.
- **Software Factory:** assets live under `/workspace-assets/`. The Vite `base` and the server path must stay equal; K3 checks this.

## 4. The standard every platform must meet (acceptance criteria)

The standard is a **verification test added to each platform's E2E suite** (from the kit, section 6), plus one CI unit check. A platform meets the standard when both are green in CI on `main`.

### 4.1 Test matrix
Six Playwright projects, every journey in every project:

| Project | Viewport | Locale |
| --- | --- | --- |
| phone-fr / phone-en | 360 × 740, touch | fr-FR / en-US |
| tablet-fr / tablet-en | 768 × 1024, touch | fr-FR / en-US |
| desktop-fr / desktop-en | 1280 × 800 | fr-FR / en-US |

To keep CI time reasonable, the full journeys run on phone-fr and desktop-en. The **language-and-layout verification spec** (4.2–4.4) runs on all six against the platform's list of pages, public and signed-in.

### 4.2 Language (verifies the existing switch)
For every page in the platform's page list, on every size:
1. **The switch is reachable:** visible on the page, or at most one tap away inside the phone or tablet menu. It is labelled in both languages (for example "Français" / "English") and has an accessible name.
2. **The whole page switches immediately:** after one tap, `<html lang>` changes, no reload is needed, and no visible text from the other language's dictionary remains (a leak check compares the visible text with the other dictionary's values; a short allowlist covers brand names).
3. **Remembered:** after a reload, and in a new tab, the chosen language stays.
4. **Follows the account** (platforms with sign-in): choose French in browser A while signed in; sign in with a fresh browser B and French appears.
5. **First visit:** browser `fr-FR` → French; `en-US` → English; `de-DE` → **French**.
6. **One build, no language lock:** the same URL serves both languages; no `/fr` or `/en` path, build variant or device rule decides the language.
7. **Formats follow the language:** dates, numbers and money (`XAF`/`FCFA`) are formatted for the chosen language.

### 4.3 Layout and styles
1. **Styles loaded:** every CSS and JS response is 200 with the right content type; `document.styleSheets` is not empty; a known element has the platform's computed font and colours (not the browser defaults).
2. **No horizontal scrolling:** `scrollWidth ≤ innerWidth` on every page at 360, 768 and 1,280 px.
3. **Navigation works on every size:** the phone and tablet menus open, close and reach every main section.
4. **Touch targets:** main buttons and links are at least 44 × 44 px on phone and tablet.
5. **Screenshots:** one per page per project, kept as CI artefacts for visual review. A visual-diff baseline is optional later.

### 4.4 Accessibility basics
axe-core reports no serious or critical issue on each page; every form field has a label; images have `alt`; the focus is visible; the colour contrast meets WCAG AA.

### 4.5 CI unit check (fails the build)
`ads-i18n-check` (kit, K1):
- EN and FR have the same keys; no value is empty; placeholders (`{name}`) match.
- A French value equal to the English value is reported (allowlist for brand names and codes).
- The number of hard-coded user-facing strings in screens cannot rise. Each platform starts from today's count (table A) and must reach **0** to meet the standard.
- No per-language build script, route or environment setting.

## 5. Mobile app strategy

### 5.1 Options compared

| Option | What it is | For | Against |
| --- | --- | --- | --- |
| **A. One shared Capacitor shell per platform (recommended)** | A small Android project that packages the platform's **existing web build** and adds native features | Same app and same code as the web (meets the one-app rule). One template in the kit for all 26. Works offline at start-up. Native push, camera, files, deep links and secure storage. iOS uses the same template later. | A new app release is needed to ship web changes (or a live-update service later). About 5–10 MB. The sign-in redirect needs app-link support in the kit identity service. |
| B. Trusted Web Activity (TWA) | The Play Store app opens the hosted site in Chrome, full screen | Smallest app (about 1 MB). Web changes appear at once. No separate build of the UI. | Needs Chrome on the phone (many Huawei and some low-end phones lack it). No iOS equivalent. Weak offline start. Push only through web push. Store review can reject thin wrappers. |
| C. React Native / Flutter | A separate native app | Best native feel and performance | **Rewrites 26 user interfaces** and their translations a second time. Two apps per platform, which breaks the one-app rule. Highest cost. |

**Recommendation: option A**, with TWA kept only as a fallback if a Capacitor build is blocked for a platform. Option C is not recommended.

### 5.2 How the app is built
- **Template:** `templates/app-shell` in the kit: Capacitor (current major version), an Android project and a CI workflow. Each platform adds a small `app/` folder with its app id, names, icons and colours.
- **App ids:** `com.africadigitalsynergy.<platform>` (for example `com.africadigitalsynergy.logistics`). Display names in EN and FR, such as "ADS Logistics".
- **Content:** the platform's normal web build (`dist`) is bundled. The API is called over HTTPS at the platform's public address. The app id is registered as a sign-in client in the kit, using an Android App Link for the return address.
- **Language:** exactly as on the web: the same switch, the phone language on first start (else French), remembered and synced with the account. No language-specific app.

### 5.3 Versioning
- **Version name:** semantic version per platform (`MAJOR.MINOR.PATCH`), taken from the platform's `package.json`. The web and the app use the same number.
- **Build number (Android `versionCode`):** a whole number that only goes up, from the CI run number of the platform's app workflow.
- **Shown to the user:** an **About** screen (in the account or help menu) shows the name, version, build number, date and channel (web / Android / iOS).
- **Sent to the API:** every request carries `X-ADS-Client: <platform>/<version>+<build> (<web|android|ios>)`. The API logs it.
- **Version endpoint:** `GET /api/version` returns `{product, version, build, commit, minAppVersion}`. If the app is older than `minAppVersion`, it shows an "Update the app" screen (bilingual).

### 5.4 Signing and the Play Store
- **Signing:** Google Play App Signing is turned on. The **upload key** is created by and held by the owner (password manager plus a sealed offline backup) and stored as a CI secret. It is never in a repo. Proposed: one upload key per app (losing one key then affects only that app).
- **Tracks:** every merge to `main` that passes the standard publishes to the **internal testing track** (up to 100 testers). Owner approval promotes to closed testing, then production.
- **Store listing:** names, descriptions and screenshots in EN and FR. Screenshots come from the Playwright phone and tablet runs. Each app needs a privacy policy URL and the Play data-safety answers.

### 5.5 Devices in Cameroon
- **Minimum Android:** **Android 6.0 (API 23)**, the minimum of current Capacitor. It covers almost every phone still in use. Target API level: whatever Google Play requires at upload time.
- **Low-end phones (Android Go, 1–2 GB RAM, slow data):** a performance budget per platform (first-load JavaScript ≤ 300 KB gzip, main page usable within 5 s on a 3G profile). The release APK/AAB should be at most 15 MB.
- **Phones without Google services (many Huawei models):** the APK is also offered from the ADS website (signed, same version). Push falls back to SMS. Huawei AppGallery is optional later.
- **Offline:** every app starts offline (bundled files) and shows a bilingual offline banner. Data offline uses what each platform already has (Logistics courier queue, Fleet Guard driver forms, Agriculture, MamaCare, Health). No new offline scope is added by this plan.
- **Push notifications:** phase 2, through Firebase Cloud Messaging (owner's Firebase project). SMS stays the fallback where a platform already sends SMS.

### 5.6 Other phones
- **iPhone/iPad:** the same Capacitor template adds an iOS project later. It needs an Apple Developer Program account (organisation) and a macOS build: a cloud Mac (GitHub macOS runners or a cloud build service) instead of buying a Mac. Apple reviews thin web wrappers strictly, so the platform must offer real app features (offline start, push, camera where used) before submission.
- **Any other smartphone browser:** the **PWA install** is the fallback. Every platform gets a complete manifest, 192/512 px PNG and maskable icons, and a service worker that caches the app shell (K5).
- **KaiOS and feature phones:** no separate app is planned (small and falling market share; a separate UI would break the one-app rule). Feature phones are served by **USSD/SMS** only where a platform already plans it: Digital Tontine first; Agriculture, PLFI, HopeBridge, AfriCover and SoulBridge mention USSD in their documents.

## 6. Shared pieces to build once in the kit

| # | Piece | What it does | Size |
| --- | --- | --- | --- |
| K1 | `ads-i18n-check` (CLI in `packages/`) | Section 4.5: key parity, empty values, placeholders, same-as-English report, hard-coded-string ratchet, no per-language builds. Reads JSON, TS/JS dictionaries and per-screen `{en, fr}` copy. | S |
| K2 | Language-and-layout verification spec (in `packages/e2e-kit`) | Sections 4.2–4.4 as one parameterised Playwright spec: the platform passes its page list, its switch selector and its two dictionaries. Includes the six-project config helper. | M |
| K3 | Deploy smoke test with style check | Run after every deploy: load `/`, check CSS/JS 200 and computed styles, `/api/version` reachable. Added to the shared deploy pattern of the hosting plan. | S |
| K4 | Version contract | `GET /api/version`, the `X-ADS-Client` header, About screen copy (EN/FR) and the "update the app" screen. | S |
| K5 | PWA pack | Manifest generator, icon set from one 1024 px source (192/512/maskable/adaptive), a minimal service worker for the app shell. | M |
| K6 | App shell template + CI | Capacitor Android project, signing from CI secrets, AAB build, upload to the internal track, version name and build number. iOS added later. | L |
| K7 | App sign-in support in the kit identity | App Link return addresses for app clients, registered per platform in `clients.*.json`. | M |

## 7. Order, sizes and rollout

**Step 0: CSS delivery fixes** (HopeBridge, Crypto/IIP, Morphoo, SoulBridge): S each. These come first because they block testers on the hosted platforms.
**Step 1: kit pieces** K1–K4 (about 1–2 weeks), then K5–K7.
**Step 2: the five pilot platforms** in the owner's order: Education, Commerce, VentureWorks, then Fleet Guard and Digital Tontine. Each adopts K1–K5, passes the standard and gets its Android app on the internal track.
**Step 3: all other platforms**, in groups of four or five.
**Step 4: iOS**, for the pilot platforms first, once the Apple account exists.

Per-platform size to meet the standard and ship the Android app (after the kit pieces exist):

| Size | Platforms | Main work |
| --- | --- | --- |
| **S** | Fleet Guard, Tontine, Logistics, Project Management, Nutrition, MamaCare, AfriCover, Career Path, PLFI, Agriculture, Crypto/IIP, Home Services, Leisure, SoulBridge, Health, Commerce, kit sign-in pages | Six-run matrix, French default, account sync where missing, tablet fixes found by the tests, PWA pack, app shell |
| **M** | VentureWorks, Education, Software Factory, HopeBridge, Morphoo, Tourism, Banking, Hub, Transport | The S work plus moving 48–221 hard-coded strings into the dictionaries, with French translations |
| **L** | AfriCoreStack (retail-connect-kit) | Restore EN/FR dictionaries for ~1,700 strings, add Playwright journeys at all six sizes, then the app. It follows its own governed backlog (Phase 10/11). |
| — | RAG platform | API only: no UI and no app. It adds K4 (version) only. |

Translations: the developer writes the French text with the English text. A French-speaking reviewer from ADS checks each platform's new strings before release. Regulatory or legal text is never machine-translated without that review.

## 8. What the owner must provide
1. **Google Play developer account** (one-time US$25). An **organisation** account for Africa Digital Synergy Ltd is recommended. It needs a **D-U-N-S number** and a verified website, email and phone. (A new personal account must first run a closed test with at least 12 testers for 14 days for each app.)
2. **Apple Developer Program** (US$99 per year), organisation enrollment with the same D-U-N-S number, when iOS starts.
3. **App names** (EN and FR) and **icons**: one 1024 × 1024 px source per platform (we produce all sizes), plus a 1024 × 500 px feature graphic.
4. **Signing:** custody of the upload keys (we generate them with you; you keep them).
5. **Privacy policy URL**, support email and data-safety answers per app (we draft them for your review).
6. **Firebase project** under the ADS Google account (push notifications, phase 2).
7. **Test phones:** one low-end Android (Android Go, 2 GB), one mid-range Android, one Android tablet; an iPhone later.
8. **A French-speaking reviewer** for new translations.

## 9. Owner decisions needed

| # | Decision | Recommendation |
| --- | --- | --- |
| M-D1 | App technology | Capacitor shell around the existing web build (option A); TWA only as a fallback |
| M-D2 | Which platforms get a store app, and when | All 26 with a UI. Pilot five first. Confirm whether staff tools (Software Factory, Project Management) and the Hub website also go to the Play Store or stay PWA only |
| M-D3 | Play account type | Organisation account for Africa Digital Synergy Ltd (needs D-U-N-S) |
| M-D4 | Minimum Android version | Android 6.0 (API 23) |
| M-D5 | App ids and names | `com.africadigitalsynergy.<platform>`, "ADS <Platform>" (FR names to confirm) |
| M-D6 | Signing keys | One upload key per app, held by the owner, with a sealed backup |
| M-D7 | Phones without Google Play | APK from the ADS website as well; AppGallery later |
| M-D8 | iOS timing | After the pilot five pass on Android; cloud Mac build |
| M-D9 | Push notifications | Phase 2 through Firebase; SMS fallback stays |
| M-D10 | Account language sync | Required on every platform with sign-in. The owner rule says "where possible": confirm that this means required |

## 10. Method and limits
- The script read `origin/main` of each repo (`git archive`), without switching any branch. Dictionary entries were counted from JSON locale files, `en`/`fr` dictionary objects (leaf entries) and per-screen `{en, fr}` copy. Hard-coded strings were found with a pattern for capitalised JSX text and text attributes, so the counts are approximate (they include some brand names and some sr-only text).
- Responsive status is what the tests prove plus the breakpoints found in CSS. No page was rendered for this plan: the verification spec (K2) gives the measured answer.
- "Account sync not found" means no code that saves the language to the account was found. Each case is confirmed by test 4.2-4.
