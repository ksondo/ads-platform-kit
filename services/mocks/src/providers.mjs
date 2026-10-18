// Mock external parties for PLAT-EXT-001. Each provider: a small REST API shaped like the real
// integration (create -> status changes -> signed webhook), outcomes chosen by
//   1. a script queued by the test (POST /_control/scripts), else
//   2. a documented magic value in the request (e.g. MSISDN ending 0001 = failed), else
//   3. the provider's happy-path default.
// The outcome "unavailable" works for every provider and returns 503, for degraded-path tests.

export class MockError extends Error {
  constructor(status, code, details) { super(code); this.status = status; this.code = code; this.details = details; }
}
const bad = (code, details) => { throw new MockError(400, code, details); };
const need = (body, ...fields) => { for (const f of fields) if (body[f] === undefined || body[f] === null || body[f] === '') bad('FIELD_REQUIRED', { field: f }); };
const positiveInt = (v, field) => { if (!Number.isInteger(v) || v <= 0) bad('AMOUNT_INVALID', { field }); return v; };
const optionalUrl = v => {
  if (v === undefined || v === null || v === '') return null;
  try { const u = new URL(String(v)); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); return u.toString(); } catch { return bad('CALLBACK_URL_INVALID'); }
};

function resolveOutcome(engine, provider, attrs, magic, fallback, allowed) {
  const scripted = engine.takeScript(provider, attrs);
  const outcome = scripted?.outcome ?? magic?.(attrs) ?? fallback;
  if (outcome === 'unavailable') throw new MockError(503, 'PROVIDER_UNAVAILABLE');
  if (!allowed.includes(outcome)) throw new MockError(500, 'MOCK_OUTCOME_UNKNOWN', { provider, outcome, allowed: ['unavailable', ...allowed] });
  return { outcome, options: scripted?.options ?? {} };
}

// Same reference twice = same operation (providers are idempotent on the merchant reference).
function idempotent(engine, provider, kind, reference) {
  const existing = engine.findByReference(provider, kind, reference);
  return existing ? { status: 200, body: { ...engine.view(existing), idempotent_replay: true } } : null;
}

