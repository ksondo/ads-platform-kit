import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('independent catalogue database has no host port and never touches commerce or identity',()=>{
 const s=read('../compose.yml');
 assert.match(s,/name: ads-business-opportunities\b/);
 assert.match(s,/container_name: ads-business-opportunities-db/);
 assert.match(s,/image: postgres:16-alpine/);
 assert.match(s,/name: ads-business-opportunities-db-data/);
 assert.match(s,/OPPORTUNITIES_DB_OWNER_PASSWORD/);
 assert.match(s,/profiles: \[operator-seed\]/);
 const db=s.slice(s.indexOf('\n  db:'),s.indexOf('\n  seed:'));
 assert.ok(!db.includes('ports:'));
 assert.ok(!s.includes('18090:'));
 assert.ok(!s.includes('18086:'));
 assert.match(s,/127\.0\.0\.1:18190:31090/);
 assert.match(s,/no-new-privileges:true/);
});
test('operator installer is additive, avoids Nginx and destructive actions',()=>{
 const s=read('../scripts/bootstrap-contabo.sh');
 for(const disallowed of ['docker system prune','docker volume rm','down -v','docker compose down','DEMO_RESET','demo-reset','systemctl reload nginx','/etc/nginx/sites-enabled']) assert.ok(!s.includes(disallowed), disallowed);
 for(const required of ['001_catalogue.sql','002_discovery.sql','seed.mjs','seed-discovery.mjs','ON_ERROR_STOP=1','no-deps public-read-api','50/333/52/21/122','ADS_NGINX_AND_CURRENT_PORTAL=UNCHANGED']) assert.ok(s.includes(required), required);
 assert.match(s,/reader_pw/);
 assert.match(s,/chmod 0600/);
});
test('Git-direct API canary is confined to existing private Docker network without public host port',()=>{
 const src=read('../scripts/release-directory-api-git-direct.sh');
 assert.match(src,/--network ads-business-opportunities-private/);
 assert.match(src,/docker exec "\$NAME" node -e/);
 assert.match(src,/all_canary_totals/);
 assert.match(src,/canary_total 'businesses\?limit=100' 52/);
 assert.ok(!src.includes('canary port 18191 occupied'));
 assert.ok(!src.includes('-p 127.0.0.1:18191:31090'));
 assert.ok(!src.includes('http://127.0.0.1:18191/health'));
 for(const prohibited of ['docker volume rm','docker system prune','down -v','--reset','nginx -s reload']) assert.ok(!src.includes(prohibited),prohibited);
});
test('read API image cannot perform migrations and operator image is not a service',()=>{
 const api=read('../Dockerfile'),seed=read('../Dockerfile.seed'),compose=read('../compose.yml');
 assert.ok(!api.includes('seed.mjs'));
 assert.ok(!api.includes('OPPORTUNITIES_MIGRATION_DATABASE_URL'));
 assert.ok(seed.includes('seed.mjs') && seed.includes('validate-seed.mjs'));
 assert.ok(compose.includes('OPPORTUNITIES_MIGRATION_DATABASE_URL:'));
});
