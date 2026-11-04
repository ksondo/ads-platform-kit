# ADS launch-wave fit-audit summary

**Checkpoint:** 24 October 2026, Assignment B (T-02).  
**Source:** individual platform fit-audits in this directory, principally dated 23 October 2026, and the owner’s 24 October handover.  
**Important:** these are **fit-audit observations and projected after-fix outcomes, not a fresh CI or six-viewport Playwright certification**. A “post-fix” figure must be re-tested on the named product PR and kit main (at least `c633169`) before it can be counted as a released demo journey. Do not merge a product PR on the strength of this document.

## Audits already present in the kit planning branch

| Platform | Fit verdict from audit | Finishable / built journey groups (audit baseline → anticipated after fixes) | Three leading fixes or decisions |
| --- | --- | --- | --- |
| AfriCover | Yes, with gaps | 10/13 → 12/13 (last is conditional) | Payout hand-off; ordinary claims later; demo event/persona and EN/FR completion |
| Agriculture | Yes, with gaps | 9/12 → 12/12 (farmer payout still pending) | Actual farmer payout integration; seller order hand-over; seed reviewable farms and improve region filtering |
| Banking | Yes, with gaps | 6/8 with tester-only sign-in; 8/8 needs correct operator personas | Comparable borrowing cost; officer decisions and requests; post-decision workflow |
| Career Path | Yes, with gaps | 9/10 → 10/10 | Seed approved RAG demo corpus; preserve language and translate dates; plan export or sharing |
| Commerce | Yes, with gaps | 3/5 in the *23 Oct audit*; owner reports later PR #62 merged | Bank agent's collection code; independent ADS reviewer role; checkout/delivery and online receipt gaps |
| Education | Yes, with gaps | Not quantified as a single comparable demo score in this audit | Seed term + active grading policy; fix language preference after sign-in; remedy phone/tablet overflow and test end to end |
| Fleet Guard | Yes, with gaps | Not quantified as a single comparable demo score in this audit | Give partner a workflow; exports/reports; correct demo driver assignment and untranslated server text |
| Health | Yes with gaps after branch fixes; baseline demo blocked | 0/12 → 12/12 **only with identity client secret correctly configured** | Registered sign-in return; correct kit tenants shape in demo seed; supply secret by environment and re-test staff |
| Hub | No for core cross-platform hub duty; lead capture works | 7/8 → 8/8 **conditional on a member-only kit persona** | Link real product front doors; remove/replace old banking marketing pages; member-only approval journey and responsive navigation |
| Investment | Yes, with gaps | 12/20 → 13/20 PR alone → 16/20 with kit; four depend on VentureWorks | Consented data room; founder follow-up/commitment workflow; staff roles and VentureWorks published seed |
| Logistics | Yes, with gaps | 13/16 → 15/16 | Visible recipient code in demo; approved courier and normal route quote; final missing delivery journey |
| MamaCare | Yes, with gaps | 12/14 → 13/14 in audit (owner reports PR #22 merged) | Support-desk reply role; facility-admin workflow; approved monitoring-rule seed and EN/FR persistence |
| Nutrition | Yes, with gaps | 12/14 → 14/14 on branch, **pending CI** | Nutritionist workflows (later level); food diary/recipes (later scope); finish seed and six-combination demo suite |
| Project Management | Yes, with gaps | 10/13 → 13/13 on branch, **pending CI** | Remove literal credentials immediately; editable tasks/assignments; timeline, dependencies, workload |
| Digital Tontine | Product yes, demo not yet acceptable | 11/24 fully; 5 partial; 8 blocked → **target 24/24**, unverified | Separate admin/treasurer/two approvers/beneficiary personas; tester-only mock messages and client-secret error; mobile-money group, reset and EN/FR |
| VentureWorks | Founder yes; operations/investors no | 9/13 accessible (5 with workarounds); 4 blocked → **target 13/13**, unverified | Distinguish KPI actuals from evidence approval; expose budgets/portfolio and investor evidence; complete resource-safe demo suite and six-combination CI |

## Additional Assignment B platforms without a completed fit-audit in this directory

A blank audited score **does not mean zero working journeys**. It means the source audit or fresh proof is not yet available here.

| Platform | Current verdict | Finishable / total | Three leading completion tasks from handover |
| --- | --- | --- | --- |
| Software Factory | Audit pending | Not yet verified | Create work branch from main; secure demo-seed and journey suite; audit Foundry UI (do not touch Commerce deployment files) |
| HopeBridge | Audit pending | Desktop EN reported 10/10 only; full matrix unknown | Phone FR walk; audit; CI and independent review |
| SoulBridge | Audit pending | Not yet verified | Preserve human-reviewed crisis/safety messages; EN/FR; demo journeys and audit |
| Personal Life Financial Intelligence | Audit pending | Not yet verified | Finish journey suite; audit; six-combination CI |
| Tourism | Audit pending | Not yet verified | Finish language rule; fail on skipped tests; audit and CI |
| Transport | Audit pending | Not yet verified | Finish journeys; fail on skipped tests; audit and CI |
| Home Services | Audit pending | Refund currently blocked | Fix `originalRequestId` versus kit mock `paymentId`; refund test; audit and CI |
| Leisure / Recreation / Events | Audit pending | Not yet verified | Create branch; demo journey infrastructure; audit and CI |
| Morphoo (T-21, `morphoo`) | Audit pending | Not yet verified | D-9 formation-alone wording EN/FR; demo fixtures; fit audit and PR |
| Go-Ahead Guesser (T-27, `go-ahead-guesser`) | Audit pending | Six existing branch commits reported; journey pass count unknown | Report those six commits; finish demo journeys; fit audit and PR |

## Acceptance and reporting gate

For each product, record: PR link; exact head SHA; CI run and result; journey pass count / total; 360, 768 and 1280 px × English/French coverage; outstanding or skipped journeys; demo-seed/reset outcome; kit-sign-in coverage; distinct maker/checker identities; and an independent reviewer. CI must not be relaxed or tests skipped to obtain green.

A tested journey begins at the product front door, signs in through ADS kit, and reaches the actual outcome through APIs and PostgreSQL; no credentials may be literal in code or tests. The branch's `deploy/DEMO_DATA.md` must explain safe reset and persona dependencies.

**Restrictions:** no deployments; do not touch `main` or `deploy/*` directly; do not start H-01 through H-05; do not modify the parked Contabo acceptance steps. Preserve forced RLS, restricted runtime credentials, demo-only seeds, test-only money, and two-person controls. The plan branch currently diverges from kit main; reconcile in its own reviewed PR rather than merging the entire planning branch by assumption.
