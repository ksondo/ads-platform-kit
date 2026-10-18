import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createMocks } from '../src/server.mjs';
import { SIGNATURE_HEADER, signPayload, verifySignature } from '../src/signature.mjs';

const SECRET = 'unit-test-webhook-secret';
const quiet = { info() {}, warn() {}, error(m) { if (process.env.DEBUG) console.error(m); } };
let mocks;
let base;
let hooks;
let receiver;
let hookUrl;
let hookStatus = 200;

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json() };
};
const post = (p, b) => call('POST', p, b);
const get = p => call('GET', p);
const waitFor = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise(r => setTimeout(r, 10));
  }
};

before(async () => {
  mocks = createMocks({ webhookSecret: SECRET, log: quiet, defaultDelayMs: 5 });
  await new Promise(r => mocks.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${mocks.server.address().port}`;
  receiver = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      hooks.push({ raw, body: JSON.parse(raw), signature: req.headers[SIGNATURE_HEADER], eventId: req.headers['ads-mock-event-id'] });
      res.writeHead(hookStatus);
      res.end();
    });
  });
  await new Promise(r => receiver.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${receiver.address().port}/webhooks`;
});
after(async () => {
  mocks.reset();
  await new Promise(r => mocks.server.close(r));
  await new Promise(r => receiver.close(r));
});
beforeEach(async () => {
  hooks = [];
  hookStatus = 200;
  await post('/_control/reset', {});
});

const pay = (extra = {}) => post('/momo/v1/requests', { operator: 'mtn', amount: 5000, msisdn: '237670009999', reference: `ref-${Math.random()}`, callbackUrl: hookUrl, ...extra });

describe('mobile money (MTN MoMo / Orange Money)', () => {
  it('paid: PENDING then SUCCESSFUL with one signed webhook', async () => {
    const created = await pay();
    assert.equal(created.status, 202);
    assert.equal(created.body.status, 'PENDING');
    assert.equal(created.body.test_mode, true);
    assert.match(created.body.notice, /TEST MODE/);
    assert.equal(created.headers.get('x-ads-test-mode'), 'true');
    const done = await waitFor(async () => { const r = await get(`/momo/v1/requests/${created.body.id}`); return r.body.status === 'SUCCESSFUL' && r; });
    assert.match(done.body.financial_transaction_id, /^TEST-FT-/);
    await waitFor(() => hooks.length === 1);
    assert.equal(hooks[0].body.type, 'payment.successful');
    assert.equal(hooks[0].body.data.reference, created.body.reference);
    assert.equal(hooks[0].body.test_mode, true);
    assert.ok(verifySignature(hooks[0].raw, hooks[0].signature, SECRET), 'signature verifies');
    assert.ok(!verifySignature(hooks[0].raw.replace('5000', '9000'), hooks[0].signature, SECRET), 'tampered body rejected');
    assert.ok(!verifySignature(hooks[0].raw, hooks[0].signature, 'other-secret'), 'wrong secret rejected');
  });

  it('failed via script matched on msisdn, with a custom reason', async () => {
    await post('/_control/scripts', { provider: 'momo', outcome: 'failed', match: { msisdn: '237690000123' }, reason: 'PAYER_DECLINED' });
    const other = await pay();
    const created = await pay({ operator: 'orange', msisdn: '237690000123' });
    assert.match(created.body.id, /^OM-/);
    await waitFor(() => hooks.length === 2);
    const failed = hooks.find(h => h.body.data.id === created.body.id);
    assert.equal(failed.body.data.status, 'FAILED');
    assert.equal(failed.body.data.reason, 'PAYER_DECLINED');
    assert.equal(hooks.find(h => h.body.data.id === other.body.id).body.data.status, 'SUCCESSFUL', 'script only hit the matching request');
  });

  it('magic MSISDNs: 0001 failed, 0002 timeout, 0003 duplicate', async () => {
    const f = await pay({ msisdn: '237670000001' });
    const t = await pay({ msisdn: '237670000002' });
    const d = await pay({ msisdn: '237670000003' });
    await waitFor(() => hooks.length === 3);
    await new Promise(r => setTimeout(r, 50));
    assert.equal((await get(`/momo/v1/requests/${f.body.id}`)).body.status, 'FAILED');
    assert.equal((await get(`/momo/v1/requests/${t.body.id}`)).body.status, 'PENDING', 'timeout never settles');
    assert.equal(hooks.filter(h => h.body.data.id === t.body.id).length, 0, 'timeout sends no webhook');
    const dup = hooks.filter(h => h.body.data.id === d.body.id);
    assert.equal(dup.length, 2);
    assert.equal(dup[0].body.event_id, dup[1].body.event_id, 'duplicate callbacks share the event id');
  });

  it('timeout can be forced to a final status by the test; manual settle waits for the test', async () => {
    await post('/_control/scripts', { provider: 'momo', outcome: 'paid', settle: 'manual', match: { msisdn: '237670005555' } });
    const m = await pay({ msisdn: '237670005555' });
    await new Promise(r => setTimeout(r, 30));
    assert.equal((await get(`/momo/v1/requests/${m.body.id}`)).body.status, 'PENDING');
    assert.deepEqual((await get(`/_control/operations/${m.body.id}`)).body.pending_steps, ['SUCCESSFUL']);
    const advanced = await post(`/_control/operations/${m.body.id}/advance`, {});
    assert.equal(advanced.body.status, 'SUCCESSFUL');
    assert.equal(hooks.length, 1, 'webhook delivered before advance returns');

    const t = await pay({ msisdn: '237670000002' });
    const expired = await post(`/_control/operations/${t.body.id}/advance`, { status: 'EXPIRED', patch: { reason: 'PAYER_DID_NOT_APPROVE' } });
    assert.equal(expired.body.status, 'EXPIRED');
    assert.equal(hooks.at(-1).body.type, 'payment.expired');
  });

  it('is idempotent on the merchant reference and validates input', async () => {
    const a = await pay({ reference: 'order-42' });
    const b = await pay({ reference: 'order-42' });
    assert.equal(b.status, 200);
    assert.equal(b.body.id, a.body.id);
    assert.equal(b.body.idempotent_replay, true);
    assert.equal((await pay({ amount: -1 })).status, 400);
    assert.equal((await pay({ amount: 10.5 })).body.error.code, 'AMOUNT_INVALID');
    assert.equal((await pay({ operator: 'paypal' })).body.error.code, 'OPERATOR_INVALID');
    assert.equal((await pay({ callbackUrl: 'javascript:alert(1)' })).body.error.code, 'CALLBACK_URL_INVALID');
  });

  it('records failed webhook deliveries and replays them', async () => {
    hookStatus = 500;
    const created = await pay();
    const record = await waitFor(async () => (await get(`/_control/webhooks?operation=${created.body.id}`)).body.items[0]);
    assert.equal(record.attempts[0].status, 500);
    hookStatus = 200;
    const replayed = await post(`/_control/webhooks/${record.id}/replay`, {});
    assert.equal(replayed.body.attempts.at(-1).status, 200);
    assert.equal(hooks.length, 2);
    assert.equal(hooks[0].body.event_id, hooks[1].body.event_id);
  });

  it('unavailable returns 503 for degraded-path tests', async () => {
    await post('/_control/scripts', { provider: 'momo', outcome: 'unavailable' });
    const r = await pay();
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'PROVIDER_UNAVAILABLE');
    assert.equal(r.body.test_mode, true);
  });
});

