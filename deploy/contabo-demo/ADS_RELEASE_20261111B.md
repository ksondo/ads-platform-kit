# ADS demo release 20261111b: Agriculture wave 2 and the Commerce sector link (11 November 2026)

**Status: source pinned; deployment NOT executed or authorized.** This file and `ads-release-20261111b.manifest.json` supersede `ads-release-20261111.manifest.json` for the Agriculture wave 2 / Commerce sector link deployment. `release-acceptance.sh` now reads this manifest by default, so the operator no longer needs a local copy with edited SHAs.

## Exact source snapshot
Commits read from each repository's `main` through the GitHub REST API on 11 November 2026.

| Sequence | Component | GitHub repository | Pinned merged commit | Change from 20261111 |
|---|---|---|---|---|
| 1 | Isolated ADS demo Identity | `ksondo/ads-platform-kit` | `b768b47b942dd6d4b97027b753b2c610d3037bc1` | PRs #79 and #78: migration `008_service_clients.sql`, service clients, `agriculture-web` token exchange. Image `ghcr.io/ksondo/ads-platform-kit-identity:sha-b768b47b942dd6d4b97027b753b2c610d3037bc1` |
| 2 | Commerce web/API/migrator | `ksondo/ADS-Commerce-Platform` | `2d3939219f7239305ad9b9be9c9b44c2d5d19aa9` | PR #286: migration `126_sector_offers_v1.sql`, Sector Offer API. Images `ghcr.io/ksondo/ads-commerce-{api,web,migrate}:sha-2d3939219f7239305ad9b9be9c9b44c2d5d19aa9` |
| 3 | Education | `ksondo/Education-and-intelligent-services` | `bf4fb02e4c46ec370ade3cb461666b48ffac2135` | unchanged (still `main`) |
| 4 | Agriculture (AfriNourish) | `ksondo/Agriculture` | `d1370cce0180e828f5bb0240fb4c05299b186964` | PR #40: migrations 009-011; the following commit is documentation only. Image built on the host |
| 5 | Fleet Guard | `ksondo/Fleet-guard-and-intelligent-services` | `f73bfb3c0659eeeeaf2658225161ab2d9a4c77ec` | unchanged (`main` has since moved by documentation only) |
| 6 | Digital Tontine | `ksondo/Digital-tontine-and-intelligent-services` | `b2ed5240bb9825265a4d3b1aabb792f850d9f9c9` | unchanged (`main` has since moved by documentation only) |
| 7 | VentureWorks | `ksondo/africa-digital-synergy-ventureworks` | `3744e3c86fccb9ce3a570be1634e23506dcc6726` | unchanged (`main` has since moved by documentation only) |
| 8 | ADS landing/demo portal | `ksondo/ads-platform-kit` | `119eb34017029817eb237230649735a3395c5864` | unchanged: the portal is not redeployed in this release |

The only new migrations are Identity 008, Commerce 126 and Agriculture 009-011. Take a protected backup of each of those three databases, and test a restore, before its migration runs. There is no Commerce `--reset` and no seed reset.

## Sector link check
The manifest has `"sector_link": {"enabled": true, "service_clients": ["agriculture-sector-service", "commerce-sector-service"]}`. With it, `release-acceptance.sh` adds one line per service client:

    PASS sector-link       service-client         agriculture-sector-service: registered, active, reviewed scopes and audiences, secret set: yes

A client FAILs when it is missing from the reviewed `service_clients` in `config/clients.demo.json`, is not registered in Identity as a `service` client, is disabled, has scopes or audiences that differ from the reviewed list, or has no secret set. The check reads only whether a secret is set (yes/no); it never selects the secret hash and never prints a secret. Register the clients and create their secrets first, with `register-identity-client.sh` and the server-only secret step of the deployment runbook. For a release without the sector link, set `enabled` to `false` and the check reports one INFO line instead.

## Running the acceptance check

    bash deploy/contabo-demo/release-acceptance.sh --plan        # pins and service clients that will be checked
    bash deploy/contabo-demo/release-acceptance.sh               # every product, Identity and the sector link
    bash deploy/contabo-demo/release-acceptance.sh --product agriculture

Every line must be PASS (INFO lines are notes). The Agriculture image check accepts the SHA in the image tag or in the `org.opencontainers.image.revision` label of the host-built image.

## Bumping the Commerce and Agriculture pins
Commerce and Agriculture will get **one more pin update** after the open fix pull requests are merged:

- **Commerce (B1):** merchant links, so that a demo persona may sell for its organisation.
- **Agriculture (B2, B3):** sector consent, Compose pass-through of the Commerce link settings, and the seed.

The bump is one edit in a reviewed kit pull request: change the `sha` (and `pr`, `migration` and `pending_repin` where they change) of the `commerce` and `agriculture` entries in `ads-release-20261111b.manifest.json`, update rows 2 and 4 of the table above, then run the tests. The same edit as one command, from the kit checkout (replace the two placeholders with the full 40-character merge commits):

    python3 - deploy/contabo-demo/ads-release-20261111b.manifest.json COMMERCE_SHA AGRICULTURE_SHA <<'PY'
    import json, re, sys
    path, pins = sys.argv[1], {"commerce": sys.argv[2], "agriculture": sys.argv[3]}
    assert all(re.fullmatch(r"[0-9a-f]{40}", v) for v in pins.values()), "full 40-character SHAs only"
    m = json.load(open(path, encoding="utf-8"))
    for s in m["immutable_sources"]:
        if s["id"] in pins:
            s["sha"] = pins[s["id"]]; s.pop("pending_repin", None)
    open(path, "w", encoding="utf-8").write(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    PY
    python3 -m unittest discover -s deploy/contabo-demo -p 'test_release_acceptance.py'

The test checks the pins against this file, so it fails until rows 2 and 4 above show the new commits; update them in the same pull request.

## Release gate record
- [ ] Protected snapshots and isolated restore verification for Identity, Commerce and Agriculture
- [ ] Owner/operator and independent security approval of the exact SHAs and image digests
- [ ] Identity migration 008, Commerce migration 126 and Agriculture migrations 009-011 verified
- [ ] `agriculture-sector-service` and `commerce-sector-service` registered, with secrets stored on the server only
- [ ] `release-acceptance.sh` all PASS, including both `sector-link` lines
- [ ] Commerce and Agriculture re-pinned after the B1-B3 fix pull requests merge

**Handoff:** All boxes start unchecked. Merging this file does not deploy, migrate, register clients or create secrets.
