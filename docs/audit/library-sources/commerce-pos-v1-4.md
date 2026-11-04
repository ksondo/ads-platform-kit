# Library source extract: Commerce_POS_Engine_Intended_Design_v1.4-2.pdf

> Candidate for Claude BRS consolidation, NOT an approved replacement. Extracted from ChatGPT Library 2026-10-19. Original document governs figures and formatting. File ID: `file_000000001304820d93fb8683511e7396`.

---

<PARSED TEXT FOR PAGE: 1 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Commerce / POS Engine
One Engine, Sold as Two Services — Commerce and POS
Intended Design — v1.4 (adds BNPL payment option and Landed-Cost Calculation Engine reference to Commerce)
What changed from v1.3: Two additive connections to engines designed elsewhere in this project, which had been 
discussed and agreed but never actually written into this document: (1) BNPL is now named as a payment option inside 
the existing PaymentMethodPicker step, alongside Mobile Money/Orange Money/card. (2) A note in Section 4 explains 
that pricing for a listing involving an imported good is sourced from the Landed-Cost Calculation Engine, not set 
manually. A third connection point — Goods Provenance Verification gating a listing before it goes live — is NOT 
designed here, since no listing-creation flow exists anywhere in this document to attach it to. That gap is logged as a new 
open question in Section 9 rather than designed prematurely. Sections 1–3, 5–8 are otherwise unchanged from v1.3.
1. Positioning — One Engine, Not Several Systems
There is one shared selling engine, to be sold as two services: Commerce (customer self-service, online) and POS 
(staff-assisted, in person or via a web browser). Market Concierge is a feature within Commerce, not a third product. 
Every ADS module (Agriculture, Education, Health, Tourism, etc.) and every external partner is intended to plug into 
this same engine rather than building its own selling logic. Section 2 below confirms this consolidation has not 
happened yet — today, each module has its own separate implementation.
Figure 1 — One engine, exposed through Commerce, POS, ADS modules, and external partners (target state)
2. Verified Current State (From v1.2)
The following is confirmed by direct inspection of the repository — file paths, line numbers, and code snippets — not 
by summary or memory reference. This section exists to make the gap between target and current state explicit and 
checkable.
2.1 The Shared Engine Does Not Exist Yet
Six sectors (Commerce/Shop, Agriculture, Education, Tourism, Mobi, Health) each have their own separate POS 
implementation. Each stores sale line items as its own JSON blob column rather than a shared relational table, and each
has its own sequential-receipt RPC (e.g. edu_next_pos_receipt, agric_next_pos_receipt, health_next_pos_receipt). This
confirms the original technical audit's finding and the architecture proposed in Sections 3-6 below is necessary, unbuilt 
work — not, as one prior report claimed, already-shipped functionality.
Confidential — Internal Design Document | Page 1
<PARSED TEXT FOR PAGE: 2 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
2.2 Credit Scoring Engine — Real, and More Specific Than Proposed
A working credit engine already exists (supabase/functions/credit-score/index.ts). v1.1 proposed a new 3-factor model 
(transaction consistency, settlement success ratio, revenue contribution) as if starting fresh. It should instead extend the 
real engine below.
Factor Point bands (90-day window)
Base score 300
Transaction frequency (count) ≥50 → +150 | ≥30 → +100 | ≥15 → +60 | ≥5 → +30
Consistency (unique active days) ≥60 → +100 | ≥30 → +70 | ≥15 → +40 | ≥5 → +20
Average transaction value (FCFA) ≥50k → +100 | ≥20k → +70 | ≥10k → +40 | ≥5k → +20
Total volume (FCFA) ≥5M → +100 | ≥2M → +70 | ≥500k → +40 | ≥100k → +20
Inventory ratio (in-stock / total) ≥0.9 → +100 | ≥0.7 → +70 | ≥0.5 → +40 | ≥0.3 → +20
Cap: 950. Bands: ≥800 Excellent, ≥700 Good (loan eligibility gate), ≥500 Fair, else Poor. Max loan = total volume × 
30%.
Critical caveat: This engine reads only the root transactions table — it is currently blind to all Education, Agriculture, 
Tourism, and Mobi sales, since those write to their own separate tables (see 2.1). A merchant with strong sales only in 
Agriculture would score as if they had no history at all. This resolves automatically once the shared-ledger consolidation 
in Sections 3-6 is built — it is not a separate fix.
2.3 Three Confirmed Defects — Independent of the Redesign
These are real, current-production issues. They should be fixed regardless of the shared-engine timeline, since they 
affect live data integrity today.
Defect Evidence Fix
VAT fallback writes wrong tax fiscal-constants.ts correctly defines 19.25%, but 
transaction-processing/index.ts and 
offline-pos-sync/index.ts hardcode a 5% fallback (amount
× 0.05) whenever tax_amount is omitted
Remove the fallback; hard-fail or 
default to the real 19.25% constant
Receipt sequencing not enforced 
server-side
Atomic next_receipt_number(p_tenant_id) RPC exists per
sector, but neither main edge function calls it — receipts 
are minted client-side
Call the existing RPC from the 
edge function path, not the client
Manager PINs stored in plaintext, 
with a hardcoded default
tenants.manager_pin is a raw text column; 
POSVoidRefundModal.tsx falls back to a literal "1234" 
when unset. Only MobiCoreStack hashes PINs (SHA￾256, still too fast for a 4-digit PIN)
Move all sectors to pin_hash 
(bcrypt/scrypt); remove the 
"1234" fallback entirely
2.4 Line Items as JSON, Not a Relational Table
The developer guide describes pos_transaction_items as a normalized child table; no migration creates it. Every sector 
stores line items as a jsonb column (items jsonb NOT NULL DEFAULT '[]'::jsonb). This is an architectural choice, not 
a bug — it should be documented as the actual current design, with the tradeoff noted: stakeholder dashboards 
currently do product-level roll-ups indirectly via inventory_movements rather than a direct JOIN on product_id.
Confidential — Internal Design Document | Page 2
<PARSED TEXT FOR PAGE: 3 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
2.5 Additional Findings Requiring Follow-Up
• Dashboard route aliasing — most Merchant/Bank/Regulator sub-routes mount the same shared dashboard 
component rather than independent route components. Not yet confirmed whether this means content switches 
internally by URL (acceptable) or that some linked features are placeholders (a real gap).
• Health route protection — some Health facility/patient routes may be mounted directly without being wrapped in 
ProtectedRoute or a sector-specific gate at the central routing level. Not yet confirmed either way; needs direct 
verification given the sensitivity of health data.
3. The Shared Engine (Target Architecture)
This is the design to build toward, per Section 2.1's confirmation that it does not exist today. Every sale, regardless of 
front, module, or partner, should converge on one immutable ledger.
Figure 2 — CommerceAdapter interface, shared engine, and per-module implementations (target)
Reading this diagram: POS and Commerce are intended to be co-equal peers into this engine — neither subordinate to 
the other. Every module (Shop, Agric, Process, Edu, Health) would implement the same CommerceAdapter interface, so 
the engine itself never contains vertical-specific logic.
4. Commerce — Customer Self-Service
4.1 Standard Online Storefront
The customer browses, adds to cart, pays, and receives confirmation — entirely remote, no staff involved.
Confidential — Internal Design Document | Page 3
<PARSED TEXT FOR PAGE: 4 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 3 — Commerce entity-relationship diagram (target)
Confidential — Internal Design Document | Page 4
<PARSED TEXT FOR PAGE: 5 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 4 — Standard online checkout sequence (target)
New in v1.4 — BNPL as a payment option: The PaymentMethodPicker step shown above already supports Mobile 
Money, Orange Money, and card. BNPL (Buy Now, Pay Later) is added as one more option in that same step — selecting 
it triggers a FundingRequest to Funding Engine before the sale finalizes, the same merge point every other funded 
payment method already uses. No new cart, checkout, or ledger is introduced.
New in v1.4 — Landed-Cost Calculation Engine as a pricing source: For a listing involving an imported good (e.g. a 
phone, a vehicle sold through Mobi), the price shown to the buyer is sourced from the Landed-Cost Calculation Engine 
(see Clearance Verification & Landed-Cost Engines), not set manually by the merchant. This is a pricing-source 
connection only — the checkout flow itself is unchanged.
4.2 Market Concierge — On-Site Instant Fulfillment
A Commerce feature, not a separate system: the customer checks in near a market or supermarket, orders online while 
seated — potentially spanning several vendors — and a Runner physically collects the items for pickup or delivery.
• Multi-vendor market case (e.g. Mokolo): a rest point 5 minutes from the market; a Runner assembles one basket 
spanning several independent stalls.
• Single-vendor instant pickup case (e.g. a supermarket): outdoor kiosks at the store itself; an internal picker fulfills
from that store's own stock.
Runner engagement supports two coexisting modes: system_assigned (the original v1.2 model) passively assigns a 
specific Runner to the order. runner_claimed (v1.3) broadcasts the order to available Runners, who actively 
accept/claim it — the same real-time marketplace pattern used by Yango. Neither replaces the other; assignment_mode 
is set per order.
Also from v1.3 — ETA and delivery-vs-pickup: the order carries an estimated_ready_minutes shown to the customer at
confirmation. Separately, fulfillment_method distinguishes customer_pickup (the original model) from 
runner_delivered or owner_delivered.
Confidential — Internal Design Document | Page 5
<PARSED TEXT FOR PAGE: 6 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 5 — Market Concierge entities (v1.3: adds Runner availability_status, assignment_mode, estimated_ready_minutes,
fulfillment_method)
Confidential — Internal Design Document | Page 6
<PARSED TEXT FOR PAGE: 7 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 6 — Market Concierge fulfillment sequence (v1.3: both assignment modes and both fulfillment methods shown)
5. POS — Staff-Assisted Selling
A staff member serves the client and issues a receipt, at a dedicated terminal or, in the newer web-based front, from any
browser with no dedicated hardware.
Confidential — Internal Design Document | Page 7
<PARSED TEXT FOR PAGE: 8 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 7 — POS entity-relationship diagram, covering both terminal types (target)
Figure 8 — POSFront interface: hardware and web shells sharing one engine (target)
Confidential — Internal Design Document | Page 8
<PARSED TEXT FOR PAGE: 9 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 9 — Hardware POS sale sequence
Figure 10 — Web-based POS sale sequence (no dedicated hardware)
6. Module Integration and External Partners
Each ADS module is intended to implement CommerceAdapter directly, in-process. An external organization with its 
own system (e.g. a hospital's EMR) is architecturally different — it needs a real API boundary, not an internal 
interface.
Figure 11 — Partner system, integration boundary, and the shared engine
Confidential — Internal Design Document | Page 9
<PARSED TEXT FOR PAGE: 10 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Confidential — Internal Design Document | Page 10
<PARSED TEXT FOR PAGE: 11 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Figure 12 — Partner integration entities
Figure 13 — Partner catalog exposure sequence
Figure 14 — Sale notification back to partner sequence
7. Data Dictionary
7.1 Core Engine (target)
Field Type Description
merchant_id string (PK) Any seller across the platform
sale_id string (PK) Unique sale, regardless of which front generated it
tenant_kind string Adapter routing key — 
shop/agric/edu_school/health_facility/market_concierge/partner_*
entry_id (Ledger) string (PK) Immutable ledger entry, target design — does not exist as a cross￾sector table today (Section 2.1)
payment_method enum (UPDATED 
v1.4)
momo / orange_money / card / bnpl — selecting bnpl triggers a 
FundingRequest before the sale finalizes
7.2 Credit Score (verified, real)
Field Type Description
score int 300–950, additive across 5 factors (Section 2.2)
eligibility_gate int 700
max_loan float total_volume × 0.3
Confidential — Internal Design Document | Page 11
<PARSED TEXT FOR PAGE: 12 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Field Type Description
source_table string Currently root transactions only — blind to other sectors until 
ledger consolidation
7.3 Market Concierge (target)
Field Type Description
location_id string (PK) The rest area / kiosk / lounge where customers check in
session_id string (PK) One customer's visit — check-in to collection
order_id string (PK) A Concierge order, may span multiple merchants
runner_id string (PK) The person fulfilling the order; employer OPEN
assignment_mode enum system_assigned / runner_claimed — both coexist, set per order
estimated_ready_minutes int Shown to the customer at order confirmation
fulfillment_method enum customer_pickup / runner_delivered / owner_delivered
availability_status enum available / en_route / busy — on the Runner record
7.4 Partner Integration (target)
Field Type Description
partner_id string (PK) The external organization
exposed_service_id string (PK) A specific service/item the partner is willing to sell
auth_method string OPEN — not yet designed
8. Immediate Priority Fixes (Independent of the Redesign)
These do not wait for the shared-engine refactor — they are live defects to fix now:
• Remove the 5% VAT fallback; use the real 19.25% constant or hard-fail (Section 2.3).
• Wire transaction-processing and offline-pos-sync to call next_receipt_number server-side instead of trusting 
client-minted receipt numbers (Section 2.3).
• Move manager PINs to a hashed pin_hash column (bcrypt/scrypt) across every sector; remove the "1234" default 
fallback (Section 2.3).
9. Open Design Questions
Import/Export Listings (New in v1.4)
Not yet designed: Goods Provenance Verification is meant to gate an imported-good listing before it goes live — but no 
product/listing-creation flow exists anywhere in this document to attach that gate to. Every section here starts from 
“customer browses catalog” onward; how a product enters that catalog in the first place was never designed. This needs 
either a real listing-creation flow design, or continued honest tracking here as unresolved — it should not be assumed 
solved.
Confidential — Internal Design Document | Page 12
<PARSED TEXT FOR PAGE: 13 / 13>
ADS — Commerce/POS Intended Design — Data Model, UML & Sequence Diagrams — v1.4
Verification follow-ups
• Confirm whether dashboard route aliasing (Section 2.5) reflects internal tab-switching or missing independent 
features.
• Confirm whether Health routes are consistently wrapped in ProtectedRoute or a sector gate (Section 2.5).
Market Concierge
• Who employs the Runner — ADS-managed, location-operator staff, or either depending on deployment?
• Does a multi-vendor basket need per-vendor payment splitting, or does the location operator pay each stall and 
mark up one service fee?
• What happens if one vendor in a multi-vendor basket is out of stock mid-fulfillment?
• If runner_claimed and no Runner accepts within a reasonable window, what happens — automatic fallback to 
system_assigned, or escalation to a human dispatcher?
• Does estimated_ready_minutes need to update dynamically once a Runner is en route, or is the initial estimate 
shown once and left fixed?
POS
• Web POS authentication and session security — explicitly out of scope by direction; needs a dedicated pass 
before real deployment.
• Offline behavior for web POS in low-connectivity areas.
Commerce (core)
• Guest checkout vs. required account.
• Delivery hand-off to Logistics — assumed as a future integration point, not designed here.
External Partner Integration
• Authentication and authorization method — not evaluated.
• Data ownership and privacy for partner-exposed services tied to sensitive interactions (e.g. a hospital service).
• Failure handling and retry policy for sale notifications back to a partner system.
Market/Module Overlap
• Does Market Concierge's Runner/pickup logic overlap with the existing serv and logi modules' dispatch and 
OTP-handover patterns? Recommend auditing serv/logi before building new Concierge-specific tables.
Shared / Cross-Cutting
• Split-settlement ordering (repayment first, platform fee second, remainder to merchant) — confirm this is the 
order to implement.
• TaxSummary generation cadence — monthly batch today, real-time event-stream once DGI's own 
interoperability protocol is published.
Confidential — Internal Design Document | Page 13