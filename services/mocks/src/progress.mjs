// Progress Agentic RAG, Progress-shaped mock (standard §13.1, gaps G1-G11, G14).
// Mounted under /progress/api/v1 so PROGRESS_API_URL points at it with no code change.
// Shapes follow the ADS Progress training (ksondo/Progress-Education-training 7175d04, Builds
// 00, 01, 03, 05, 07, 08): they are TAUGHT shapes, not verified against a live tenant. Extra
// fields are present on purpose; a client must not depend on them.
//
// Outcomes (script {provider:'progress', outcome, match:{kbId, op}} or magic text in the query
// "[mock:<outcome>]"): grounded (default), no_results, uncited, low_evidence, rate_limited, slow,
// unavailable, malformed_ndjson, missing_status, schema_in_text, schema_item_object,
// schema_bad_citation, title_with_heading_marks.

export const PROGRESS_PREFIX = '/progress/api/v1';
export const PROGRESS_OUTCOMES = ['grounded', 'no_results', 'uncited', 'low_evidence', 'rate_limited', 'slow', 'unavailable', 'malformed_ndjson', 'missing_status', 'schema_in_text', 'schema_item_object', 'schema_bad_citation', 'title_with_heading_marks'];

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'for', 'how', 'what', 'why', 'do', 'does', 'i', 'my', 'this', 'with', 'le', 'la', 'les', 'de', 'des', 'du', 'et', 'un', 'une', 'respond', 'french', 'user', 'frame', 'your', 'answer', 'accordingly']);
// Crude stemming so "refund", "refunds" and "refunded" match (semantic search stand-in).
const stem = t => (t.length > 5 && t.endsWith('ing') ? t.slice(0, -3) : t.length > 4 && t.endsWith('ed') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const words = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t)).map(stem);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const DEFAULT_PROGRESS_RESOURCES = [
  { id: 'rid0refunds000000000000000000001', title: 'Test policy: mobile money refunds', uri: 'mock://progress/refunds', icon: 'application/pdf', labels: ['topic/policy'],
    paragraphs: ['Mobile money payments can be refunded within 7 days of payment.', 'Refunds return to the same MTN MoMo or Orange Money account.'] },
  { id: 'rid0cash0000000000000000000000002', title: 'Test policy: cash collection', uri: 'mock://progress/cash', icon: 'text/markdown', labels: ['topic/procedure'],
    paragraphs: ['Cash collected by an agent is in agent custody until the bank confirms the credit.', 'Only the bank credit confirmation settles the sale.'] },
  { id: 'rid0beans000000000000000000000003', title: 'Test guide: beans and protein', uri: 'mock://progress/beans', icon: 'application/pdf', labels: ['topic/guidance'],
    paragraphs: ['Beans provide plant protein and fibre at lunch.', 'A balanced plan combines beans with a cereal such as maize or rice.'] },
];

export function createProgressState() {
  return { kbs: new Map(), counters: new Map() };
}

class ProgressHttpError extends Error {
  constructor(status, code, headers = {}) { super(code); this.status = status; this.code = code; this.headers = headers; }
}

// Paragraph references as taught: <rid>/t/body/<start>-<end> (offsets in the joined body text).
function indexResource(r) {
  let offset = 0;
  const paragraphs = r.paragraphs.map(text => {
    const p = { ref: `${r.id}/t/body/${offset}-${offset + text.length}`, text, start: offset, end: offset + text.length };
    offset += text.length + 1;
    return p;
  });
  return { ...r, paragraphs };
}

export function seedKb(state, kbId, body) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(kbId)) throw new ProgressHttpError(400, 'KB_ID_INVALID');
  if (typeof body.token !== 'string' || body.token.length < 8) throw new ProgressHttpError(400, 'TOKEN_REQUIRED');
  const resources = (Array.isArray(body.resources) ? body.resources : DEFAULT_PROGRESS_RESOURCES).map(r => {
    if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.id) || !Array.isArray(r.paragraphs) || !r.paragraphs.every(p => typeof p === 'string')) throw new ProgressHttpError(400, 'RESOURCES_INVALID');
    return indexResource({ id: r.id, title: String(r.title ?? r.id), uri: r.uri ?? null, icon: r.icon ?? 'text/plain', labels: Array.isArray(r.labels) ? r.labels.map(String) : [], summary: r.summary ?? null, fields: r.fields ?? {}, paragraphs: r.paragraphs });
  });
  const labelsets = body.labelsets ?? Object.fromEntries([...new Set(resources.flatMap(r => r.labels).map(l => l.split('/')[0]))].map(set => [set, { title: set, multiple: true, labels: [...new Set(resources.flatMap(r => r.labels).filter(l => l.startsWith(`${set}/`)).map(l => l.split('/')[1]))].map(title => ({ title })) }]));
  state.kbs.set(kbId, { token: body.token, resources, graph: Array.isArray(body.graph) ? body.graph : [], labelsets, rpmLimit: Number(body.rpmLimit ?? 0) || 0 });
  return { kb_id: kbId, resources: resources.length };
}

