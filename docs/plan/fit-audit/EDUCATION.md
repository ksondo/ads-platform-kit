# Fit-for-purpose audit: Education

Round 15, 23 Oct 2026. Read-only audit. Nothing in the product was changed or fixed.

**Owner's question: can the person who came here get the outcome they came for?**

**Verdict: Yes, with gaps.** A school can run its core loop in the product, from the front door:
- publish a programme, take an online application, admit, enrol and place in a class;
- take attendance and enter grades, which a second person approves;
- issue transcripts that anyone can verify, invoice fees, take cash or mobile money, and show parents attendance, results and the report card.

The demo, as seeded, still blocks two of these steps:
- **Report cards cannot be published.** The seeded classes have no term, so **Publish term results** fails with "Not found or not available to you".
- **Grading is blocked.** No grading policy is active until an administrator proposes one and a second person activates it.

What is missing is mostly on the "school ↔ family" and LMS side:
- no announcements or messages to parents, and no absence alerts;
- no homework or assignments, and no quizzes;
- report cards show only one average, with no subject lines and no print or PDF;
- a parent who enrols a child through the product does not get parent access by default.

| | Count |
| --- | --- |
| Works end to end | 5 |
| Works with friction | 8 |
| Broken | 3 |
| Missing | 3 |
| **Checklist items** | **19** |

## What was tested

| | |
| --- | --- |
| Product | `ksondo/education-and-intelligent-services` `origin/main` **`e1ccf5b`**. `build/demo-seed-20261020` was **not yet merged** when I started. I merged it locally in a detached worktree; it fast-forwarded, so the tested commit is **`419a5e1`**. Nothing was pushed. |
| Kit | `ads-platform-kit` `main` **`3997342`**: real identity service in demo mode (`ADS_ENV=demo`, `DEMO_MODE=1`, `DEMO_SHOW_CREDENTIALS=1`) on PostgreSQL, plus the kit mocks (mobile money, SMS, email and the AI gateway facade). |
| Client and demo data | `config/clients.demo.json` (Education entry only, redirect changed to `http://localhost:32122/`), then `apply-clients`, `demo-bootstrap`, `demo-orgs` and `scripts/demo-seed.mjs`, which inserted 84 rows. |
| Run | Education API and web on 32122, identity 32120, mocks 32121, Career Path mock 32123, private PostgreSQL 16 on 32139. Throwaway databases `fa_edu_identity` and `fa_edu_app`. |
| Accounts | Demo user, second demo user (the second person for approvals, and guardian of seeded learner S1-01), demo admin (`institution_admin`), and one **new account created through "Create an ADS account"**. That new account was activated from the captured email and played a new parent. |
| Method | Playwright as a real user: start at `/`, click **Sign in** or **Apply**, then use the side menu. Screenshots are in [`img/education/`](img/education/). Journeys were run in EN at 1280 px. The language and layout sweep ran at 360, 768 and 1280 px in EN and FR. |

**Workarounds I had to apply, so the rest could be judged:**
1. **Class terms.** After seeing that publication fails, I set a term on the three seeded classes directly in the throwaway database (`academic_class.term_id`). The UI has no way to add a term to an existing class. Everything after "report cards" in this report depends on that patch.
2. **AI mock.** I configured the kit AI facade mock the way the product's E2E setup does. The AI screens were still refused (see item 16).

## 1. Purpose and users

**Purpose:** A family finds a school and enrols a child. The school then runs the year (classes, attendance, grades, report cards, fees). Families and learners follow progress and learn from approved lessons. The outcome they leave with is an enrolled child, a known timetable, a paid fee and an official, verifiable report card.

**Main users:**
- **School admin and office:** institution admin, admissions or registrar, academic office, bursar.
- **Teacher.**
- **Parent or guardian.**
- **Learner.**
- **Partner:** a school-SaaS partner serving several schools, and ADS staff.

**Yardsticks:**
- **School management:** Fedena and OpenEMIS, the systems schools in Africa commonly use for admissions, attendance, exams and report cards, fees, and parent portals with SMS.
- **Learning:** Google Classroom and Moodle for the LMS side (class stream, assignments, quizzes, materials).

