# US-<id> <short title>

**Epic:** EP-<id> · **Traces to:** FR-<id> (BR-<id>) · **Journey:** <journey name> · **Priority:** Must / Should / Could · **MVP:** yes / no

> As a **<role>**, I want **<capability>** so that **<outcome>**.

## Acceptance criteria
- **AC-<id>-1** Given <context>, when <action>, then <observable result>.
- **AC-<id>-2** (unhappy path) Given <failure or invalid input>, when <action>, then <safe result and clear message>.
- **AC-<id>-3** (access) Given a user without the required role, or from another organisation, when <action>, then access is denied and the attempt is audited.

## Design references
- Screen: <docs/uiux/... or reference product pattern>; states: loading / empty / error / denied / success / offline
- Sequence diagram: <docs/design/sequence/<journey>.md>
- API: <METHOD /path> in docs/api/openapi.yaml
- Data: <table(s)>, migration <NNN_name.sql>

## Notes
EN/FR texts, mobile layout, accessibility, notifications, audit events, feature flag (if any).