function authorise(state, kbId, headers) {
  const raw = headers['x-nuclia-serviceaccount'] ?? headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.startsWith('Bearer ') || value.length < 15) throw new ProgressHttpError(401, 'UNAUTHORIZED');
  const token = value.slice(7);
  const kb = state.kbs.get(kbId);
  if (!kb) throw new ProgressHttpError(404, 'KNOWLEDGE_BOX_NOT_FOUND');
  if (kb.token !== token) {
    const ownsOther = [...state.kbs.values()].some(k => k.token === token);
    throw new ProgressHttpError(ownsOther ? 403 : 401, ownsOther ? 'FORBIDDEN' : 'UNAUTHORIZED');
  }
  if (kb.rpmLimit) {
    const minute = Math.floor(Date.now() / 60000);
    const key = `${kbId}:${minute}`;
    const n = (state.counters.get(key) ?? 0) + 1;
    state.counters.set(key, n);
    if (n > kb.rpmLimit) throw new ProgressHttpError(429, 'RATE_LIMITED', { 'retry-after': String(60 - Math.floor((Date.now() % 60000) / 1000)) });
  }
  return kb;
}

// Taught filter vocabulary (Build 07). Unknown filters are refused (G7: no silent drops).
// Mock semantics (unverified live, Build 07): icon filters OR together; labels from the same
// labelset OR together; different dimensions/labelsets AND together.
function applyFilters(resources, filters) {
  if (filters === undefined) return resources;
  if (!Array.isArray(filters) || filters.some(f => typeof f !== 'string')) throw new ProgressHttpError(400, 'FILTERS_INVALID');
  const icons = [], labels = new Map();
  for (const f of filters) {
    let m;
    if ((m = f.match(/^\/icon\/(.+)$/))) icons.push(m[1]);
    else if ((m = f.match(/^\/classification\.labels\/([^/]+)\/([^/]+)$/))) { if (!labels.has(m[1])) labels.set(m[1], []); labels.get(m[1]).push(`${m[1]}/${m[2]}`); }
    else throw new ProgressHttpError(400, 'FILTER_UNKNOWN');
  }
  return resources.filter(r => (!icons.length || icons.some(i => r.icon === i || r.icon.startsWith(`${i}/`)))
    && [...labels.values()].every(group => group.some(l => r.labels.includes(l))));
}

