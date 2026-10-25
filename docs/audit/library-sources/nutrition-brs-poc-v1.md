# Library source extract: BRS-NUTRITION-INTELLIGENCE-POC-v1.md

> For Claude review. Text extracted from the ChatGPT Library original. Preserve the original PDF/DOCX/MD as authoritative for page layout, tables and figures; this extraction may omit visual content. This is NOT an approved replacement BRS. Source file ID: `file_0000000033d08210b8467e61d06acf31`. Extraction date: 2026-10-19.

---

# Business Requirements Specification (BRS)

## Healthy Intelligent Food Planner / Nutrition Intelligence POC

**Version:** 1.1\
**Status:** Expanded POC implementation baseline

## 1. Purpose

Build a practical nutrition-management platform for individuals,
families, nutrition professionals, doctors, sports professionals and
institutions. It transforms trusted nutrition data, user circumstances,
dietary constraints, local food availability and budget into practical
meal plans and measurable guidance.

## 2. Business Vision

The platform answers: given who a person/household is, what they can
afford, what they should or should not eat, their goals and locally
available foods, what should they eat for breakfast, lunch and supper
over the requested period?

## 3. Business Objectives

-   Support weight reduction, weight gain, healthy eating and
    professionally defined dietary objectives.
-   Respect clinician-entered restrictions, allergies and health-related
    constraints.
-   Generate daily, weekly and monthly breakfast/lunch/supper plans.
-   Treat weekly/monthly budget as a first-class planning constraint.
-   Prioritize locally available/culturally familiar foods, initially
    including Cameroon.
-   Estimate energy intake, deficit/surplus and likely weight trend
    without guaranteeing outcomes.
-   Support individuals, households, professionals and institutions.

## 4. Account Types

Individual; Family/Household; Dietitian/Nutritionist; Doctor/Clinician;
Sports Professional; Institution/Hospital/Clinic/School/Care Facility.

## 5. Customer Profile

Name, age, relevant sex, height, current/target weight, activity,
location, preferences, allergies, health context, clinician
restrictions, relevant pregnancy/lactation context, weekly/monthly
budget and planning period. Inputs remain editable and plans can be
recalculated.

## 6. Constraint Classification

Hard medical/professional restrictions, allergies/intolerances, health
conditions, preferences, objectives and budget constraints are separate.
Preferences never override safety constraints.

## 7. Nutrition/Food Data

Connect authoritative food-composition/dietary-reference sources,
curated Cameroon/local-food data and appropriate price/market sources.
Retain provenance, units and version/retrieval context.

## 8. Local Foods

Support normalized nutrients, portions, local/common names and composed
meals such as koki, rice dishes, plantain, beans, vegetables, fish,
eggs, noodles and other relevant foods, including substitutions.

## 9. Budget-Aware Planning

Support weekly/monthly ranges and custom budgets, estimated meal/plan
cost, lower-cost substitutions, shopping lists and family-level
optimization. Label uncertain prices as estimates.

## 10. Goals and Progress

Calculate appropriate estimated maintenance intake, planned intake and
deficit/surplus where applicable. Present weight change as an
estimate/trend. Recommend safer horizons when requested
targets/timeframes are inappropriate.

## 11. Meal Output

Daily breakfast, lunch, supper/dinner and optional snacks; portions;
estimated calories/nutrients; estimated cost; substitutions. At least
7-day and monthly plans.

## 12. Interactive Workspace

Editable profile on the side, live plan summary beside it and generated
plan below/alongside it. Changes to budget, goals, restrictions,
preferences, activity or period can regenerate the result.

## 13. Family Planning

Multiple member profiles + shared budget. Prefer practical shared meals
while calculating individual portions/variants and respecting each
member's constraints. Apply age-appropriate safeguards for
children/adolescents.

## 14. Professional Workspace

Authorized professionals manage clients, assessments, constraints,
targets, plans, approvals, versions, progress and reports.

## 15. Doctor Journey

Authorized clinicians can record/confirm dietary restrictions and review
relevant plans/progress subject to consent and permissions. The platform
does not autonomously diagnose or treat.

## 16. Sports Professional Journey

Authorized sports professionals manage linked athletes/clients and
appropriate activity/training context.

## 17. Hospital/Institution Journey

Organization profiles, staff roles, wards/units, admitted/resident
profiles, diet orders, allergies/restrictions, meal schedules,
portions/variants, kitchen/catering views, reviews and discharge plans.

## 18. Adaptive Planning

Assess -\> Plan -\> Follow -\> Measure -\> Adjust -\> Continue.

## 19. Intelligence Layer

Prepared validated domain context is sent through the Intelligence
Connector to the AfriCoreStack Intelligence Layer for personalized
analysis, recommendation, ranking, explanation, substitutions and
scenario comparison. Authoritative nutrient values remain
provider/domain-calculation data.

## 20. Security/Privacy

Authentication, role/relationship authorization, consent, tenant
separation, server-side secrets, least-necessary professional access and
auditability.

## 21. Non-Functional Requirements

Traceable provenance, repeatable calculations, modular connectors,
API-first boundaries, responsive UX, performance, logging, tests,
extensibility and accessibility.

## 22. Commercial Packaging

Personal, Family, Professional, Sports and Institutional/Hospital
packages may reuse the same nutrition engine.

## 23. Acceptance Scenarios

Individual weight management; clinician-restriction compliance;
low-budget family plan; professional client plan; hospital operational
meal plan.

## 24. Workstreams

Account/organization model; provider connectors; canonical food model;
calculation engine; constraints; budget/price; meal optimization; safety
validation; Intelligence Connector; individual/family UI;
professional/institutional UI; progress/reporting;
testing/security/certification.

## 25. Success Criteria

Trusted nutrition data, deterministic calculations, budget, local-food
context and shared intelligence produce useful, explainable, adjustable
plans across consumer, family, professional and institutional journeys.