# ADS Handbook

The single place for **how ADS builds software**. Every ADS product repository follows it; Software Factory applies it when building apps for customers.

| Document | What it is |
| --- | --- |
| [ADS_SOFTWARE_DELIVERY_HANDBOOK_v1.md](ADS_SOFTWARE_DELIVERY_HANDBOOK_v1.md) | The method: roles, requirements → user stories → acceptance criteria, Definition of Ready/Done, design artefacts, testing, security, operations, review, versioning, traceability, releases, AI agents |
| [PLATFORM_REQUIREMENTS.md](PLATFORM_REQUIREMENTS.md) | Requirements every product must meet, starting with **PLAT-ID-001: one ADS account across all products** |
| [UIUX_REGISTER.md](UIUX_REGISTER.md) | The UI/UX reference for every product (monday.com for VentureWorks, Linear for Software Factory, …), proposals awaiting approval, and the ADS master design system |
| [SUPERSEDED.md](SUPERSEDED.md) | Which older standards the handbook replaces |
| [templates/](templates/) | User story, customer journeys, sequence diagram, traceability matrix, ADR, pull request, release record, requirements index, AGENTS.md |

**Shared services** that implement the platform requirements (sign-in today; roles, audit, notifications and payments next) live in [`ksondo/ads-platform-kit`](https://github.com/ksondo/ads-platform-kit). A standalone app calls those services over HTTPS, or runs its own copy of them from the same repository when a customer needs a separate installation.