// ---------- outcome tables (steps after creation) ----------
const tail = s => String(s ?? '').slice(-4);
const OUTCOMES = {
  momo: {
    allowed: ['paid', 'failed', 'timeout', 'duplicate'],
    magic: a => ({ '0001': 'failed', '0002': 'timeout', '0003': 'duplicate' })[tail(a.msisdn)],
    steps: (o, opts, id) => ({
      paid: [{ status: 'SUCCESSFUL', patch: { financial_transaction_id: `TEST-FT-${id.slice(-6)}` } }],
      duplicate: [{ status: 'SUCCESSFUL', patch: { financial_transaction_id: `TEST-FT-${id.slice(-6)}` } }],
      failed: [{ status: 'FAILED', patch: { reason: opts.reason ?? 'NOT_ENOUGH_FUNDS' } }],
      timeout: [],
    })[o],
  },
  // Refund (reversal / disbursement back to the payer) of a SUCCESSFUL collection.
  momo_refund: {
    allowed: ['refunded', 'failed', 'timeout', 'duplicate'],
    magic: a => ({ '0005': 'failed', '0006': 'timeout', '0007': 'duplicate' })[tail(a.msisdn)],
    steps: (o, opts, id) => ({
      refunded: [{ status: 'REFUNDED', patch: { financial_transaction_id: `TEST-RF-${id.slice(-6)}`, refunded_at: new Date().toISOString() } }],
      duplicate: [{ status: 'REFUNDED', patch: { financial_transaction_id: `TEST-RF-${id.slice(-6)}`, refunded_at: new Date().toISOString() } }],
      failed: [{ status: 'FAILED', patch: { reason: opts.reason ?? 'REFUND_REJECTED' } }],
      timeout: [],
    })[o],
  },
  bank: {
    allowed: ['credited', 'short_credit', 'no_agent', 'not_credited'],
    steps: (o, opts, id, body) => {
      const agent = { id: 'TEST-AGENT-01', name: 'Test Agent (mock)', phone: '+237600000000' };
      const assigned = { status: 'AGENT_ASSIGNED', patch: { agent } };
      const collected = { status: 'COLLECTED', patch: { collected_amount: body.amount, custody: 'agent' } };
      const credit = amount => ({ status: 'CREDITED', patch: { custody: 'bank', credited_amount: amount, bank_credit_ref: `TEST-BCR-${id.slice(-6)}`, credited_at: new Date().toISOString() } });
      return {
        credited: [assigned, collected, credit(body.amount)],
        short_credit: [assigned, collected, credit(body.amount - Number(opts.shortBy ?? 1000))],
        no_agent: [{ status: 'FAILED', patch: { reason: 'NO_AGENT_AVAILABLE' } }],
        not_credited: [assigned, collected],
      }[o];
    },
  },
  kyc: {
    allowed: ['pass', 'fail', 'manual_review'],
    magic: a => {
      const idNumber = String(a.subject?.idNumber ?? '');
      return /FAIL$/i.test(idNumber) ? 'fail' : /REVIEW$/i.test(idNumber) ? 'manual_review' : undefined;
    },
    steps: (o, opts) => ({
      pass: [{ status: 'PASSED', patch: { score: 0.98 } }],
      fail: [{ status: 'FAILED', patch: { reason: opts.reason ?? 'ID_MISMATCH' } }],
      manual_review: [{ status: 'MANUAL_REVIEW', patch: { reason: 'DOCUMENT_UNCLEAR' } }],
    })[o],
  },
  claim: {
    allowed: ['approved', 'rejected', 'more_info'],
    steps: (o, opts, id, body) => ({
      approved: [{ status: 'UNDER_REVIEW' }, { status: 'APPROVED', patch: { approved_amount: Number(opts.approvedAmount ?? body.amount) } }],
      rejected: [{ status: 'UNDER_REVIEW' }, { status: 'REJECTED', patch: { reason: opts.reason ?? 'NOT_COVERED' } }],
      more_info: [{ status: 'MORE_INFO_REQUIRED', patch: { reason: 'DOCUMENTS_REQUIRED' } }],
    })[o],
  },
  dispatch: {
    allowed: ['completed', 'no_vehicle', 'cancelled'],
    steps: (o, opts, id, body) => {
      const assigned = { status: 'ASSIGNED', patch: { vehicle: { id: 'TEST-VEH-01', plate: 'LT-000-TEST', kind: body.kind }, driver: { name: 'Test Driver (mock)', phone: '+237600000001' }, eta_minutes: Number(opts.etaMinutes ?? 12) } };
      return {
        completed: [assigned, { status: 'EN_ROUTE' }, { status: 'ARRIVED' }, { status: 'COMPLETED' }],
        no_vehicle: [{ status: 'FAILED', patch: { reason: 'NO_VEHICLE_AVAILABLE' } }],
        cancelled: [assigned, { status: 'CANCELLED', patch: { reason: 'CANCELLED_BY_PROVIDER' } }],
      }[o];
    },
  },
};

// Refunded so far (REFUNDED) and still refundable (pending refunds hold their amount).
function refundTotals(engine, payment) {
  let refunded = 0;
  let held = 0;
  for (const op of engine.state.operations.values()) {
    if (op.provider !== 'momo_refund' || op.data.payment_id !== payment.id) continue;
    if (op.status === 'REFUNDED') refunded += op.data.amount;
    else if (op.status === 'PENDING') held += op.data.amount;
  }
  const amount = payment.data.amount;
  return {
    refunded_amount: refunded, refund_pending_amount: held, refundable_amount: amount - refunded - held,
    refund_status: refunded === 0 ? 'NONE' : refunded >= amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
  };
}