## 2–4. Market-standard checklist and scores

| # | What any school, teacher or parent expects | Score | What happened |
| --- | --- | --- | --- |
| 1 | Find a school or programme and apply online | **Works with friction** | The public catalogue was **empty** on the seeded demo ("No school matches your filters"). After the admin proposed a listing and a *different* academic admin approved it, it appeared at `/`. A new parent then clicked **Apply**, got "Sign in to continue", created an account, activated it from the email, filled the form (myself or my child, date of birth, phone, consent) and got reference `APP-…` ([10](img/education/j-10-apply-form.jpg), [11](img/education/j-11-application-submitted.jpg)). After activation the user lands on the sign-in service, not back on the application. |
| 2 | Admissions: decide, enrol (student number), place in a class | **Works end to end** | Accept with a reason, then Enrol (student number `S2026-0009-…`), then Place in 6ème B (4/40) ([12](img/education/j-12-admissions-queue.jpg), [13](img/education/j-13-enrolled-and-placed.jpg)). The parent got an SMS and an email for "accepted" and for "enrolment confirmed", and **My applications** shows "Enrolled" with the school's note ([14](img/education/j-14-parent-sees-enrolled.jpg)). |
| 3 | School setup: terms or calendar, programmes, subjects, classes, teachers, timetable | **Works with friction** | The admin added a term, two grading policies and a timetable slot ([02](img/education/j-02-admin-school-setup.jpg)). Problems:<br>- The seeded classes have **no term** ("6ème A ()"), and existing classes cannot be given one.<br>- Both courses are called "Tronc commun / Core subjects", so the class, policy and timetable dropdowns cannot be told apart.<br>- Saves show **no confirmation message** (term, policy, timetable, listing).<br>- Subjects are not modelled: one course stands for all subjects of a class. |
| 4 | Invite staff, parents and learners, with roles | **Works with friction** | **Invite someone** sent a bilingual email, captured by the mock ([04](img/education/j-04-admin-teacher-invited.jpg)). I did not test accepting the invitation; G1 found that role activation depends on ED-02. The ADS staff screens ask for raw workspace UUIDs ([38](img/education/j-38-ads-staff-partners-uuid-entry.jpg)). |
| 5 | Daily attendance register per class; family sees it | **Works end to end** | Lesson date, **Mark everyone present**, one Absent with a reason, Save: "Attendance saved: Absent 1 · Present 2" ([16](img/education/j-16-teacher-attendance-register.jpg)). The learner sees "Present 1", and the parent sees "Late 1" with the date ([30](img/education/j-30-parent-child-attendance-results.jpg)). There is no school-wide attendance report (OpenEMIS has one). Absence alerts are counted under item 12. |
| 6 | Gradebook: assessments, marks, approval | **Works with friction** | On the seeded demo the class page says "**Grading policy not set — grading is blocked**". It needs the admin to propose a policy and a second academic admin to activate it. After that, I created the assessment and recorded marks. Marks are entered **one learner at a time** (pick assessment, learner, score, evidence, then submit), not in a grid ([17](img/education/j-17-teacher-gradebook.jpg)). A second person approved them, showing a mastery percentage ([19](img/education/j-19-academic-grades-to-approve.jpg)). |
| 7 | Term results and report cards | **Broken (demo data)** | The academic office chose 6ème A and the page said "All results are approved. You can publish." ([20](img/education/j-20-publication-says-ready.jpg)). **Publish term results** then answered **"Not found or not available to you."**, because `POST …/classes/{id}/publish` returned 404 ([21](img/education/j-21-publish-fails-class-without-term.jpg)).<br>**Cause:** the publish query joins the class to its term (`src/server/mvp/routes/records.ts:39-40`), and the seeded classes have none.<br>**After the database patch:** "Published: 3 report cards, 3 notices", with promotion decisions ([22](img/education/j-22-report-cards-published-after-db-patch.jpg)).<br>**Content gap:** the report card is one line, "Average 70% · Promoted". There are no subject lines, teacher remark, rank or attendance summary, and no print or PDF ([26](img/education/j-26-learner-my-learning.jpg), [31](img/education/j-31-parent-report-card.jpg)). |
| 8 | Transcript and outside verification | **Works end to end** | Issued `TR-…` ([23](img/education/j-23-transcript-issued.jpg)). The public `/verify/TR-…` page shows Valid, the school and "Signature verified", with no grades ([24](img/education/j-24-public-transcript-check.jpg)). |
| 9 | Fees: invoice, cash at the counter, second-person check, who owes what | **Works with friction** | The bursar recorded cash (receipt `RCT-…`, "a second person must confirm"), and the second user confirmed it ([34](img/education/j-34-bursar-record-cash.jpg), [35](img/education/j-35-bursar-second-person-confirms.jpg)). The finance report shows Invoiced, Collected and Still owed, by programme ([36](img/education/j-36-finance-report.jpg)). Problems:<br>- Invoices are issued **one learner at a time**. There is no fee structure per class or term, and no bulk billing, which Fedena does.<br>- The receipt is a reference only, with nothing printable.<br>- The tables overflow the page at 768 px. |
| 10 | Pay fees online (MTN MoMo or Orange Money) | **Works end to end** (test mode) | The learner paid 45,000 FCFA by MTN, and the parent paid by Orange. Both returned "Payment confirmed by the operator" and the invoice went to Paid ([29](img/education/j-29-learner-pays-momo.jpg), [33](img/education/j-33-parent-pays-orange-money.jpg)). |
| 11 | Parent portal: my child's attendance, marks, report card, fees | **Works with friction** | For the seeded linked guardian, everything shows ([30](img/education/j-30-parent-child-attendance-results.jpg), [31](img/education/j-31-parent-report-card.jpg)).<br>The **new parent who enrolled Junior** has no school access afterwards ("No access yet — ask your school administrator"). So they cannot see their child or pay the 25,000 FCFA registration invoice the bursar issued. The admissions box "Also link the applicant as this learner's guardian" is **unticked by default**. Even when ticked, it only queues a role grant (ED-02). |
| 12 | School-to-family communication: announcements, absence alerts, teacher–parent messages | **Missing** | The only notices are system notices: report card published, application or enrolment status, invoice issued. The parent got **no alert** for the late mark. There are no class or school announcements, and no message thread between teacher and parent. **Help** (to the school or ADS) is the only channel. |
| 13 | Teacher shares lessons or materials; learner reads them | **Works with friction** | Write lesson, Send for review, the second person approves, and the lesson is published ([25](img/education/j-25-lessons-approved-and-published.jpg)). The learner reads it page by page ([27](img/education/j-27-learner-lesson-reader.jpg)). Problems:<br>- A **draft is shown as "Pending review"**, the same badge as a submitted lesson (`src/web/i18n.ts:128`). So after "Send for review" (no message shown) the teacher cannot tell whether it went ([18](img/education/j-18-teacher-lessons-draft-shown-as-pending.jpg)).<br>- Lessons are text only: no files, images, video or links.<br>- The seeded lesson marked "Approved" never reaches learners. |
| 14 | Homework or assignments: set, submit, mark, return | **Missing** | No assignment or homework feature exists in the routes or screens. This is the core of Google Classroom. |
| 15 | Quizzes or exam practice | **Missing (in practice)** | **Exam practice** says "No practice question yet", even after lessons were approved. I found no screen where a teacher writes practice questions. |
| 16 | AI study helper, teaching assistant, family helper | **Broken (demo)** | All three answer "**You don't have access to this.**" ([28](img/education/j-28-learner-study-helper-no-access.jpg), [37](img/education/j-37-teaching-assistant-no-access.jpg)). The gateway (mock) refuses because no knowledge collection is set up for the demo school and no approved content is indexed. The message reads like a permissions problem. These menus show to every user even though nothing works. |
| 17 | Partner view (school-SaaS partner sees its schools) | **Broken (demo)** | The seed creates the partner record, but no demo account is a member of the partner organisation. `/partner` says "You do not have access to this page". The ADS staff screens work but need raw UUIDs. |
| 18 | Whole product in EN and FR, usable on phone, tablet and computer | **Works with friction** | Every main screen is fully French and styled at all three sizes. Failures are listed in §5. |
| 19 | Learner: my class, timetable, attendance, results | **Works end to end** | **My learning** shows the class, "Monday 08:00–10:00 · Salle 3", "Present 1", the approved mark 14/20 and the report card line. A notification "Report card published…" arrives ([26](img/education/j-26-learner-my-learning.jpg)). |

