# ADS launch planning — wave 1 (planning branch, not merged)

Owner: Kengjiseh Sondo (ADS). Started 20 October 2026. **Planning only: nothing here changes any product until the owner approves.**

## Owner direction (20 Oct 2026)
- **Builds are halted** while this plan is prepared.
- **Pilot/MVP platforms (finalization builds):** Education, Commerce, VentureWorks, Fleet Guard, Digital Tontine. The first three start first.
- **Before the finalization builds, host all 20+ platforms at their present state for testers.** One landing page, with very little text, shows every sector as a button or link, and users can sign in and browse what has been built.
- **The public opportunity catalogue** will be a page on the ADS website (Hub), in a later build.
- **The master plan** is in `source/`. Gaps 1–7 below must be covered.

## Gaps the master plan does not yet cover
1. **Organisation levels:** ADS → partner → the partner's customers. The partner provisions its customers within what ADS allowed it to sell.
2. **Who owns entitlements and provisioning.** Recommended: the shared ADS identity layer (ads-platform-kit). Software Factory owns the package templates, and each product enforces them.
3. **Billing.** It needs at least a first simple version (entry fees, subscriptions); no settlement, ledger or funding engine exists yet.
4. **Public catalogue** on the Hub, in a later build.
5. **VentureWorks:** reconcile against the existing ~75%; decisions are pending.
6. **Name check:** "ADS Full-Stack Methodology v2" vs handbook v1.
7. **Legal review** of the entry-fee wording and the BNPL pilot.

## Documents in this folder
- `ACCOUNT_ACCESS_AUDIT.md`: who can create which account, how admins are created, and whether sign-up is self-service, across all repos.
- `PLATFORM_FOUNDATION_PLAN.md`: organisation levels, entitlements and provisioning, billing v1, and the methodology check.
- `VENTUREWORKS_PLAN.md`
- `COMMERCE_EDUCATION_PLAN.md`
- `FLEETGUARD_TONTINE_PLAN.md`
- `HOSTING_AND_LANDING_PLAN.md`: hosting all platforms for testers, and the landing page.
- `LAUNCH_PLAN_WAVE1.md`: the synthesis: what is in the pilot MVP vs later, the finalization build register, and the decisions needed.