function search(kb, query, pageSize, filters, outcome) {
  const terms = words(query);
  const hits = [];
  for (const r of applyFilters(kb.resources, filters)) {
    for (const p of r.paragraphs) {
      const w = words(`${r.title} ${p.text}`);
      const n = terms.filter(t => w.includes(t)).length;
      if (!n) continue;
      hits.push({ r, p, score: Math.min(0.99, 0.5 + 0.5 * (n / terms.length)) });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.p.ref.localeCompare(b.p.ref));
  let top = hits.slice(0, Math.max(1, Math.min(50, pageSize)));
  if (outcome === 'low_evidence') top = top.slice(0, 1).map(h => ({ ...h, score: 0.55 }));
  return top;
}

function resourcesView(top, show = ['basic', 'values', 'origin'], headingMarks = false) {
  const resources = {};
  for (const { r, p, score } of top) {
    const res = resources[r.id] ??= {
      id: r.id, slug: r.id, title: headingMarks ? `## ${r.title}` : r.title, icon: r.icon,
      ...(show.includes('origin') ? { origin: { url: r.uri } } : {}),
      fields: { '/t/body': { paragraphs: {} } },
    };
    res.fields['/t/body'].paragraphs[p.ref] = { id: p.ref, score: Number(score.toFixed(3)), score_type: 'BOTH', order: Object.keys(res.fields['/t/body'].paragraphs).length, text: p.text, labels: r.labels, position: { start: p.start, end: p.end } };
  }
  return resources;
}

// G14: the answer is built from the retrieved passages and carries matching [n] markers.
function composeAnswer(query, top) {
  const french = /^Respond in French:/i.test(query);
  const seen = [];
  for (const h of top) if (!seen.find(s => s.r.id === h.r.id)) seen.push(h);
  const parts = seen.slice(0, 2).map((h, i) => `${h.p.text} [${i + 1}]`);
  return (french ? 'Selon les sources de test : ' : 'According to the test sources: ') + parts.join(' ');
}

function sampleForSchema(schema, top, outcome, depth = 0) {
  if (!schema || depth > 6) return null;
  const t = Array.isArray(schema.type) ? schema.type.find(x => x !== 'null') : schema.type;
  if (t === 'object' || schema.properties) {
    const out = {};
    for (const [k, s] of Object.entries(schema.properties ?? {})) {
      out[k] = k === 'citation_resource_id' ? (outcome === 'schema_bad_citation' ? 'rid-invented-by-model' : top[0]?.r.id ?? null) : sampleForSchema(s, top, outcome, depth + 1);
    }
    return out;
  }
  if (t === 'array') return [sampleForSchema(schema.items, top, outcome, depth + 1)].filter(v => v !== null);
  if (t === 'string') return schema.enum?.[0] ?? (top[0]?.p.text ?? 'Not available').slice(0, Math.min(schema.maxLength ?? 300, 300));
  if (t === 'number' || t === 'integer') return 1;
  if (t === 'boolean') return true;
  return null;
}

const bodyRetrieval = (top, resources) => ({ resources, best_matches: top.map(h => h.p.ref), query: '', total: top.length, page_number: 0, page_size: top.length, next_page: false });

export function progressRoutes({ state, takeScript, recordPrompt }) {
  const pick = (kbId, op, query) => {
    const scripted = takeScript('progress', { kbId, op, query });
    const magic = String(query ?? '').match(/\[mock:([a-z_]+)\]/)?.[1];
    const outcome = scripted?.outcome ?? (PROGRESS_OUTCOMES.includes(magic) ? magic : 'grounded');
    if (!PROGRESS_OUTCOMES.includes(outcome)) throw new ProgressHttpError(500, 'MOCK_OUTCOME_UNKNOWN');
    return { outcome, options: scripted?.options ?? {} };
  };
  const common = async (kbId, op, query, headers) => {
    const kb = authorise(state, kbId, headers);
    const { outcome, options } = pick(kbId, op, query);
    if (outcome === 'unavailable') throw new ProgressHttpError(503, 'SERVICE_UNAVAILABLE');
    if (outcome === 'rate_limited') throw new ProgressHttpError(429, 'RATE_LIMITED', { 'retry-after': String(options.retryAfter ?? 1) });
    if (outcome === 'slow') await sleep(Number(options.delayMs ?? 2000));
    return { kb, outcome, options };
  };

  return [
    ['POST', /^\/kb\/([A-Za-z0-9_-]+)\/find$/, async ({ params, body, headers }) => {
      const { kb, outcome } = await common(params[0], 'find', body.query, headers);
      if (typeof body.query !== 'string' || !body.query.trim()) throw new ProgressHttpError(422, 'QUERY_REQUIRED');
      const top = outcome === 'no_results' || outcome === 'uncited' ? [] : search(kb, body.query, Number(body.page_size ?? 20), body.filters, outcome);
      const resources = resourcesView(top, Array.isArray(body.show) ? body.show : ['basic'], outcome === 'title_with_heading_marks');
      return { json: { ...bodyRetrieval(top, resources), query: body.query, min_score: { semantic: 0.3, bm25: 0 }, page_size: Number(body.page_size ?? 20) } };
    }],

    ['POST', /^\/kb\/([A-Za-z0-9_-]+)\/ask$/, async ({ params, body, headers }) => {
      const { kb, outcome, options } = await common(params[0], 'ask', body.query, headers);
      if (typeof body.query !== 'string' || !body.query.trim()) throw new ProgressHttpError(422, 'QUERY_REQUIRED');
      if (body.filters !== undefined) throw new ProgressHttpError(422, 'ASK_FILTERS_NOT_SUPPORTED_BY_MOCK');
      recordPrompt({ kbId: params[0], query: body.query, prompt: body.prompt ?? null, answer_json_schema: body.answer_json_schema ?? null, max_tokens: body.max_tokens ?? null });
      const top = ['no_results', 'uncited'].includes(outcome) ? [] : search(kb, body.query, 5, undefined, outcome);
      const resources = resourcesView(top, ['basic', 'values', 'origin'], outcome === 'title_with_heading_marks');
      const answer = top.length ? composeAnswer(body.query, top) : outcome === 'uncited' ? 'This answer has no sources (mock).' : 'Not enough information in the knowledge box (mock).';
      const schema = body.answer_json_schema?.parameters;
      const object = schema && top.length ? sampleForSchema(schema, top, outcome) : null;
      const sync = String(headers['x-synchronous'] ?? '') === 'true';
      if (sync) {
        const base = { status: 'success', learning_id: 'mock-learning-id', retrieval_results: bodyRetrieval(top, resources), retrieval_best_matches: top.map(h => h.p.ref), citations: Object.fromEntries(top.map(h => [h.r.id, [[h.p.start, h.p.end]]])) };
        if (object && outcome === 'schema_in_text') return { json: { ...base, answer: `Here is the JSON you asked for:\n\`\`\`json\n${JSON.stringify(object)}\n\`\`\`` } };
        if (object && outcome === 'schema_item_object') return { json: { ...base, answer: '', item: { type: 'answer_json', object } } };
        return { json: { ...base, answer: object ? '' : answer, ...(object ? { answer_json: object } : {}) } };
      }
      // NDJSON stream: answer chunks, retrieval, optional citations, status ("0" = OK).
      const lines = [];
      const order = options.order === 'retrieval-first' ? 'retrieval-first' : 'answer-first';
      const retrievalLine = { item: { type: 'retrieval', results: bodyRetrieval(top, resources) } };
      if (order === 'retrieval-first') lines.push(retrievalLine);
      const chunkSize = Math.max(8, Math.ceil(answer.length / 3));
      for (let i = 0; i < answer.length; i += chunkSize) lines.push({ item: { type: 'answer', text: answer.slice(i, i + chunkSize) } });
      if (outcome === 'malformed_ndjson') lines.push('{"item": {"type": "answer", "text": ');
      if (order === 'answer-first') lines.push(retrievalLine);
      if (object) lines.push({ item: { type: 'answer_json', object } });
      if (options.citationsItem) lines.push({ item: { type: 'citations', citations: Object.fromEntries(top.map(h => [h.r.id, [[0, 10]]])) } });
      lines.push({ item: { type: 'debug', note: 'unknown item types must be tolerated' } });
      if (outcome !== 'missing_status') lines.push({ item: { type: 'status', code: '0', status: 'success' } });
      return { ndjson: lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l))), splitLines: options.splitLines !== false, chunkDelayMs: Number(options.chunkDelayMs ?? 0) };
    }],

    ['POST', /^\/kb\/([A-Za-z0-9_-]+)\/graph$/, async ({ params, body, headers }) => {
      const { kb } = await common(params[0], 'graph', '', headers);
      const and = Array.isArray(body?.query?.and) ? body.query.and : [];
      const filtered = and.some(c => c && c.prop === 'generated' && c.by === 'data-augmentation');
      const noise = [{ source: { value: 'the', group: 'MISC', type: 'entity' }, relation: { label: 'RELATED', type: 'RELATED' }, destination: { value: 'and', group: 'MISC', type: 'entity' } }];
      if (!filtered) return { json: { paths: noise } };
      const pathPred = and.find(c => c && c.prop === 'path');
      const src = pathPred?.source?.value ? String(pathPred.source.value).toLowerCase() : null;
      const paths = kb.graph.filter(p => !src || p.source.value.toLowerCase() === src || (pathPred.undirected && p.destination.value.toLowerCase() === src))
        .slice(0, Number(body.top_k ?? 20))
        .map(p => ({ source: { ...p.source, type: 'entity' }, relation: { label: p.relation, type: 'RELATED' }, destination: { ...p.destination, type: 'entity' }, metadata: { resource_id: p.resourceId ?? null, generated_by: 'data-augmentation' } }));
      return { json: { paths } };
    }],

    ['POST', /^\/kb\/([A-Za-z0-9_-]+)\/graph\/nodes$/, async ({ params, body, headers }) => {
      const { kb } = await common(params[0], 'graph_nodes', '', headers);
      const q = String(body?.query?.value ?? '').toLowerCase();
      const nodes = new Map();
      for (const p of kb.graph) for (const n of [p.source, p.destination]) if (!q || n.value.toLowerCase().includes(q)) nodes.set(`${n.group}|${n.value}`, { value: n.value, group: n.group, type: 'entity' });
      return { json: { nodes: [...nodes.values()] } };
    }],

    ['GET', /^\/kb\/([A-Za-z0-9_-]+)\/resource\/([A-Za-z0-9_-]+)$/, async ({ params, headers }) => {
      const { kb } = await common(params[0], 'resource', '', headers);
      const r = kb.resources.find(x => x.id === params[1]);
      if (!r) throw new ProgressHttpError(404, 'RESOURCE_NOT_FOUND');
      return {
        json: {
          id: r.id, slug: r.id, title: r.title, summary: r.summary ?? r.paragraphs[0]?.text ?? null, icon: r.icon, origin: { url: r.uri },
          usermetadata: { classifications: r.labels.map(l => ({ labelset: l.split('/')[0], label: l.split('/')[1] })) },
          data: { texts: Object.fromEntries(Object.entries(r.fields ?? {}).map(([k, v]) => [k, { value: { body: typeof v === 'string' ? v : JSON.stringify(v), format: 'PLAIN' } }])) },
          extracted: { text: { body: r.paragraphs.map(p => p.text).join('\n') } },
        },
      };
    }],

    ['GET', /^\/kb\/([A-Za-z0-9_-]+)\/labelsets$/, async ({ params, headers }) => {
      const { kb } = await common(params[0], 'labelsets', '', headers);
      return { json: { labelsets: kb.labelsets } };
    }],
  ];
}

export { ProgressHttpError };
