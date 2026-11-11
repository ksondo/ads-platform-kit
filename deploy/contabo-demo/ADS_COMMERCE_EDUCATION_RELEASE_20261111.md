# ADS demo — Commerce + Education release wave (11 November 2026)

**Scope now: Commerce and Education only**, with isolated ADS demo Identity if strictly necessary and demo portal last. **No deploy, restart, migration, reset or activation of Agriculture, Fleet Guard, Digital Tontine or VentureWorks.** This two-product release *overrides the wider five-/seven-product deployment sequence* for this change window. The portal still shows all five planned priority demos, but the other three remain clearly **preparing**.

## Current source pins (before PR merges)

| Source | Current merged main | Pending PR |
|---|---|---|
| Commerce | \`7c40e214c6b364d075506d45eba06ac708c0a424\` | #289 corrects the published Commerce *web* image to private request mode and adds bilingual ADS-home link. Re-pin Commerce after merge. |
| Education | \`bf4fb02e4c46ec370ade3cb461666b48ffac2135\` | No new Education PR approved for this wave. |
| ADS Kit (isolated Identity and portal) | \`6eb6428cf5679e737cfd26422b113e184e1bbda2\` | #76 (five prominent demos, truthful activation states, portal access guidance). Re-pin Kit after merge. |

**Source CI:** Commerce #289 Verify and Docker image jobs passed, browser E2E in progress at last review; Kit #76 five workflows green. No live Contabo preflight, backup/restore, release-owner GO or final image digest recorded here.

## Sequence (stop on first failed mandatory gate)

1. **Review/merge:** Wait for Commerce #289 E2E success; review PRs #289 and #76; merge only with owner approval. Record the exact resulting merged main commits and approved immutable Docker web/API/Identity/portal tags/digests.
2. **No-change host preflight:** SSH to \`vmi3191089\`; record running \`ads-demo-identity\`, Commerce and Education containers, actual Compose project names and ports, image IDs, issuer and \`/health\`/readiness, source-image matching, available disk. Existing QA user and roles must be unchanged. Run read-only \`release-acceptance.sh --product commerce\` and \`--product education\` from the reviewed Kit checkout; use the release's actually pinned manifest, not a stale Kit pin from the seven-service manifest.
3. **Backups:** Before any migrations, schema, client-registration or container changes, take protected DB/config backups of affected services and independently restore to disposable DBs; retain prior image digests and an application-only rollback plan. Existing QA access and saved visitor data remain intact. **Never run Commerce --reset automatically**.
4. **Isolated demo Identity:** Do **not** restart or replace if its existing issuer, clients \`commerce-web\`/\`education-web\`, private grants and sign-in callback already work. If a necessary Kit fix is justified, separately back up/restore the Identity DB and upgrade only the demo Identity; verify **both** clients before any product promotion. Never recreate demo users or change passwords. Preserve \`DEMO_ACCESS_PRIVATE_ENABLED=1\` and \`DEMO_ACCESS_ENABLED=0\`.
5. **Commerce:** Promote approved private-mode *web image* if needed, while preserving the currently passing API, database, POS demo records and all seven QA personas. Check whether migration \`125_product_names_en_fr.sql\` is applied and checksums match; only use the migrator if unapplied **and** backed up and approved. Do not seed/reset to fix image issues. Verify EN/FR \`/commerce/demo\`, login, role chooser, role switcher, ADS home and storefront/POS.
6. **Education:** Check the live and candidate configuration for privileged \`EDUCATION_DEMO_SEED_DATABASE_URL\` in the public API. Current source \`deploy/demo/compose.yml\` injects the schema-owner URL into that service; **do not promote that configuration as a newly approved visitor release without a reviewed isolation fix**. Verify migrations 085/086 against disposable copy, 9 personas, student/teacher/parent journeys, EN/FR 360 and 1280, correct \`EDU_AI_LIVE=false\`. If the privileged-credential issue is unresolved, preserve existing private QA access and leave Education portal activation \`preparing\`. Do not mistake functional smoke for security certification.
7. **Portal LAST:** Build and publish approved PR #76 merged SHA. Show five top cards in the catalogue in stable order: Commerce, Education, Agriculture, Fleet Guard, Digital Tontine. Keep the remaining 20 discoverable. Commerce has an existing verified URL; activate only the Education operator key \`education=open\` **after** hosted acceptance and security sign-off. All other keys, including VentureWorks, stay \`preparing\`. Portal source default file remains fail-closed; runtime activation lives only at \`/etc/ads-demo/portal/demo-activation.json\`.
8. **Evidence:** Capture image digest, /health, OIDC redirect, first-visit and returning-visitor login, no-grant refusal, persona switching, isolation, EN/FR mobile/desktop, safe rollback and ADS home for both platforms. Release owner signs the outcome; portal only opens an accepted demo.

## Read-only SSH inventory (no secrets printed)

\`\`\`bash
set -e
hostname
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -E '^NAMES|identity|commerce|education|portal'
for url in \
  https://login.demo.africadigitalsynergy.com/health \
  https://commerce.demo.africadigitalsynergy.com/commerce/demo \
  https://education.demo.africadigitalsynergy.com/demo \
  https://demo.africadigitalsynergy.com/demo-activation.json
do
  printf '%s ' "$url"
  curl -sS -o /dev/null --max-time 12 -w 'HTTP=%{http_code}\n' "$url" || true
done
\`\`\`

**Expected:** do not infer role success from HTTP 200 alone; live browser validation is required. Show the command output to compare current images and fix only observed problems. No passwords in shared transcripts.

## Rollback

Keep Commerce and Education database volumes, approvals, Identity keys, existing visits and unchanged services. On failed web-only update, restore the previously pinned compatible image; no SQL rollback or \`down -v\`. On portal status failure, set only Education's activation state back to \`preparing\`. If Education security remains unresolved, deploy portal and Commerce without claiming Education is released.
