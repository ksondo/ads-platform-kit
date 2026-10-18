import crypto from 'node:crypto';
import { SIGNATURE_HEADER, signPayload } from './signature.mjs';

export const NOTICE = 'TEST MODE - mock provider: no real money, policies, identities or records';

// Shared machinery for every mock provider:
// - scripts: tests queue outcomes ("the next MoMo request for msisdn X fails");
// - operations: provider-side records that move through statuses (PENDING -> SUCCESSFUL ...);
// - webhooks: each status change is POSTed, signed, to the product's callback URL and recorded.
// Nothing runs on wall-clock randomness: outcomes come from scripts, documented magic values,
// or the provider default, and steps advance in a fixed order.
export function createEngine({ webhookSecret, log = console, defaultDelayMs = 25 }) {
  let seq = 0;
  const nextId = prefix => `${prefix}-${String(++seq).padStart(6, '0')}-${crypto.randomBytes(3).toString('hex')}`;
  const state = { scripts: [], operations: new Map(), webhooks: [], messages: [], requests: [], registry: new Map(), corpus: new Map() };
  const timers = new Set();

  function reset() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    state.scripts.length = 0;
    state.operations.clear();
    state.webhooks.length = 0;
    state.messages.length = 0;
    state.requests.length = 0;
    state.registry.clear();
    state.corpus.clear();
  }

  // ---- scripts ----
  function addScript({ provider, outcome, match = {}, times = 1, ...options }) {
    const script = { id: nextId('script'), provider, outcome, match, remaining: times, options };
    state.scripts.push(script);
    return script;
  }
  // Flattens one level ({subject:{idNumber}} -> 'subject.idNumber') so scripts can match nested fields.
  const flatten = obj => {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
      else out[k] = v;
    }
    return out;
  };
  function takeScript(provider, attrs) {
    const flat = flatten(attrs);
    const script = state.scripts.find(s => s.provider === provider && s.remaining !== 0
      && Object.entries(s.match).every(([k, v]) => flat[k] !== undefined && String(flat[k]) === String(v)));
    if (!script) return null;
    if (script.remaining > 0) script.remaining -= 1;
    return { outcome: script.outcome, options: script.options, scriptId: script.id };
  }

  // ---- operations ----
  const view = op => ({
    id: op.id, provider: op.provider, kind: op.kind, reference: op.reference, status: op.status, outcome: op.outcome,
    ...op.data, created_at: op.createdAt, updated_at: op.updatedAt, test_mode: true,
  });

  function findByReference(provider, kind, reference) {
    if (!reference) return null;
    for (const op of state.operations.values()) if (op.provider === provider && op.kind === kind && op.reference === reference) return op;
    return null;
  }

  // steps: [{ status, patch }] applied in order. An empty list means the provider never answers (timeout).
  function createOperation({ provider, kind, prefix, reference, status, data, steps, callbackUrl, options = {}, outcome }) {
    const now = new Date().toISOString();
    const id = nextId(prefix);
    const op = {
      id, provider, kind, reference: reference ?? null, status, outcome, data: { ...data }, steps: [...(typeof steps === 'function' ? steps(id) : steps)],
      callbackUrl: callbackUrl ?? null, duplicates: Math.max(1, Number(options.duplicates ?? 1)), createdAt: now, updatedAt: now,
    };
    state.operations.set(op.id, op);
    const settle = options.settle ?? 'auto';
    if (settle === 'auto' && op.steps.length) {
      const delay = Number(options.delayMs ?? defaultDelayMs);
      const tick = () => {
        const t = setTimeout(async () => {
          timers.delete(t);
          if (!state.operations.has(op.id) || !op.steps.length) return;
          await advance(op.id);
          if (op.steps.length) tick();
        }, delay);
        timers.add(t);
      };
      tick();
    }
    return op;
  }

  // Applies the next step (or a forced status) and delivers its webhook(s) before returning.
  async function advance(id, forced) {
    const op = state.operations.get(id);
    if (!op) return null;
    let step;
    if (forced?.status) {
      step = { status: String(forced.status), patch: forced.patch ?? {} };
      op.steps = [];
    } else {
      step = op.steps.shift();
    }
    if (!step) return op;
    op.status = step.status;
    Object.assign(op.data, step.patch ?? {});
    op.updatedAt = new Date().toISOString();
    if (op.callbackUrl) {
      const eventId = nextId('evt');
      for (let i = 0; i < op.duplicates; i += 1) await deliver(op, eventId, `${op.kind}.${op.status.toLowerCase()}`);
    }
    return op;
  }

  async function complete(id) {
    const op = state.operations.get(id);
    if (!op) return null;
    while (op.steps.length) await advance(id);
    return op;
  }

  // ---- webhooks ----
  async function send(record) {
    const signature = signPayload(record.body, webhookSecret);
    try {
      const res = await fetch(record.url, {
        method: 'POST', body: record.body, signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature, 'ads-mock-event-id': record.eventId, 'x-ads-test-mode': 'true' },
      });
      record.attempts.push({ at: new Date().toISOString(), status: res.status, ok: res.ok });
      await res.arrayBuffer().catch(() => {});
    } catch (error) {
      record.attempts.push({ at: new Date().toISOString(), status: 0, ok: false, error: error.message });
      log.warn?.(`mock webhook to ${record.url} failed: ${error.message}`);
    }
    return record;
  }
  async function deliver(op, eventId, type) {
    const body = JSON.stringify({ event_id: eventId, type, created_at: new Date().toISOString(), test_mode: true, notice: NOTICE, data: view(op) });
    const record = { id: nextId('whk'), eventId, type, operationId: op.id, provider: op.provider, url: op.callbackUrl, body, attempts: [] };
    // Listed only after its first attempt, so tests never see a delivery that is still in flight.
    await send(record);
    state.webhooks.push(record);
    return record;
  }
  async function replay(id) {
    const record = state.webhooks.find(w => w.id === id);
    return record ? send(record) : null;
  }
  const webhookView = w => ({ id: w.id, event_id: w.eventId, type: w.type, operation_id: w.operationId, provider: w.provider, url: w.url, payload: JSON.parse(w.body), attempts: w.attempts });

  return { state, reset, addScript, takeScript, createOperation, findByReference, advance, complete, replay, view, webhookView, nextId };
}
