# ADS Digital Ecosystem Portal — BRS / FRS / UX contract (v1)

## Business purpose
Provide a lightweight, public, bilingual entry point into the **actual applications and digital business opportunities developed by Africa Digital Synergy (ADS)**. The portal must not replace the company website, the Software Factory, or the independent sector-application repositories. The initial approved UI visual is the navy/gold Africa-themed landing screen in the project discussion.

## Audience and outcome
- Entrepreneurs: discover digital tools that can become managed services, independent ventures or white-label offers.
- Institutions: discover integrated platforms and initiate partnerships or procurement discussions.
- Software and infrastructure partners: understand opportunities to operate, distribute, host, maintain or support ADS solutions.
- Prospective customers and investors: browse solutions and open working, verified demos without fictitious screenshots, metrics or deployment status.

The visitor journey ultimately leads to the corporate **Partners** page (not an 'Invest' top-level CTA), where the company owns qualification and registration. **Temporary launch gate:** while the company site is being updated, About ADS and Partners remain visible but inactive; all partnership CTAs are similarly inert. Contact stays active through WhatsApp at `https://wa.me/237654035075`. Re-enable the company links only after the company site is ready.

## Business requirements
- BRS-PORT-01: Keep a distinct ecosystem/demo portal, linked to—not merged with—the ADS corporate website.
- BRS-PORT-02: Platform → Digital Tool is a one-to-many relation. The platform is the integrated application; a digital tool is an extractable business capability.
- BRS-PORT-03: Publish readable business opportunity descriptions even without a standalone executable tool demo.
- BRS-PORT-04: Demo entry points must link only to real, verified application deployments. Standalone demos are optional by tool.
- BRS-PORT-05: Commerce explicitly exposes E-commerce and Point of Sale as separate demonstrable capabilities, while BNPL and inventory may remain discovery-only until approved.
- BRS-PORT-06: Showcase Cloud Services as a top-level navigation entry for hosting, operations and infrastructure partnership.
- BRS-PORT-07: About ADS and Partners will ultimately link to the separate ADS company website. During the website upgrade these menu items remain visible but inert, as do partner CTAs. Contact opens WhatsApp (+237 654 035 075) and must remain operational.
- BRS-PORT-08: Present partnership inclusively—entrepreneur, institution, enterprise, technology provider, data centre, venture operator, and implementation partner—without promising regulatory rights or returns.
- BRS-PORT-09: Public visitor experience must remain functional even if shared identity or sector demos are unavailable.
- BRS-PORT-10: Site must be responsive and structured for English/French publication.

## Functional requirements and implementation evidence
| ID | Requirement | V1 location | Status |
| --- | --- | --- | --- |
| FRS-01 | Navy/gold responsive landing screen and Africa-themed hero | index.html, styles.css, main.js | Implemented; visual acceptance pending |
| FRS-02 | Platform directory, search, platform detail | /platforms, /platforms/:id | Implemented |
| FRS-03 | Tool catalogue, platform filters, tool detail + business model | /opportunities, /opportunities/:id | Implemented |
| FRS-04 | Commerce POS and E-commerce tool entries | catalogue.json | Implemented, URLs pending |
| FRS-05 | Verified HTTPS live-demo-only links | safeDemo helper and demoUrl records | Implemented |
| FRS-06 | About/Partners visible but inert during website upgrade; Contact via WhatsApp | primary and footer navigation | Implemented with temporary gate |
| FRS-07 | Cloud Services link and offering page | /cloud | Implemented |
| FRS-08 | Bilingual interface and fully translated opportunity catalogue | main.js and catalogue.json | Partial; catalogue content still largely EN |
| FRS-09 | Portal application registry editor, RBAC, audit, approvals | separate backend service | Not implemented |
| FRS-10 | Platform and tool E2E launch tests against deployed demos | per-repo smoke and browser journeys | Pending external deployment |
| FRS-11 | GitHub tests, versioned Docker image, Contabo pull | demo-portal.yml | CI implemented; Contabo deployment pending |
| FRS-12 | Deployment status and evidence from actual release probes | future registry service | Not implemented |

## Design fidelity
Header navigation: Home · Platforms · Business Opportunities · Cloud Services · About ADS · Partners · Contact · EN/FR · Explore Demos.
Hero: Africa network visualization on a night-city backdrop; gold highlights, title, search, sector quick-links and factual counters derived from the catalogue.
Main: six featured sector cards; Commerce feature area with E-commerce, POS, BNPL, Inventory; additional opportunity and partner CTA sections.
The portal lists illustrative platform/tool business capability descriptions; it does **not** claim that every catalogue entry is a production-certified app. No standalone demonstration is marked Live until a reachable verified HTTPS URL is configured.

## End-to-end sequence: visitor discovers opportunity
```mermaid
sequenceDiagram
    participant V as Visitor
    participant P as ADS Demo Portal
    participant C as Public Catalogue
    participant S as ADS Company Partners Page
    V->>P: Open landing and search sector/platform/tool
    P->>C: Load curated published entries
    C-->>P: Platform→tool links, descriptions, approved demo URLs
    P-->>V: Show relevant platforms and digital opportunities
    V->>P: Select a tool
    P-->>V: Explain business model; show platform and demo readiness
    alt Visitor wants partnership
        alt Company site under upgrade
            P-->>V: Show Be a Partner but take no action
        else Company site relaunched
            V->>S: Follow Be a Partner link
            S-->>V: Company-managed partnership pathway
        end
    else Visitor wants a demo
        alt HTTPS demo verified and published
            P-->>V: Open matching deployed application
        else No approved live demo
            P-->>V: Show 'Demo being prepared' and explanatory content
        end
    end
```

## Deployment and acceptance gate
1. CI tests succeed; browser checks validate desktop/mobile layout against approved image.
2. Portal is built from its GitHub repository and published as an immutable Docker image.
3. Contabo pull is isolated from old Retail Connect Kit, Software Factory runtime, and existing identity/database.
4. TLS reverse proxy routes the public portal hostname; deep links and static files load.
5. Internal navigation works; About ADS and Partners remain visible with no action during company-site upgrade; Contact opens WhatsApp at the approved number. Test corporate partner flow only after reactivation.
6. POS/E-commerce only show 'Try Demo' when their validated application URLs and E2E journeys are operational.
7. Cloud catalogue includes only commercially approved offers/prices.
8. No demo credentials are disclosed publicly; restricted demos use the shared identity service and appropriate roles.

## Explicit follow-up scope
Protected registry API/UI, company content localization, demo analytics and health checking, screenshot approval, independent POS/E-commerce demo deployment and full browser E2E acceptance remain separate implementation checkpoints.
