# AGENTS.md — <product>

Instructions for anyone (human or AI agent) changing this repository.

1. Follow the **ADS Software Delivery Handbook**: https://github.com/ksondo/Software-Factory/blob/main/docs/handbook/ADS_SOFTWARE_DELIVERY_HANDBOOK_v1.md
2. Requirements: `docs/requirements/README.md` names the canonical BRS/FRS. Do not create parallel versions; change the baseline through the Product Owner.
3. Platform requirements (shared ADS sign-in, roles, audit, EN/FR, accessibility): Software-Factory `docs/handbook/PLATFORM_REQUIREMENTS.md`.
4. Work one user story at a time on its own branch (`feat/US-<id>-...`). Stories and acceptance criteria: `docs/backlog/`. Journeys: `docs/journeys/`.
5. Every acceptance criterion needs a test. Update `docs/traceability/TRACEABILITY.csv`.
6. UI must follow `docs/uiux/UIUX_REFERENCE.md` and handle loading, empty, error, denied, success and offline states, in English and French.
7. Never commit secrets or demo passwords. Never weaken a test or security rule to get CI green.
8. Never approve or merge your own pull request. Report evidence honestly: merged ≠ CI green ≠ deployed ≠ accepted.
9. Stop and ask when requirements are unclear, conflicting, or a change cannot be undone.
