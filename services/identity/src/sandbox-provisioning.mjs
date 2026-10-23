// BRIEF18: the kit's calls to each product's demo provisioning endpoint
// (docs/contracts/DEMO_SANDBOX_PROVISIONING.md):
//   POST   {base_url}/internal/demo/sandboxes        {sandbox_id, product, client_id, tenants, personas, ...}
//   DELETE {base_url}/internal/demo/sandboxes/{id}
// Every request is signed: header `ads-demo-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>` over
// `${t}.${METHOD}.${path}.${rawBody}` with the shared DEMO_PROVISIONING_SECRET (empty body for DELETE).
import crypto from 'node:crypto';

export const SIGNATURE_HEADER = 'ads-demo-signature';
export const PROVISIONING_PATH = '/internal/demo/sandboxes';

const signedString = (t, method, path, body) => `${t}.${String(method).toUpperCase()}.${path}.${body ?? ''}`;

export function signRequest({ secret, method, path, body = '', timestamp = Math.floor(Date.now() / 1000) }) {
  if (!secret) throw new Error('signRequest: secret required');
  const v1 = crypto.createHmac('sha256', secret).update(signedString(timestamp, method, path, body)).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

// Reference check (products implement the same few lines; see the contract doc and the sample product).
export function verifyRequest({ secret, method, path, body = '', header, toleranceSeconds = 300, now = Date.now() }) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '') || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(signedString(t, method, path, body)).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const NOT_IMPLEMENTED = new Set([404, 405, 501]);

// One signed call with retries and exponential backoff. Returns
//   { outcome, attempts, httpStatus, error, body }
// outcome for POST: 'ready' | 'provisioning' (product still working: 202) | 'not_available' (no endpoint) | 'failed'
// outcome for DELETE: 'deleted' | 'deleting' (202) | 'failed'
export async function callProduct({ baseUrl, method, sandboxId, payload, secret, attempts = 4, backoffMs = 500, timeoutMs = 15_000, fetchImpl = fetch, wait = sleep }) {
  const isDelete = method === 'DELETE';
  const path = isDelete ? `${PROVISIONING_PATH}/${encodeURIComponent(sandboxId)}` : PROVISIONING_PATH;
  const body = isDelete ? '' : JSON.stringify(payload);
  let url;
  try {
    // base_url may carry a path prefix (a reverse proxy route); the signed path is always the contract path.
    const base = new URL(String(baseUrl));
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('protocol');
    url = `${base.toString().replace(/\/$/, '')}${path}`;
  } catch {
    return { outcome: isDelete ? 'failed' : 'not_available', attempts: 0, httpStatus: null, error: 'BAD_BASE_URL' };
  }
  let last = { outcome: 'failed', attempts: 0, httpStatus: null, error: null };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await wait(backoffMs * 2 ** (attempt - 2));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'idempotency-key': `${sandboxId}:${isDelete ? 'delete' : 'create'}`,
          [SIGNATURE_HEADER]: signRequest({ secret, method, path, body }),
        },
        body: isDelete ? undefined : body,
        signal: controller.signal,
        redirect: 'manual',
      });
      const text = await res.text().catch(() => '');
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      const status = res.status;
      if (isDelete) {
        if (status === 200 || status === 204 || status === 404) return { outcome: 'deleted', attempts: attempt, httpStatus: status, error: null, body: json };
        if (status === 202) { last = { outcome: 'deleting', attempts: attempt, httpStatus: status, error: null, body: json }; continue; }
      } else {
        if ((status === 200 || status === 201) && (json?.status ?? 'ready') === 'ready') return { outcome: 'ready', attempts: attempt, httpStatus: status, error: null, body: json };
        if (status === 202 || ((status === 200 || status === 201) && json?.status === 'provisioning')) {
          last = { outcome: 'provisioning', attempts: attempt, httpStatus: status, error: null, body: json };
          continue;
        }
        if (NOT_IMPLEMENTED.has(status)) return { outcome: 'not_available', attempts: attempt, httpStatus: status, error: `HTTP_${status}` };
      }
      const code = typeof json?.error === 'string' ? json.error : typeof json?.error?.code === 'string' ? json.error.code : `HTTP_${status}`;
      last = { outcome: 'failed', attempts: attempt, httpStatus: status, error: String(code).slice(0, 120) };
      if (!RETRYABLE.has(status)) return last;
    } catch (error) {
      last = { outcome: 'failed', attempts: attempt, httpStatus: null, error: error.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE' };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

// Runs fn over items with at most `limit` at a time.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
