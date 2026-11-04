# Library source extract: FRS-NUTRITION-INTELLIGENCE-POC-v1.md

> For Claude review. Text extracted from the ChatGPT Library original. Preserve the original PDF/DOCX/MD as authoritative for page layout, tables and figures; this extraction may omit visual content. This is NOT an approved replacement BRS. Source file ID: `file_00000000c2f481f4ab7669b82229332b`. Extraction date: 2026-10-19.

---

# Functional Requirements Specification (FRS)

## Healthy Intelligent Food Planner / Nutrition Intelligence POC

**Version:** 1.0

## 1. Experience Principle

An interactive workspace: editable profile + live plan summary +
structured generated plan. Material changes recalculate without
restarting onboarding.

## 2. Primary Workspace

``` text
+---------------------------+--------------------------------+
| EDITABLE PROFILE          | LIVE PLAN SUMMARY              |
| Name / age / height       | Current -> target weight       |
| Weight / activity         | Daily energy target            |
| Goal / conditions         | Weekly/monthly budget          |
| Restrictions / allergies | Estimated plan cost            |
| Preferences / location    | Progress direction / horizon   |
| Budget / period           | Warnings / Recalculate         |
+---------------------------+--------------------------------+
| GENERATED OUTPUT                                            |
| Week/Month -> Day -> Breakfast | Lunch | Supper | Snack    |
| Portions | Calories | Nutrition | Cost | Substitutions      |
+-------------------------------------------------------------+
```

## 3. Functional Requirements

**Authentication:** authenticated accounts; individual, household,
professional and organization contexts; role-aware workspaces.

**Profile:** create/edit age, height, weight, relevant sex, activity,
location, goal and target. Distinguish requested timeframe from
recommended horizon.

**Restrictions:** separate health conditions, clinician restrictions,
allergies/intolerances and preferences. Hard constraints are visually
and functionally distinct. Free-text instructions require safe
interpretation/confirmation.

**Budget:** weekly/monthly mode, preset ranges/custom amount, estimated
spend, lower-cost substitutions and explicit infeasibility when
constraints cannot fit the budget.

**Planning Period:** 7-day and one-month minimum; optional
14-day/full-target period. A one-month plan can be phase one of a longer
recommended journey.

**Calculations:** validated backend calculations; estimated maintenance,
intake and deficit/surplus where appropriate; weight trend is not
guaranteed; unsafe targets produce warnings/safer alternatives.

**Meals:** breakfast, lunch, supper/dinner and optional snacks;
portions, energy/nutrition, cost and substitutions; local/cultural
meals; shopping list.

**Live Recalculation:** material
profile/budget/restriction/preference/activity/goal changes mark the
plan for recalculation while preserving context and plan history/version
where implemented.

**Results:** structured summary and week/day navigation; explanations
support rather than replace structured meals.

## 4. Family / Household

Authorized manager creates member profiles; each keeps individual
constraints/goals; household has shared budget; planner prefers common
meals; produces member portions/variants, combined cost and shopping
list; child/adolescent safeguards apply.

## 5. Nutritionist / Dietitian

Authorized client list; client workspace; constraints/targets;
generate/modify/approve/version plans; inspect calculations/evidence;
progress and reports.

## 6. Doctor / Clinician

Authorized patient relationships only; record/confirm dietary
instructions; source/date attribution where appropriate; review relevant
plans/progress subject to permission.

## 7. Sports Professional

Manage linked athletes/clients; capture relevant training/activity
context; no automatic access to unrelated sensitive information.

## 8. Institution / Hospital

Organization/staff roles; admitted/resident clients and ward/unit
context; diet orders, allergies and restrictions; operational meal
views; least-necessary kitchen/catering information; nutrition
review/discharge plan.

## 9. Progress

Record weight/adherence and configured measures; feedback on food
availability, budget realism and difficulty; new evidence can adjust
plans; show appropriate history/trends.

## 10. Intelligence-Assisted Functions

Prepared domain context may pass through the Intelligence Connector to
the AfriCoreStack Intelligence Layer for interpretation, recommendation,
ranking, substitution, scenario comparison and explanations. Numeric
nutrition facts remain validated provider/domain data.

## 11. Role/Relationship Rules

Access depends on role + relationship/organization context + consent.
Household managers manage authorized dependents; professionals manage
authorized clients; organization staff are scoped; sensitive changes are
auditable.

## 12. Core Journeys

**Weight reduction:** Login -\> profile -\> current/target weight -\>
constraints -\> budget -\> period -\> calculate -\> recommended horizon
-\> plan -\> save -\> track -\> adjust.

**Clinician restriction:** Login -\> profile -\> professional
restriction -\> budget/preferences -\> safety validation -\> compliant
menu -\> warnings -\> save/track.

**Low-budget household:** Household -\> members -\> budget -\> member
constraints -\> shared plan -\> portions/variants -\> shopping list -\>
adjust/save.

**Professional:** Login -\> clients -\> assessment -\>
constraints/targets -\> generate -\> inspect -\> modify -\> approve -\>
monitor.

**Hospital:** Institution -\> ward/patient -\> diet order -\> daily
planning -\> kitchen view -\> review -\> update/discharge.

## 13. Acceptance

Individual regeneration works; budget changes affect planning; hard
restrictions survive regeneration/substitution; output shows
meals/portions/calories/cost/progress; family shared plan works;
professional plan approval/versioning works; institutional diet workflow
works; unauthorized cross-profile/organization access is blocked.