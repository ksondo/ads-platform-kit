import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isProductionEnv, redirectAllowed } from '../src/config.mjs';

// register-client redirect rule: 127.0.0.1 joins localhost for plain http outside production only.
describe('redirect URI rule (cli register-client)', () => {
  it('allows https everywhere and http://localhost as before', () => {
    for (const production of [true, false]) {
      assert.equal(redirectAllowed('https://shop.test.africadigitalsynergy.com/', { production }), true);
      assert.equal(redirectAllowed('http://localhost:42100/', { production }), true);
    }
  });
  it('allows http://127.0.0.1:<port>/ outside production and refuses it in production', () => {
    assert.equal(redirectAllowed('http://127.0.0.1:42100/', { production: false }), true);
    assert.equal(redirectAllowed('http://127.0.0.1:42100/', { production: true }), false);
  });
  it('refuses other plain-http hosts and other schemes in every environment', () => {
    for (const production of [true, false]) {
      assert.equal(redirectAllowed('http://example.com/', { production }), false);
      assert.equal(redirectAllowed('http://127.0.0.2:1/', { production }), false);
      assert.equal(redirectAllowed('ftp://localhost/', { production }), false);
    }
  });
  it('treats an unset ADS_ENV as production unless IDENTITY_DEV_MODE is on', () => {
    assert.equal(isProductionEnv({}), true);
    assert.equal(isProductionEnv({ IDENTITY_DEV_MODE: '1' }), false);
    assert.equal(isProductionEnv({ ADS_ENV: 'demo' }), false);
    assert.equal(isProductionEnv({ ADS_ENV: 'production', IDENTITY_DEV_MODE: '1' }), true);
  });
});