**Seen, but not scored as market-standard items:**
- **Tutoring, online academy and training centre:** the seeded examples show (booked and open tutoring slots, academy enrolment, cohort session attendance). I did not exercise booking or certificates.
- **Not exercised at all:** children's data requests, staff qualifications upload, register-a-school onboarding (J45), refunds, Career Path referral.

## 5. Language (EN/FR) and layout: 360, 768, 1280 px

The sweep was run sequentially, one width at a time:
- open `/` in EN, switch to FR, reload;
- sign in from the FR page with **Use demo account**;
- open 19 screens through the menu (the mobile menu at 360);
- open a new tab, switch back to EN, reload.

Screenshots are named `p-` (360), `t-` (768) and `d-` (1280).

| Check | 360 phone | 768 tablet | 1280 desktop |
| --- | --- | --- | --- |
| Styles load (CSS 214 rules, Inter font, page background) | Yes | Yes | Yes |
| Switch visible | **Clipped.** The `.lang-toggle` box is 38–63 px wide for two 44 px buttons (`overflow:hidden`), so only the *current* language's button can be tapped. The other is cut off: the hit-test fails ([p-en-01-home](img/education/p-en-01-home.jpg), [p-fr-05](img/education/p-fr-05-my-classes.jpg)). The switch stays in the header when the menu is open; it is not inside the menu ([p-fr-01b](img/education/p-fr-01b-menu-open.jpg)). | Yes | Yes |
| Whole page changes | Yes, apart from the "later" pages (below) | Same | Same |
| Persists after reload | Yes (`localStorage`) | Yes | Yes |
| Persists after sign-in | **No.** The hosted sign-in page was French, but on return the product switched to **EN**, the account's saved language ([p-fr-04a](img/education/p-fr-04a-reverted-after-sign-in.jpg)). The demo accounts are shared, so each tester gets the language the last tester left. | **No** (same) | **No** (same) |
| New tab while signed in | Keeps the language | Same | Same |
| Untranslated text | `/later/*` ("More tools (later releases)") is English-only, about 118 lines. It shows "Verified tenant: daa76b37-…" and role codes ([p-fr-19b](img/education/p-fr-19b-later-learner.jpg)), and the page itself says "some screens are English only". Seed data is written as "FR / EN" in one string. | Same | Same ([d-fr-19b](img/education/d-fr-19b-later-learner.jpg)) |
| Layout breaks (horizontal page scroll) | `/fees/report` 366/360 (a `small` label); `/later/learner` 648/360 | **`/academic` 782/768, `/fees` 928/768, `/fees/report` 1175/768** (tables not wrapped in a scroll box, [t-fr-12](img/education/t-fr-12-fees-office.jpg)); `/later/learner` 907/768 | None |