describe('bank cash collection', () => {
  const collect = (extra = {}) => post('/bank/v1/cash-collections', { merchantId: 'm-1', amount: 20000, reference: `cc-${Math.random()}`, callbackUrl: hookUrl, ...extra });

  it('credited: agent assigned, collected into agent custody, bank credit confirmed', async () => {
    const c = await collect({ reference: 'cc-1' });
    assert.equal(c.body.status, 'REQUESTED');
    assert.equal((await get('/bank/v1/credits/cc-1')).body.credited, false);
    await waitFor(() => hooks.length === 3);
    assert.deepEqual(hooks.map(h => h.body.type), ['cash_collection.agent_assigned', 'cash_collection.collected', 'cash_collection.credited']);
    assert.equal(hooks[1].body.data.custody, 'agent');
    const credit = await get('/bank/v1/credits/cc-1');
    assert.equal(credit.body.credited, true);
    assert.equal(credit.body.credited_amount, 20000);
    assert.match(credit.body.bank_credit_ref, /^TEST-BCR-/);
  });

  it('short credit, no agent and not credited', async () => {
    await post('/_control/scripts', { provider: 'bank', outcome: 'short_credit', match: { reference: 'cc-short' }, shortBy: 500 });
    await post('/_control/scripts', { provider: 'bank', outcome: 'no_agent', match: { reference: 'cc-none' } });
    await post('/_control/scripts', { provider: 'bank', outcome: 'not_credited', match: { reference: 'cc-stuck' } });
    await collect({ reference: 'cc-short' });
    await collect({ reference: 'cc-none' });
    const stuck = await collect({ reference: 'cc-stuck' });
    await waitFor(() => hooks.length === 6);
    assert.equal((await get('/bank/v1/credits/cc-short')).body.credited_amount, 19500);
    assert.equal(hooks.find(h => h.body.data.reference === 'cc-none').body.data.reason, 'NO_AGENT_AVAILABLE');
    assert.equal((await get(`/bank/v1/cash-collections/${stuck.body.id}`)).body.status, 'COLLECTED');
    assert.equal((await get('/bank/v1/credits/cc-stuck')).body.credited, false);
  });
});

