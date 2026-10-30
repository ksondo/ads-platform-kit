# ADS Portal — recovered independent manual promotion controller
**Status 30 Oct 2026: source recovery for code review and regression tests. NOT deployed or invoked.**

## Background
The current ADS public portal is implemented here in `apps/demo-portal` and is **not** a Software Factory application. Historical Factory `scripts/deploy/ads-demo-portal-release.py` added guarded publication logic but its 26 Oct 2026 automated run [40297860657](https://github.com/ksondo/Software-Factory/actions/runs/40297860657) failed at the portal step after the independent Commerce deployment passed.

This PR copies/adapts the prior *publisher* and its regression tests to its proper source owner without adding automatic deployment. The controller expects `/opt/ads/demo-platform-kit` and existing isolated portal assets/variables, checks approved Git tag sources, canary, public catalogue, Commerce links, and Business Opportunities API readiness. It does **not** change Commerce databases, identity or Nginx, nor does it authorize customer traffic.

## Safe workflow
- Existing `deploy/contabo-demo/deploy-portal.sh` and `RUNBOOK.md` remain authoritative for current manual deployment.
- The recovered candidate runs only on an **explicit operator command** `python3 deploy/contabo-demo/portal-owner-release.py --apply-approved-demo-portal` **after** real VPS review. Its default no-flag invocation fails closed.
- Tests are static/non-network: `python3 -m py_compile deploy/contabo-demo/portal-owner-release.py` and `python3 -m unittest discover -s deploy/contabo-demo -p 'test_portal_owner_release.py' -v`.
- No GitHub workflow here invokes the candidate to publish anything; static CI is test-only.
- Before deciding whether to replace `deploy-portal.sh`, reconcile the candidate's source-promotion/idempotency/rollback logic with the current portal code and the **known 26 Oct `Portal command failed: node`**. Investigate that root cause and test with the actual Opportunities API, current catalogue and approved images. Do not use the recovered controller merely because a unit test passes.
- Control source SHA/digest, privileged operator access, backup and rollback independently of Factory. Preserve historical Factory script until a supervised successful owner-repo release and approval.
- Commerce and Education independently deploy from their own repos; a landing-page link activates only after that product passes public HTTPS/OIDC/UI/API acceptance.

**Acceptance:** reviewed portal repo source releases manually to Contabo without a Factory checkout, Factory scheduled job or Factory application, while existing login, Commerce and business opportunities continue working.
