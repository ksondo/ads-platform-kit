import pg from 'pg';
import {createServer} from './server.mjs';
if(!process.env.SUBSCRIPTIONS_DATABASE_URL)throw Error('SUBSCRIPTIONS_DATABASE_URL required (restricted runtime login)');
const pool=new pg.Pool({connectionString:process.env.SUBSCRIPTIONS_DATABASE_URL,max:10});
const role=(await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
if(role.rolsuper||role.rolbypassrls){await pool.end();throw Error('Subscriptions requires a NOBYPASSRLS non-superuser runtime login')}
const server=createServer(pool,{
 issuer:process.env.OIDC_ISSUER,jwksUrl:process.env.OIDC_JWKS_URL,
 products:JSON.parse(process.env.SUBSCRIPTIONS_PRODUCTS_JSON??'{}'),
 operatorAudience:process.env.SUBSCRIPTIONS_OPERATOR_AUDIENCE??'ads-subscriptions',
 staffTenantIds:(process.env.SUBSCRIPTIONS_STAFF_TENANT_IDS??'').split(',').filter(Boolean),
});
server.listen(Number(process.env.PORT??42110),'0.0.0.0',()=>console.info('ADS subscriptions service ready (test mode)'));
async function stop(){server.close();await pool.end()}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