describe('SMS and email capture', () => {
  it('captures messages for inspection and can fail delivery', async () => {
    await post('/sms/v1/messages', { to: '+237670000000', text: 'Your code is 123456' });
    await post('/email/v1/messages', { to: 'Ama@Example.test', subject: 'Welcome', text: 'Hello' });
    await post('/_control/scripts', { provider: 'sms', outcome: 'failed', match: { to: '+237600000009' } });
    const failed = await post('/sms/v1/messages', { to: '+237600000009', text: 'x' });
    assert.equal(failed.body.status, 'FAILED');
    const sms = await get('/_control/messages?channel=sms&to=%2B237670000000');
    assert.equal(sms.body.items.length, 1);
    assert.equal(sms.body.items[0].text, 'Your code is 123456');
    const email = await get('/_control/messages?channel=email&to=ama@example.test');
    assert.equal(email.body.items[0].subject, 'Welcome');
    assert.equal((await post('/email/v1/messages', { to: 'x@example.test' })).status, 400, 'subject required');
  });
});

describe('KYC', () => {
  it('pass, fail and manual review decided by the test', async () => {
    const p = await post('/kyc/v1/checks', { reference: 'k1', subject: { fullName: 'Ama Test', idNumber: '123' }, callbackUrl: hookUrl });
    const f = await post('/kyc/v1/checks', { reference: 'k2', subject: { fullName: 'Bo Test', idNumber: '123FAIL' }, callbackUrl: hookUrl });
    const m = await post('/kyc/v1/checks', { reference: 'k3', subject: { fullName: 'Cy Test', idNumber: '123REVIEW' }, callbackUrl: hookUrl });
    await waitFor(() => hooks.length === 3);
    assert.equal((await get(`/kyc/v1/checks/${p.body.id}`)).body.status, 'PASSED');
    assert.equal((await get(`/kyc/v1/checks/${f.body.id}`)).body.status, 'FAILED');
    assert.equal((await get(`/kyc/v1/checks/${m.body.id}`)).body.status, 'MANUAL_REVIEW');
    const decided = await post(`/_control/operations/${m.body.id}/advance`, { status: 'PASSED', patch: { reviewer: 'test' } });
    assert.equal(decided.body.status, 'PASSED');
    assert.equal(hooks.at(-1).body.type, 'kyc_check.passed');
  });
});

describe('insurer', () => {
  it('quote, bind and claim (approved and rejected); declined quote', async () => {
    const q = await post('/insurer/v1/quotes', { product: 'health-basic', sumInsured: 1000000 });
    assert.equal(q.body.premium, 25000);
    const p = await post('/insurer/v1/policies', { quoteId: q.body.id });
    assert.equal(p.body.status, 'BOUND');
    assert.match(p.body.policy_number, /^TEST-POL-/);
    const c = await post('/insurer/v1/claims', { policyNumber: p.body.policy_number, amount: 50000, reference: 'clm-1', callbackUrl: hookUrl });
    assert.equal(c.body.status, 'SUBMITTED');
    await post('/_control/scripts', { provider: 'insurer', outcome: 'rejected', match: { step: 'claim', reference: 'clm-2' } });
    await post('/insurer/v1/claims', { policyNumber: p.body.policy_number, amount: 50000, reference: 'clm-2', callbackUrl: hookUrl });
    await waitFor(() => hooks.length === 4);
    assert.equal(hooks.filter(h => h.body.data.reference === 'clm-1').at(-1).body.data.status, 'APPROVED');
    assert.equal(hooks.filter(h => h.body.data.reference === 'clm-2').at(-1).body.data.reason, 'NOT_COVERED');
    await post('/_control/scripts', { provider: 'insurer', outcome: 'declined', match: { step: 'quote' } });
    assert.equal((await post('/insurer/v1/quotes', { product: 'x', sumInsured: 10 })).body.error.code, 'RISK_DECLINED');
    assert.equal((await post('/insurer/v1/claims', { policyNumber: 'nope', amount: 1, reference: 'r' })).status, 404);
  });
});

