import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';

// E2E-only extension must never be usable on a deployed Identity origin.
test('invite acceptance throttle override is refused for public HTTPS and non-loopback hosts', () => {
 for (const issuer of ['https://login.demo.africadigitalsynergy.com', 'http://0.0.0.0:18484', 'http://192.0.2.1:18484']) {
  assert.throws(() => createApp({config:{issuer}, e2eInviteAcceptPerIp:1000}),
    /E2E_INVITE_LIMIT_LOOPBACK_ONLY/,issuer);
 }
 for (const value of [-1,0,29,1001,30.5,'1000']) {
  assert.throws(() => createApp({config:{issuer:'http://127.0.0.1:18484'},e2eInviteAcceptPerIp:value}),
    /E2E_INVITE_LIMIT_INVALID/,String(value));
 }
});
