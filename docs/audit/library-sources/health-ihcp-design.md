# Library source extract: IHCP_Phased_Intended_Design_v1.0.pdf

> Candidate for Claude BRS consolidation, NOT an approved replacement. Extracted from ChatGPT Library 2026-10-19. Original document governs figures and formatting. File ID: `file_00000000376c81f4aac3f8ae9cdf1de1`.

---

<PARSED TEXT FOR PAGE: 1 / 3>
                                                                                                         ADS — IHCP (Health) Phased Intended Design — v1.0




                                                           IHCP (Health)
                              Phased Intended Design — Present Architecture First, Full Automation Later
                         v1.0 — fulfills the Blueprint's standing “design before build” requirement for Health (Section 4.2)


  Positioning: African Digital Care Infrastructure v3.0 (the full IHCP business blueprint) is real, valuable source material — but
  several of its 16 modules assume capability that doesn't exist in the current architecture yet, most notably real-time AI monitoring.
  This document splits IHCP into two honest phases: what builds cleanly on the seven engines already designed, and what genuinely
  waits until those engines reach full automation. Nothing here invents new engine capability — Phase 1 only routes to what already
  exists.


1. The Phasing Principle




                          Figure 1 — Phase 1 routes to existing engines; Phase 2 waits for engine-level automation

Phase 1 is not a stripped-down version of IHCP — it's the real, buildable version, using every module that has a genuine
home in the current seven-engine architecture. Phase 2 is not cancelled functionality — it's functionality correctly
sequenced behind the specific engine upgrades it actually depends on.




                                               Confidential — Internal Design Document | Page 1
<PARSED TEXT FOR PAGE: 2 / 3>
                                                                                                          ADS — IHCP (Health) Phased Intended Design — v1.0


2. One Decision Resolved: IHCP Billing Routes Through Commerce/POS Engine
     Resolves an open question from the earlier review: The original IHCP document doesn't specify whether facility billing uses the
     shared Commerce/POS Engine or builds its own logic. It must use Commerce/POS Engine — the same rule already governing
     every other module. Health does not become an eighth standalone POS implementation, exactly the outcome the Blueprint warned
     against.


3. Module-by-Module: Phase 1 vs. Phase 2

 #        Module                                        Phase               Routes to / Depends on

 01       Patient Identity & Records                    Phase 1             Health module's own domain data — no new engine
                                                                            needed

 02       Triage & Reception                            Phase 1             FlagForAssessment → HopeBridge Social Protection
                                                                            Engine (already formalized for Health)

 03       Doctor Consultation Workspace                 Phase 1             Health module's own domain data

 04       Nursing Operations & Ward Intelligence        Phase 1             Health module's own domain data (manual entry, not
                                                                            IoT-fed)

 05       AI Continuous Monitoring Engine               Phase 2             Intelligence & Automation Layer Roadmap — explicitly
                                                                            dormant until real production data exists

 06       Alerts & Escalation Framework                 Split               Phase 1: rule-based tiered notification. Phase 2: automatic
                                                                            alerts triggered by AI-detected deviation (depends on
                                                                            Module 05)

 07       Laboratory Integration                        Phase 1             Health module's own domain data

 08       Pharmacy & Medication Safety                  Split               Phase 1: dosage/interaction/allergy rule checks, and
                                                                            routing cost to HopeBridge when a case is active. Phase
                                                                            2: none — fully buildable now

 09       Emergency Command Centre                      Phase 1             Health module's own domain data; real-time dashboard,
                                                                            not AI-predictive

 10       Guardian Portal                               Phase 1             Support requests route to HopeBridge via the same
                                                                            FlagForAssessment path

 11       Digital Shift Handover                        Phase 1             Health module's own domain data

 12       HopeBridge Care Access Interface              Phase 1             Already exists — this module is the
                                                                            FlagForAssessment/ReceiveCaseDecision connection,
                                                                            already formalized

 13       Maternity Module                              Phase 1             Health module's own domain data; PPH protocol as rule-
                                                                            based alert, not AI-predictive

 14       Surgical & Theatre                            Phase 1             Health module's own domain data

 15       Workforce & Burnout Intelligence              Phase 1             Rule-based threshold flags (ratio exceeds X), not AI
                                                                            pattern detection — genuinely buildable now

 16       Hospital Command Centre Dashboard             Phase 1             Health module's own domain data; live reporting, not
                                                                            predictive



4. What Phase 2 Actually Requires — Named Dependencies, Not Vague “Later”

4.1 Real-Time AI Monitoring (Modules 5 and part of 6)
Depends on the Intelligence & Automation Layer Roadmap reaching Stage 2 — which itself requires Stage 1 engines to
be built and producing real transaction/observation data first. This is not IHCP-specific; it's the same standing rule
applied to every module.




                                                   Confidential — Internal Design Document | Page 2
<PARSED TEXT FOR PAGE: 3 / 3>
                                                                                                 ADS — IHCP (Health) Phased Intended Design — v1.0


4.2 Two-Tier Fund Structure and G/Y/O/R Vulnerability Scoring
The original IHCP document specifies real detail here — Tier 1 (5,000–75,000 FCFA, minutes-to-hours) and Tier 2
(75,000+ FCFA, 1–7 days), plus a five-dimension vulnerability score. None of this exists in HopeBridge Social
Protection Engine v1.4 today, which only has a generic funding_type and an unstructured vulnerability_score field.
  This is a HopeBridge enhancement, not an IHCP-only one: If built, this detail belongs in HopeBridge Social Protection Engine
  itself — it would benefit Commerce, Education, Agriculture, and Tourism's HopeBridge connections equally, not just Health's.
  Logged here as a dependency, not designed in this document.

4.3 Donor Marketplace Mechanics
Anonymous case display, micro-giving, standing donor accounts, and impact dashboards are richer than anything
currently in HopeBridge Social Protection Engine's “donor matching” responsibility. Same treatment as 4.2 — a
HopeBridge-wide enhancement, not something to build inside IHCP specifically.

4.4 Regional Vulnerability Database
Aggregated, predictive positioning of emergency fund reserves by region is analytics work — explicitly Intelligence &
Automation Layer territory, waiting on the same Stage 2 gate as 4.1.

4.5 IoT-Ready Patient Monitoring
Connected devices auto-feeding vitals into the patient record is a real hardware/integration undertaking, not just a
software gate — sequenced behind Phase 1 proving the manual-entry version works first.

5. A Separate, Unresolved Item — Not a Phase 1/2 Question
  The Part Seven financial model needs its own reconciliation: IHCP's original document includes a separate financial and
  investor-return model (infrastructure pricing by facility tier, a 5-year revenue projection, a $2.5M investor scenario showing
  218.8% cumulative return) — entirely distinct from the company-level 20,000,000 FCFA Pre-Seed ask. This isn't a phasing
  question; it's a business-coordination one. If this sector-specific pitch is still intended, it needs to be clearly scoped as separate
  from the main investor materials before either document reaches the same audience.


6. Open Design Questions Carried Forward

  •   Exact HS-style classification/threshold values for Workforce & Burnout rule-based flags (Module 15) — not yet
      specified.
  •   Exact rule thresholds for Alerts & Escalation's Phase 1 tiered notification (Module 06) — not yet specified.
  •   Whether Phase 1's Guardian Portal wellbeing flag (“registered more than five days”) should be configurable per
      facility or fixed platform-wide — not yet decided.
  •   Formal ERD and entry-point contracts for the Health module itself — this document sequences the work; it does
      not yet replace the actual technical design Module Entry Point Contracts would need for Health specifically.




                                              Confidential — Internal Design Document | Page 3