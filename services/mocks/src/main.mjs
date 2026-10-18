import { DEFAULT_WEBHOOK_SECRET, createMocks } from './server.mjs';

// Standalone start: node src/main.mjs  (PORT, HOST, MOCKS_WEBHOOK_SECRET)
if (['production', 'prod', 'live'].includes(String(process.env.ADS_ENV ?? '').toLowerCase())) {
  console.error('ads-mocks refuses to start when ADS_ENV is production: mocks are for test mode only');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8090);
const host = process.env.HOST ?? '127.0.0.1';
const mocks = createMocks({ webhookSecret: process.env.MOCKS_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET });
mocks.server.listen(port, host, () => console.log(JSON.stringify({ level: 'info', service: 'ads-mocks', msg: `ADS mocks (TEST MODE) on ${host}:${port}` })));
const stop = () => { mocks.reset(); mocks.server.close(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
