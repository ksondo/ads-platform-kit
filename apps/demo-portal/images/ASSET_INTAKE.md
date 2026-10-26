# ADS portal image acceptance — pending owner/licence review

**Historical PR #34 status: not supplied and not release-certified.** Existing Unsplash CDN backgrounds are inherited from the prior portal build. They are **not** evidence of a locally hosted, licensed, optimized photo library. Do not claim P4-1–P4-4 complete until actual assets are reviewed.

## Required photographs

Provide a real African business photograph for each of the 13 public business groups:

| Key | Subject |
|---|---|
| business-agriculture | African crops/farming or livestock |
| business-processing | Real small-scale food or wood processing |
| business-commerce | African market, shop or merchant |
| business-construction | Construction work in Africa |
| business-mobility | Transport, courier or logistics |
| business-tourism | Tourism or hospitality work |
| business-education | Classroom, training or education |
| business-health | Clinic or community healthcare |
| business-services | Personal/professional service provider |
| business-finance | Banking, savings or microfinance setting |
| business-communities | Community or nonprofit project |
| business-technology | African IT/business team |
| business-environment | Recycling, waste or environmental operations |

Supply a photograph for all 25 platform cards or approve reuse of a relevant sector image. Avoid stock photos that depict unrelated or inaccurate African settings.

## Provenance and privacy gate

For every proposed real photograph, record its exact source URL, photographer, licence/terms URL, download date, and any required attribution in **`images/CREDITS.md`**, created alongside approved files. Source should be ADS-owned or a legally usable photo under its applicable licence (e.g. an individually verified Unsplash/Pexels free photo). Image search previews alone are **not** a licence grant.

For Commerce E-commerce and POS, capture screenshots of the **real hosted demo** using synthetic customer, merchant and transaction data only, with any phone numbers, email addresses and account identifiers absent or redacted. The current PR includes **no** such app screenshots.

## Technical acceptance for a future PR

- Locally host assets under `apps/demo-portal/images/` and remove CDN photo dependency from generated cards.
- Encode WebP, ideally ≤100 KB each, set real width/height, `loading="lazy"`, and meaningful per-language alt text when an image conveys content; otherwise use empty alt.
- Keep overall first-view transfer around ≤1.5 MB measured in the browser, including fonts/scripts.
- Preserve the existing strict CSP. Do not introduce unsafe inline image styles.
- Visually inspect images at 360/768/1280 and EN/FR for crops, contrast, licence/provenance and identifiable people.

No images from this checklist have been copied or fabricated in PR #34.
\n
## 25 October 2026 — portal image-curation follow-up (PR #36)

The portal now maps 25 distinct images to the 25 platform cards and assigns explicit category imagery to 13 business groups and eight institutional groups. Seventeen Cameroon-relevant photographs have individually documented Wikimedia Commons author/source/licence attribution in [CREDITS.md](CREDITS.md), also exposed in the portal's `/photo-credits` route.

**Important:** images are provider-served resized thumbnails, not local WebP assets. This is an editorial diversity/attribution improvement, not P4 self-hosted image or network byte-budget certification. Existing Unsplash editorial photos remain under their separate site licence. Do not claim licensed e-commerce/POS app screenshots have been collected. Next acceptance: verify actual images/crops over Contabo HTTPS and performance; optionally self-host compressed files with retained attribution.
