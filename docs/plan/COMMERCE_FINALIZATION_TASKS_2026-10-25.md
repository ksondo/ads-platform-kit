# ADS Commerce: every task needed to finalise the platform (25 Oct 2026)

**Baseline:** Commerce main `34c263e`, which now holds the restoration plan R0–R10, the 117-row RCK parity checklist
(59 partial, 58 missing) and the Map as the fourth top-level entry.

**Status values:** Done · In progress · Not started · Owner (needs you) · Later (after go-live).

## 1. Foundations
| ID | Task | Status |
|---|---|---|
| R0-1 | Protect the history of the 32 database changes (PR #64) | Done |
| R0-2 | Server decides the merchant menu from roles (PR #66) | Done |
| R0-3 | Parity checklist and restoration plan (PR #63) | Done |
| R0-4 | Re-run today's 15 Commerce demo journeys on current main; map each checklist row to its API, database table and test | Not started |
| R1-1 | One business owns several shops; each shop has branches/tills and its own stock location | Not started |
| R1-2 | Shop public name (slug), photos and logo, owner opt-in to the marketplace and to the map | Not started |
| R1-3 | Product photos (upload, size and type limits) | Not started |
| R1-4 | Same product stocked in several shops, stock counted per shop; POS and online shop share that stock | Not started |

## 2. Target 3: touch POS (`/merchant/pos`)
| ID | Task | Status |
|---|---|---|
| C1-1 | Full-screen POS: product tiles with photos, category tabs, favourites, search/scanner | Not started |
| C1-2 | Basket panel that stays open for the client until checkout (+/−, remove, clear, hold/resume) | Not started (hold exists) |
| C1-3 | Shift: opening float, cash in/out, X report, close with cash count, Z report, variance | Not started |
| C1-4 | Split payment: cash + MoMo + Orange (test mode), sale completes only when every part succeeds | Not started |
| C1-5 | Discounts and price overrides: cashier up to 10%, manager PIN above | Not started |
| C1-6 | Receipt screen (print/share, server receipt number) | Partial (browser print) |
| C1-7 | Customer-facing second screen `/merchant/pos/display` | Not started |
| C1-8 | Touch sizes, sounds, keyboard/scanner shortcuts; tablet 1024×768 and phone 360 | Not started |
| C1-9 | Partial returns and corrections, customer lookup at the till | Not started |
| C1-10 | Keep what v2 already does: refunds with manager PIN, offline queue, cash batches to bank | Done (to keep) |

## 3. Target 2: each shop's own storefront (`/shop/<name>`)
| ID | Task | Status |
|---|---|---|
| C2-1 | Finish the themes branch: theme, logo, cover, banner, promotions, QR poster/share link | In progress (WIP branch) |
| C2-2 | Public `/shop/<name>` page showing only that shop, with its own basket and checkout | Not started |
| C2-3 | Product page with photos, description and "Add to basket" | Not started |
| C2-4 | Owner chooses: shop alone, or also in the ADS marketplace | Not started |

## 4. Target 4: Map (top-level entry)
| ID | Task | Status |
|---|---|---|
| C3-1 | Finish the map branch: shop directory, sectors, region/city, "near me", list/map switch, clustered pins | In progress (WIP branch) |
| C3-2 | Map start page: search by address, street, area, shop name or category | Not started |
| C3-3 | Shop card: photo, open/closed, "Visit shop", "Directions", "Sign in" | Not started |
| C3-4 | After sign-in: open the records the user's role allows (e.g. manager → that shop's stock and discrepancies) | Not started |
| C3-5 | Privacy: only owner-published locations; option to show neighbourhood only | Not started |
| C3-6 | Map tiles: a tile provider or cached tiles on the ADS server (free OpenStreetMap servers can't carry public traffic) | Owner (choose/budget) |
| C3-7 | Administrator and regulator views (needs a signed agreement with the authority, read-only, logged) | Later |

## 5. Target 1: unified marketplace (`/commerce`)
| ID | Task | Status |
|---|---|---|
| C4-1 | Home with shop directory and photos, featured shops, categories, products with photos | Not started |
| C4-2 | Business page listing all its shops; owner picks which shops and products appear | Not started |
| C4-3 | Basket across several shops: today one request per shop. Decide: keep, or one checkout split per shop | **Owner decision** |
| C4-4 | Payment choice at checkout: cash on pickup/delivery (real); MoMo/Orange/card (test mode) | Not started |
| C4-5 | Online-order receipt | Not started |
| C4-6 | Returns, disputes and ratings | Not started |
| C4-7 | Delivery with a real address (today an "opaque destination reference") | Not started |

## 6. Interface clean-up and broken items (fit audit)
| ID | Task | Status |
|---|---|---|
| C5-1 | Remove "What comes next / Operations roadmap" and "Upcoming capabilities" | Not started |
| C5-2 | One test-mode notice only; remove repeated warning sentences | Not started |
| C5-3 | Real shop and product photos instead of the generic illustration | Not started |
| C5-4 | Header shows the user's name; rename "Browse Commerce V2 marketplace" | Not started |
| C5-5 | Menu links to the merchant, POS, bank and review screens for each role | Not started |
| C5-6 | Demo bank agent ≠ bank officer, so bank collection completes (B1) | Not started |
| C5-7 | Demo reviewer role exists (R1) | Not started |
| C5-8 | Staff invitations (M5) | Not started |
| C5-9 | Full French translation and 360/768/1280 layout for every new screen | Ongoing rule |

## 7. Roles and admin panels
| ID | Task | Status |
|---|---|---|
| R7-1 | Separate workspaces: business owner, shop/storefront manager, cashier/manager, accountant, bank, reviewer, ADS platform admin | Not started |
| R7-2 | Manager limited to assigned branches (today: whole business) | Not started |
| R7-3 | Cashier limits; a different person approves refunds, discounts and shift close | Partly (manager PIN) |
| R7-4 | Invite, remove and reassign staff; access ends immediately | Not started |
| R7-5 | Marketplace operator and contracted e-commerce operator roles (only with a signed, revocable agreement) | Later |

## 8. Later (after go-live, from RCK specifications)
| ID | Task | Status |
|---|---|---|
| R8 | Gate 8: wholesale, head office/multi-branch, investor views | Later |
| R9 | ERP extras: purchase orders, transfers between shops, expiry/lots, variants, units, landed cost, bundles | Later |
| L-1 | Real payment providers (MoMo/Orange/card) live, after partner contracts and any licence | Later / Owner |
| L-2 | Courier partner delivery | Later / Owner |
| L-3 | Fiscal receipts if required by tax rules | Later / Owner |

## 9. Go-live on Contabo (the Commerce gate)
| ID | Task | Status |
|---|---|---|
| G-1 | Server operator installs and verifies the deploy wrappers in `/usr/local/sbin/` | Owner/server |
| G-2 | Software Factory approved Commerce version updated (`98bbb80` → the release SHA) | Not started |
| G-3 | Port 18090 clash: identity vs business-opportunities | Not started |
| G-4 | `DEMO_PERSONA_PASSWORD`, `demo-bootstrap`, `demo-orgs`, kit mocks running, demo seed loaded | Owner/server |
| G-5 | 8 server smoke checks pass | Not started |
| G-6 | Claude's live acceptance: portal → sign-in → shopper, merchant, reviewer, POS cashier, bank collection, EN/FR on 3 devices, nightly reset. Add: the 4 entry points, and single sign-on into a second app | Not started |
| G-7 | Portal fixes (`CODEX_PORTAL_TASKS_2026-10-25.md`), incl. removing matchmaking | Not started |
| R10 | Full certification: two-business browser→API→database proof, backups and restore tested, security gates, exact release SHA signed off | Not started |

## 10. Decisions and actions for you (owner)
| ID | Item |
|---|---|
| O-1 | C4-3: one checkout for a basket across several shops, or one request per shop? |
| O-2 | C3-6: map-tile provider and budget |
| O-3 | Yaoundé office address for the portal contact |
| O-4 | Payment partners (MTN MoMo, Orange Money, card) and whether a payment licence is needed |
| O-5 | GitHub: allow deleting merged branches; enable automatic deletion of merged head branches |

**Order of build:** R0-4 → (R1 and C1 in parallel) → C2 and C3 → C4 → C5 alongside → R7 → Go-live G-1 to G-6 → R10.
Every task is one small PR, with green CI and Claude's review, and screenshots of what changed for the user.