## 6. User-experience pass

- **First impression.** Everyone lands on **Find a school**, including a signed-in teacher, bursar or school admin. There is no role home or dashboard ("today's classes", "grades to approve", "cash to confirm") ([01](img/education/j-01-admin-lands-on-find-a-school.jpg)). On a fresh demo that page is empty. The demo user holds seven school roles, so the menu has about 40 items. Real users would see fewer, but the demo looks overwhelming.
- **Clarity of the next step.** Two-person rules (policy, catalogue, grades, lessons, cash) are explained in the screen intros, which is good. But a teacher meets "grading is blocked" with no link to who unblocks it. Admissions puts the guardian link behind an unticked box.
- **Empty states.** Clear and bilingual everywhere ("No application is waiting.", "No lesson has been published for your courses yet.").
- **Feedback.** Many saves are silent: term, policy, timetable, listing, lesson draft and "Send for review". Grade, cash, admission and payment steps do give clear messages.
- **Error messages.** The two worst:
  - "Not found or not available to you." for a class without a term, right after "You can publish";
  - "You don't have access to this." for an AI service that is not configured.
  Both send the user looking for a permission problem.
- **Mobile.** Single-column forms work and the menu drawer works. The header is cramped at 360: the title wraps to three lines, "Se déconnecter" wraps, and the language switch is clipped.
- **Speed.** Locally, every screen reached network-idle in about 0.65–0.75 s. The app server sends the 554 KB JS bundle **uncompressed**, with `cache-control: max-age=300` on hashed assets. On a 3G connection in Cameroon that matters, unless the hosting proxy compresses and caches.
- **What would make a tester give up:**
  - empty "Find a school" on arrival;
  - "grading is blocked";
  - the publish error;
  - AI "no access";
  - on a phone, not finding the way to switch language.

