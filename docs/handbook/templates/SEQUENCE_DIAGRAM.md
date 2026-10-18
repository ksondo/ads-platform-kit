# Sequence: <journey or story>

Traces to: US-<id>, FR-<id>

```mermaid
sequenceDiagram
    autonumber
    actor U as Customer
    participant W as Web/App
    participant ID as ADS sign-in
    participant API as Product API
    participant DB as PostgreSQL (RLS)
    participant P as Partner (e.g. MoMo)
    U->>W: Action
    W->>ID: Get access token (ads-identity.js)
    ID-->>W: Token (sub, tenant_id, roles)
    W->>API: POST /api/... (Bearer token, Idempotency-Key)
    API->>API: Verify token, role, tenant
    API->>DB: Insert/Update (tenant-scoped)
    API->>P: Request
    P-->>API: Pending / Success / Failure
    API-->>W: 202 Pending (never "Paid" before confirmation)
    W-->>U: Clear status message (EN/FR)
```

Failure paths to show: invalid token (401), missing role (403), other tenant (404/403), partner timeout (stays Pending), validation error (400).
