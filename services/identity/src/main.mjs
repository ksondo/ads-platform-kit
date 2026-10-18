import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { createPool, migrate } from './db.mjs';
import { createGoogleClient } from './google.mjs';
import { loadSigningKey } from './keys.mjs';
import { createMailer } from './mailer.mjs';
import { createApp } from './server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const log = {
  info: msg => console.log(JSON.stringify({ level: 'info', service: 'ads-identity', msg, ts: new Date().toISOString() })),
  warn: msg => console.warn(JSON.stringify({ level: 'warn', service: 'ads-identity', msg, ts: new Date().toISOString() })),
  error: msg => console.error(JSON.stringify({ level: 'error', service: 'ads-identity', msg, ts: new Date().toISOString() })),
};

const pool = createPool(config);
if (process.env.IDENTITY_AUTO_MIGRATE !== 'false') await migrate(pool, log);
const keys = await loadSigningKey(config, log);
const mailer = createMailer(config, log);
const google = config.google.enabled ? createGoogleClient(config) : null;
const sdkPath = process.env.IDENTITY_SDK_PATH ?? path.resolve(here, '../../../packages/identity-client/ads-identity.js');

const { server, purgeExpired } = createApp({ config, pool, keys, mailer, google, log, sdkPath });
const purge = () => purgeExpired().catch(error => log.error(`purge failed: ${error.message}`));
setInterval(purge, 60 * 60 * 1000).unref();
purge();
server.listen(config.port, config.host, () => log.info(`ADS identity ready on ${config.host}:${config.port} issuer=${config.issuer} google=${config.google.enabled} mail=${config.mail.transport}`));

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