## 7. Fixes that would most change the verdict

| # | Fix | Size | Plan item |
| --- | --- | --- | --- |
| 1 | **Make the demo school usable end to end:**<br>- seed a term on the classes, an *active* grading policy, a published catalogue listing, a partner-org member and AI knowledge routes with one approved document;<br>- in the product, let School setup set or change a class's term;<br>- make publish answer "This class has no term" instead of 404. | S | Demo seed follow-up (`DEMO_HOST_SETTINGS.md` Education rows); ED-14 (seeded partner and staging acceptance); ED-07 (partner view) |
| 2 | **Bilingual and layout fixes:**<br>- show both EN and FR (or one "other language" button) at 360;<br>- keep the language chosen before sign-in, by saving it to the account instead of overriding it;<br>- wrap the academic, fees and report tables in a scroll box at 768;<br>- hide or translate `/later/*`. | S | `BILINGUAL_RESPONSIVE_MOBILE_PLAN.md` §4.2–4.3 (Step 2, Education first), K2 spec; ED-04 (hide "later tools" unless entitled) |
| 3 | **Parent access and communication:**<br>- the guardian link ticked by default at enrolment, with the parent role activating automatically;<br>- automatic SMS to linked guardians on absence or lateness;<br>- class and school announcements to parents. | M | ED-02 (roles via kit admin API) plus a **new** item (announcements and absence alerts) |
| 4 | **A real report card:**<br>- per-subject lines (subjects as courses of a class);<br>- teacher remark and attendance summary;<br>- printable or PDF report card and fee receipt. | M | **New** item. ED-05 covers only the pass mark. |
| 5 | **LMS basics:**<br>- homework or assignments with submission and marking;<br>- files and images in lessons;<br>- a teacher screen to write practice questions;<br>- distinct "Draft" and "Sent for review" badges, with a confirmation message. | L (badge and message S) | EP-EDU-08 learning delivery (EDU-P2); ED-13 |

Also worth noting, smaller:
- compress and long-cache hashed assets at the server or proxy (ED-10, hosting plan);
- name the two "Tronc commun" courses differently in the seed;
- add a role home per user type.

## Repro notes (for whoever fixes)

- **Publish 404:** any class with `term_id IS NULL`. The readiness check `GET …/publication` uses a `LEFT JOIN` to the term (`records.ts:27`), so it says "You can publish". The publish call uses an inner `JOIN` (`records.ts:39`), so it fails with 404.
- **Lesson badge:** `src/web/i18n.ts:128` maps `draft` to "Pending review".
- **Phone language switch:** `.lang-toggle` uses `overflow:hidden` inside the 360 px header; measured with `elementFromPoint`.
- **AI refusal:** the facade `route()` finds no tenant collection route for the demo school, so it returns `COLLECTION_NOT_AUTHORIZED` (403), which the UI shows as "You don't have access to this."