function startAsync(engine, { provider, kind, prefix, body, attrs, fallback, initial, data }) {
  const table = OUTCOMES[provider === 'insurer' ? 'claim' : provider];
  const callbackUrl = optionalUrl(body.callbackUrl);
  const { outcome, options } = resolveOutcome(engine, provider, attrs ?? body, table.magic, fallback, table.allowed);
  const opts = outcome === 'duplicate' ? { duplicates: 2, ...options } : options;
  return engine.createOperation({
    provider, kind, prefix, reference: body.reference, status: initial, data, outcome, options: opts,
    callbackUrl, steps: id => table.steps(outcome, opts, id, body),
  });
}

// ---------- routes ----------
// Each route: [method, pattern, handler({ body, params, query, engine })] -> { status, body }
export function providerRoutes() {
  const r = [];
  const get = (engine, id, provider) => {
    const op = engine.state.operations.get(id);
    if (!op || op.provider !== provider) throw new MockError(404, 'NOT_FOUND');
    return { status: 200, body: engine.view(op) };
  };

  // ----- Mobile money: MTN MoMo / Orange Money request-to-pay -----
  r.push(['POST', /^\/momo\/v1\/requests$/, ({ body, engine }) => {
    need(body, 'operator', 'amount', 'msisdn', 'reference');
    if (!['mtn', 'orange'].includes(body.operator)) bad('OPERATOR_INVALID');
    positiveInt(body.amount, 'amount');
    if (!/^\+?\d{8,15}$/.test(String(body.msisdn))) bad('MSISDN_INVALID');
    const replay = idempotent(engine, 'momo', 'payment', body.reference);
    if (replay) return replay;
    const op = startAsync(engine, {
      provider: 'momo', kind: 'payment', prefix: body.operator === 'mtn' ? 'MTN' : 'OM', body, fallback: 'paid', initial: 'PENDING',
      data: { operator: body.operator, amount: body.amount, currency: body.currency ?? 'XAF', msisdn: String(body.msisdn), description: body.description ?? null },
    });
    return { status: 202, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/momo\/v1\/requests\/([\w-]+)$/, ({ params, engine }) => {
    const op = engine.state.operations.get(params[0]);
    if (!op || op.provider !== 'momo' || op.kind !== 'payment') throw new MockError(404, 'NOT_FOUND');
    return { status: 200, body: { ...engine.view(op), ...refundTotals(engine, op) } };
  }]);

  // ----- Mobile money refunds: full or partial, against a SUCCESSFUL collection -----
  r.push(['POST', /^\/momo\/v1\/refunds$/, ({ body, engine }) => {
    need(body, 'paymentId', 'reference');
    const replay = idempotent(engine, 'momo_refund', 'refund', body.reference);
    if (replay) return replay;
    const payment = engine.state.operations.get(String(body.paymentId));
    if (!payment || payment.provider !== 'momo' || payment.kind !== 'payment') throw new MockError(404, 'PAYMENT_NOT_FOUND');
    if (payment.status !== 'SUCCESSFUL') throw new MockError(409, 'PAYMENT_NOT_REFUNDABLE', { status: payment.status });
    const { refundable_amount: refundable } = refundTotals(engine, payment);
    const amount = body.amount === undefined || body.amount === null ? refundable : positiveInt(body.amount, 'amount');
    if (amount <= 0 || amount > refundable) throw new MockError(409, 'REFUND_EXCEEDS_PAYMENT', { refundable_amount: refundable, requested: amount });
    const op = startAsync(engine, {
      provider: 'momo_refund', kind: 'refund', prefix: payment.data.operator === 'mtn' ? 'MTNRF' : 'OMRF', body,
      attrs: { ...body, msisdn: payment.data.msisdn, operator: payment.data.operator, paymentReference: payment.reference },
      fallback: 'refunded', initial: 'PENDING',
      data: { payment_id: payment.id, payment_reference: payment.reference, operator: payment.data.operator, msisdn: payment.data.msisdn,
        amount, currency: payment.data.currency, refund_reason: body.reason ?? null },
    });
    return { status: 202, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/momo\/v1\/refunds\/([\w-]+)$/, ({ params, engine }) => get(engine, params[0], 'momo_refund')]);

  // ----- Bank: merchant cash collection, agent custody, authoritative bank-credit confirmation -----
  r.push(['POST', /^\/bank\/v1\/cash-collections$/, ({ body, engine }) => {
    need(body, 'merchantId', 'amount', 'reference');
    positiveInt(body.amount, 'amount');
    const replay = idempotent(engine, 'bank', 'cash_collection', body.reference);
    if (replay) return replay;
    const op = startAsync(engine, {
      provider: 'bank', kind: 'cash_collection', prefix: 'CC', body, fallback: 'credited', initial: 'REQUESTED',
      data: { merchant_id: String(body.merchantId), amount: body.amount, currency: body.currency ?? 'XAF', pickup_address: body.pickupAddress ?? null, custody: 'merchant' },
    });
    return { status: 201, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/bank\/v1\/cash-collections\/([\w-]+)$/, ({ params, engine }) => get(engine, params[0], 'bank')]);
  // The bank's own statement line is the only proof money arrived; products must not trust the agent's word.
  r.push(['GET', /^\/bank\/v1\/credits\/([^/]+)$/, ({ params, engine }) => {
    const op = engine.findByReference('bank', 'cash_collection', decodeURIComponent(params[0]));
    if (!op) throw new MockError(404, 'NOT_FOUND');
    const credited = op.status === 'CREDITED';
    return { status: 200, body: { reference: op.reference, credited, credited_amount: credited ? op.data.credited_amount : 0, bank_credit_ref: credited ? op.data.bank_credit_ref : null, credited_at: op.data.credited_at ?? null, test_mode: true } };
  }]);

  // ----- SMS and email: captured, never sent -----
  const message = channel => ({ body, engine }) => {
    need(body, 'to', ...(channel === 'email' ? ['subject'] : ['text']));
    const { outcome, options } = resolveOutcome(engine, channel, body, null, 'delivered', ['delivered', 'failed']);
    const record = {
      id: engine.nextId(channel === 'sms' ? 'SMS' : 'EML'), channel, to: String(body.to), from: body.from ?? null,
      subject: body.subject ?? null, text: body.text ?? null, html: body.html ?? null,
      status: outcome === 'failed' ? 'FAILED' : 'DELIVERED', reason: outcome === 'failed' ? (options.reason ?? 'INVALID_RECIPIENT') : null,
      created_at: new Date().toISOString(),
    };
    engine.state.messages.push(record);
    return { status: 201, body: { ...record, test_mode: true } };
  };
  r.push(['POST', /^\/sms\/v1\/messages$/, message('sms')]);
  r.push(['POST', /^\/email\/v1\/messages$/, message('email')]);

  // ----- KYC -----
  r.push(['POST', /^\/kyc\/v1\/checks$/, ({ body, engine }) => {
    need(body, 'reference', 'subject');
    const replay = idempotent(engine, 'kyc', 'kyc_check', body.reference);
    if (replay) return replay;
    const op = startAsync(engine, {
      provider: 'kyc', kind: 'kyc_check', prefix: 'KYC', body, fallback: 'pass', initial: 'PENDING',
      data: { subject: { fullName: body.subject.fullName ?? null, idNumber: body.subject.idNumber ?? null } },
    });
    return { status: 202, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/kyc\/v1\/checks\/([\w-]+)$/, ({ params, engine }) => get(engine, params[0], 'kyc')]);

  // ----- Insurer: quote, bind, claim -----
  r.push(['POST', /^\/insurer\/v1\/quotes$/, ({ body, engine }) => {
    need(body, 'product', 'sumInsured');
    positiveInt(body.sumInsured, 'sumInsured');
    const { outcome, options } = resolveOutcome(engine, 'insurer', { ...body, step: 'quote' }, null, 'quoted', ['quoted', 'declined']);
    if (outcome === 'declined') throw new MockError(422, 'RISK_DECLINED');
    const premium = Number(options.premium ?? Math.round(body.sumInsured * Number(options.rate ?? 0.025)));
    const op = engine.createOperation({
      provider: 'insurer', kind: 'quote', prefix: 'QUO', reference: body.reference, status: 'QUOTED', steps: [], outcome,
      data: { product: body.product, sum_insured: body.sumInsured, currency: body.currency ?? 'XAF', premium, valid_until: new Date(Date.now() + 7 * 864e5).toISOString() },
    });
    return { status: 201, body: engine.view(op) };
  }]);
  r.push(['POST', /^\/insurer\/v1\/policies$/, ({ body, engine }) => {
    need(body, 'quoteId');
    const quote = engine.state.operations.get(body.quoteId);
    if (!quote || quote.kind !== 'quote') throw new MockError(404, 'QUOTE_NOT_FOUND');
    const { outcome } = resolveOutcome(engine, 'insurer', { ...body, step: 'bind' }, null, 'bound', ['bound', 'declined']);
    if (outcome === 'declined') throw new MockError(422, 'BIND_DECLINED');
    const op = engine.createOperation({
      provider: 'insurer', kind: 'policy', prefix: 'POL', reference: body.reference, status: 'BOUND', steps: [], outcome,
      data: { quote_id: quote.id, policy_number: `TEST-POL-${quote.id.slice(4, 10)}`, product: quote.data.product, premium: quote.data.premium, sum_insured: quote.data.sum_insured, currency: quote.data.currency },
    });
    return { status: 201, body: engine.view(op) };
  }]);
  r.push(['POST', /^\/insurer\/v1\/claims$/, ({ body, engine }) => {
    need(body, 'policyNumber', 'amount', 'reference');
    positiveInt(body.amount, 'amount');
    const policy = [...engine.state.operations.values()].find(o => o.kind === 'policy' && o.data.policy_number === body.policyNumber);
    if (!policy) throw new MockError(404, 'POLICY_NOT_FOUND');
    const replay = idempotent(engine, 'insurer', 'claim', body.reference);
    if (replay) return replay;
    const op = startAsync(engine, {
      provider: 'insurer', kind: 'claim', prefix: 'CLM', body: { ...body, step: 'claim' }, fallback: 'approved', initial: 'SUBMITTED',
      data: { policy_number: body.policyNumber, amount: body.amount, currency: body.currency ?? 'XAF', description: body.description ?? null },
    });
    return { status: 201, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/insurer\/v1\/(quotes|policies|claims)\/([\w-]+)$/, ({ params, engine }) => get(engine, params[1], 'insurer')]);

  // ----- Regulator / registry lookups (RCCM business register, NUI taxpayer, licences, practitioners) -----
  const REGISTERS = ['business', 'taxpayer', 'licence', 'practitioner'];
  r.push(['GET', /^\/registry\/v1\/([a-z]+)\/([^/]+)$/, ({ params, engine }) => {
    const [register, rawId] = params;
    const id = decodeURIComponent(rawId);
    if (!REGISTERS.includes(register)) throw new MockError(404, 'REGISTER_UNKNOWN', { registers: REGISTERS });
    const seeded = engine.state.registry.get(`${register}:${id}`);
    const magic = a => (/NOTFOUND$/i.test(a.id) ? 'not_found' : /SUSPENDED$/i.test(a.id) ? 'suspended' : undefined);
    const { outcome } = resolveOutcome(engine, 'registry', { register, id }, seeded ? null : magic, 'found', ['found', 'not_found', 'suspended']);
    if (outcome === 'not_found') throw new MockError(404, 'NOT_FOUND');
    const record = seeded ?? { name: `Test ${register} ${id}`, status: 'ACTIVE' };
    return { status: 200, body: { register, id, ...record, ...(outcome === 'suspended' ? { status: 'SUSPENDED' } : {}), checked_at: new Date().toISOString(), test_mode: true } };
  }]);

  // ----- Transport / ambulance dispatch -----
  r.push(['POST', /^\/dispatch\/v1\/requests$/, ({ body, engine }) => {
    need(body, 'kind', 'reference', 'pickup');
    if (!['ambulance', 'transport'].includes(body.kind)) bad('KIND_INVALID');
    const replay = idempotent(engine, 'dispatch', 'dispatch', body.reference);
    if (replay) return replay;
    const op = startAsync(engine, {
      provider: 'dispatch', kind: 'dispatch', prefix: 'DSP', body, fallback: 'completed', initial: 'REQUESTED',
      data: { kind: body.kind, pickup: body.pickup, dropoff: body.dropoff ?? null },
    });
    return { status: 201, body: engine.view(op) };
  }]);
  r.push(['GET', /^\/dispatch\/v1\/requests\/([\w-]+)$/, ({ params, engine }) => get(engine, params[0], 'dispatch')]);
  r.push(['POST', /^\/dispatch\/v1\/requests\/([\w-]+)\/cancel$/, async ({ params, engine }) => {
    const op = engine.state.operations.get(params[0]);
    if (!op || op.provider !== 'dispatch') throw new MockError(404, 'NOT_FOUND');
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(op.status)) throw new MockError(409, 'ALREADY_FINAL');
    await engine.advance(op.id, { status: 'CANCELLED', patch: { reason: 'CANCELLED_BY_CLIENT' } });
    return { status: 200, body: engine.view(op) };
  }]);

  // ----- Progress Agentic RAG: retrieval with citations, fail closed -----
  r.push(['POST', /^\/rag\/v1\/retrieve$/, ({ body, engine }) => {
    need(body, 'query');
    const kb = String(body.knowledgeBox ?? 'default');
    const { outcome } = resolveOutcome(engine, 'rag', { ...body, knowledgeBox: kb }, null, 'grounded', ['grounded', 'no_results', 'uncited']);
    const ungrounded = { query: body.query, knowledge_box: kb, grounded: false, answer: null, results: [], reason: 'NO_GROUNDED_RESULTS', test_mode: true };
    if (outcome === 'no_results') return { status: 200, body: ungrounded };
    // "uncited": an answer with no sources. Products must refuse to show it (fail closed).
    if (outcome === 'uncited') return { status: 200, body: { ...ungrounded, answer: 'This answer has no sources (mock).', reason: 'NO_CITATIONS' } };
    const docs = engine.state.corpus.get(kb) ?? DEFAULT_CORPUS;
    const terms = tokens(body.query);
    const scored = docs.map(d => {
      const words = tokens(`${d.title} ${d.text}`);
      const hits = terms.filter(t => words.includes(t)).length;
      return { d, score: terms.length ? hits / terms.length : 0 };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id)).slice(0, Math.min(10, Number(body.topK ?? 3)));
    if (!scored.length) return { status: 200, body: ungrounded };
    const results = scored.map(({ d, score }, i) => ({ rank: i + 1, text: d.text, score: Number(score.toFixed(3)), citation: { document_id: d.id, title: d.title, uri: d.uri ?? null } }));
    return { status: 200, body: { query: body.query, knowledge_box: kb, grounded: true, answer: `${results[0].text} [1]`, results, test_mode: true } };
  }]);

  return r;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'for', 'how', 'what', 'do', 'i', 'my', 'le', 'la', 'les', 'de', 'des', 'du', 'et', 'un', 'une']);
const tokens = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t));

export const DEFAULT_CORPUS = [
  { id: 'doc-refunds', title: 'Test policy: mobile money refunds', uri: 'mock://corpus/refunds', text: 'Mobile money payments can be refunded within 7 days of payment. Refunds return to the same MTN MoMo or Orange Money account.' },
  { id: 'doc-cash', title: 'Test policy: cash collection', uri: 'mock://corpus/cash', text: 'Cash collected by an agent is in agent custody until the bank confirms the credit. Only the bank credit confirmation settles the sale.' },
  { id: 'doc-claims', title: 'Test policy: insurance claims', uri: 'mock://corpus/claims', text: 'Insurance claims need the policy number, the claim amount and a description. The insurer reviews claims within 5 working days.' },
];
