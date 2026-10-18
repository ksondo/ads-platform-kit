// Mobile money behind an adapter (PLAT-EXT-001): configuration picks the provider, code does not.
// "mock" talks to the shared ADS mocks; "live" stays unavailable until the partner contract and
// go-live gate exist, so no test or demo can move real money by accident.
export function createMomoAdapter({ mode, mocksUrl }) {
  if (mode === 'mock') {
    if (!mocksUrl) throw new Error('PAYMENTS_MODE=mock needs ADS_MOCKS_URL');
    return {
      testMode: true,
      async requestToPay({ operator, amount, msisdn, reference, callbackUrl, description }) {
        const res = await fetch(`${mocksUrl}/momo/v1/requests`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ operator, amount, currency: 'XAF', msisdn, reference, callbackUrl, description }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status >= 500) return { ok: false, reason: body.error?.code ?? 'PROVIDER_UNAVAILABLE' };
        if (!res.ok) return { ok: false, reason: body.error?.code ?? 'PROVIDER_REJECTED' };
        return { ok: true, providerRef: body.id, status: body.status };
      },
    };
  }
  if (mode === 'live') throw new Error('PAYMENTS_MODE=live is not enabled: go-live gate (partner contract) not recorded');
  throw new Error(`PAYMENTS_MODE must be mock or live, got ${mode}`);
}
