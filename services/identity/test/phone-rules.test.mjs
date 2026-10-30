import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCameroonPhone } from '../src/phone.mjs';
import { renderPage } from '../src/pages.mjs';

test('Cameroon phone forms converge without accepting other countries or injected text', () => {
  for (const input of ['699123456', '+237 699 123 456', '00237-699-123-456']) assert.equal(normalizeCameroonPhone(input), '+237699123456');
  for (const input of ['', '+234699123456', '+237299123456', '237699123456', '69912345', 'abc699123456', '699123456<script>']) assert.equal(normalizeCameroonPhone(input), null);
});
test('phone pages preserve request and labels, escape input, and disclose test SMS in both languages', () => {
  for (const locale of ['en', 'fr']) {
    const html = renderPage('phone', { locale, nonce: 'nonce', csrf: 'csrf', req: 'bound-request', path: '/phone',
      phoneTestMode: true, values: { phone: '\"><script>', challenge: 'challenge-id', linking: false } });
    assert.match(html, /name="req" value="bound-request"/);
    assert.match(html, /<label for="phone">/); assert.match(html, /<label for="code">/);
    assert.match(html, locale === 'en' ? /Test mode/ : /Mode test/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /autocomplete="one-time-code"/);
  }
});
