// Thin client for the mocks' /_control API, used from tests.
export function createMocksClient(baseUrl, { webhookSecret = null } = {}) {
  const url = String(baseUrl).replace(/\/$/, '');
  async function call(method, path, body) {
    const res = await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(`mocks ${method} ${path} -> ${res.status} ${JSON.stringify(json.error ?? json)}`);
    return json;
  }
  const qs = q => {
    const s = new URLSearchParams(Object.entries(q ?? {}).filter(([, v]) => v !== undefined && v !== null)).toString();
    return s ? `?${s}` : '';
  };
  const client = {
    url,
    webhookSecret,
    reset: () => call('POST', '/_control/reset', {}),
    // script({ provider: 'momo', outcome: 'failed', match: { msisdn }, times: 1, settle: 'auto'|'manual', delayMs, duplicates, reason })
    script: script => call('POST', '/_control/scripts', script),
    operations: q => call('GET', `/_control/operations${qs(q)}`).then(r => r.items),
    operation: id => call('GET', `/_control/operations/${encodeURIComponent(id)}`),
    advance: (id, forced) => call('POST', `/_control/operations/${encodeURIComponent(id)}/advance`, forced ?? {}),
    complete: id => call('POST', `/_control/operations/${encodeURIComponent(id)}/complete`, {}),
    webhooks: q => call('GET', `/_control/webhooks${qs(q)}`).then(r => r.items),
    replayWebhook: id => call('POST', `/_control/webhooks/${encodeURIComponent(id)}/replay`, {}),
    messages: q => call('GET', `/_control/messages${qs(q)}`).then(r => r.items),
    requests: q => call('GET', `/_control/requests${qs(q)}`).then(r => r.items),
    seedRegistry: (register, id, record) => call('PUT', `/_control/registry/${register}/${encodeURIComponent(id)}`, record),
    seedCorpus: (documents, knowledgeBox = 'default') => call('PUT', '/_control/rag/corpus', { knowledgeBox, documents }),
    async waitFor(fn, { timeoutMs = 10_000, intervalMs = 50 } = {}) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        const value = await fn();
        if (value) return value;
        if (Date.now() > end) throw new Error('mocks.waitFor timed out');
        await new Promise(r => setTimeout(r, intervalMs));
      }
    },
    waitForMessage: ({ channel, to, includes, timeoutMs }) => client.waitFor(async () => (await client.messages({ channel, to }))
      .filter(m => !includes || `${m.subject ?? ''} ${m.text ?? ''}`.includes(includes)).at(-1), { timeoutMs }),
  };
  return client;
}
