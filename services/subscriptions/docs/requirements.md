# SH-1-S01: versioned tariff and entitlement API foundation

Technical enabler within the user-authorised SH-1 brief, read with Commerce's working baseline, COM-ADOPT-05 and the ADS Software Delivery Handbook. The complete package also requires screens, notifications, renewal and browser acceptance, which this story does not claim.

As an ADS operator, I configure product plans and tariff versions so that an organisation agrees to a known price and receives only its current entitlements.

| Acceptance | Given / when / then |
| --- | --- |
| SH1-AC-01 | Given an untrusted, wrong-audience or expired token, when it calls the service, then it cannot read or administer plans. Operator administration requires signed operator audience/role, staff claim and configured staff tenant. |
| SH1-AC-02 | Given an operator creates free and paid tariffs, when an authorised customer selects one, then zero price activates without payment and a positive price stays pending with no entitlement. No production price is seeded. |
| SH1-AC-03 | Given an appended tariff version, when a customer selects with a stale tariff ID, then it is refused; existing subscription terms stay unchanged. Future tariff versions apply only from their effective time. |
| SH1-AC-04 | Given simultaneous retries, when the same tenant/user/product/operation/key and body recur, then one subscription and audit record exist; reused keys for changed bodies conflict, while different products have separate replay scopes. |
| SH1-AC-05 | Given another tenant or product, when it reads or cancels a subscription, then no foreign record is returned. Runtime PostgreSQL RLS enforces the same scope, snapshots/audit cannot be overwritten, and pending paid access cannot be activated. |
| SH1-AC-06 | Given a newer effective eligibility rule, when an excluded organisation selects, then it cannot fall back to the old tariff. |
| SH1-AC-07 | Given overlapping grants, when entitlement is queried, then only active intervals contribute, unlimited wins over numeric limits, and cancellation/expiry/future start grants no access. |

Every criterion maps to the automated API/database suite in `TRACEABILITY.csv`. English/French human-readable errors are returned; UI/mobile/hosted-login acceptance is a separate remaining slice. Shared identity manages users/tenants/roles. No Agriculture/VentureWorks account is required, and no Education entitlement tables are copied.