describe('regulator / registry lookups', () => {
  it('found, not found, suspended, seeded', async () => {
    assert.equal((await get('/registry/v1/business/CM-NSI-01-2025-B13-00001')).body.status, 'ACTIVE');
    assert.equal((await get('/registry/v1/business/RC-NOTFOUND')).status, 404);
    assert.equal((await get('/registry/v1/licence/LIC-SUSPENDED')).body.status, 'SUSPENDED');
    await call('PUT', '/_control/registry/practitioner/ONMC-77', { name: 'Dr Test', speciality: 'paediatrics' });
    const seeded = await get('/registry/v1/practitioner/ONMC-77');
    assert.equal(seeded.body.name, 'Dr Test');
    assert.equal(seeded.body.status, 'ACTIVE');
    assert.equal((await get('/registry/v1/unknown/1')).status, 404);
  });
});

describe('transport / ambulance dispatch', () => {
  it('runs to completion; client can cancel; no vehicle fails', async () => {
    const d = await post('/dispatch/v1/requests', { kind: 'ambulance', reference: 'd1', pickup: { lat: 3.87, lng: 11.52 }, callbackUrl: hookUrl });
    await waitFor(() => hooks.length === 4);
    assert.deepEqual(hooks.map(h => h.body.data.status), ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED']);
    assert.equal(hooks[0].body.data.vehicle.kind, 'ambulance');
    await post('/_control/scripts', { provider: 'dispatch', outcome: 'completed', settle: 'manual', match: { reference: 'd2' } });
    const d2 = await post('/dispatch/v1/requests', { kind: 'transport', reference: 'd2', pickup: { address: 'Bastos' } });
    assert.equal((await post(`/dispatch/v1/requests/${d2.body.id}/cancel`, {})).body.status, 'CANCELLED');
    assert.equal((await post(`/dispatch/v1/requests/${d.body.id}/cancel`, {})).status, 409);
    await post('/_control/scripts', { provider: 'dispatch', outcome: 'no_vehicle' });
    const d3 = await post('/dispatch/v1/requests', { kind: 'ambulance', reference: 'd3', pickup: {} });
    await waitFor(async () => (await get(`/dispatch/v1/requests/${d3.body.id}`)).body.status === 'FAILED');
  });
});

describe('Progress Agentic RAG', () => {
  it('returns cited results and fails closed', async () => {
    const r = await post('/rag/v1/retrieve', { query: 'How long do mobile money refunds take?' });
    assert.equal(r.body.grounded, true);
    assert.equal(r.body.results[0].citation.document_id, 'doc-refunds');
    assert.match(r.body.answer, /\[1\]$/);
    const none = await post('/rag/v1/retrieve', { query: 'zebra quantum volcano' });
    assert.equal(none.body.grounded, false);
    assert.equal(none.body.answer, null);
    assert.deepEqual(none.body.results, []);
    await call('PUT', '/_control/rag/corpus', { knowledgeBox: 'morphoo', documents: [{ id: 'd1', title: 'Formation', text: 'Weekly formation circles meet on Sunday.' }] });
    assert.equal((await post('/rag/v1/retrieve', { query: 'formation circles', knowledgeBox: 'morphoo' })).body.results[0].citation.title, 'Formation');
    await post('/_control/scripts', { provider: 'rag', outcome: 'uncited' });
    const uncited = await post('/rag/v1/retrieve', { query: 'refunds' });
    assert.equal(uncited.body.grounded, false);
    assert.equal(uncited.body.results.length, 0);
    await post('/_control/scripts', { provider: 'rag', outcome: 'unavailable' });
    assert.equal((await post('/rag/v1/retrieve', { query: 'refunds' })).status, 503);
  });
});

describe('control API', () => {
  it('records provider requests, rejects bad scripts, and reset clears state', async () => {
    await pay({ reference: 'logged' });
    const logged = await get('/_control/requests?path=/momo');
    assert.equal(logged.body.items[0].body.reference, 'logged');
    assert.equal((await post('/_control/scripts', { provider: 'nope', outcome: 'x' })).status, 400);
    await post('/_control/scripts', { provider: 'momo', outcome: 'banana' });
    assert.equal((await pay()).body.error.code, 'MOCK_OUTCOME_UNKNOWN');
    await post('/_control/reset', {});
    assert.equal((await get('/_control/operations')).body.items.length, 0);
    assert.equal((await get('/nope')).status, 404);
  });
  it('signature helper rejects stale timestamps', () => {
    const raw = '{"a":1}';
    const old = signPayload(raw, SECRET, Math.floor(Date.now() / 1000) - 3600);
    assert.equal(verifySignature(raw, old, SECRET), false);
    assert.equal(verifySignature(raw, signPayload(raw, SECRET), SECRET), true);
    assert.equal(verifySignature(raw, 'garbage', SECRET), false);
  });
});
