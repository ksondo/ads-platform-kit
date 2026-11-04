import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { renderDemoAdmin } from '../src/demo-admin-page.mjs';

const XSS = '<script>alert(1)</script>';
const base = (extra = {}) => ({ locale: 'en', nonce: 'n0nce', csrf: 'csrf-token-1', timeZone: 'Africa/Douala', langPath: '/demo-admin', admin: { email: 'admin@example.test' }, ...extra });
const dom = html => new JSDOM(html).window.document;

const overviewCtx = (extra = {}) => base({
  overview: {
    counts: { pending: 3, awaitingActivation: 2, active: 5, expiringSoon: 1 },
    filters: { status: 'pending', platform: 'commerce', q: '"><b>q' },
    platforms: [{ key: 'commerce', name: 'AfriCoreStack Commerce' }, { key: 'edu', name: 'AfriEdu' }],
    requests: [
      { id: 'r1', reference: 'DA-0001', platform: 'commerce', platformName: 'AfriCoreStack Commerce', email: `x${XSS}@example.test`, status: 'pending', createdAt: '2026-11-03T08:15:00Z', priorRejection: true, notification: 'sent', grantStatus: null, expiresAt: null },
      { id: 'r 2', reference: 'DA-0002', platform: 'commerce', platformName: 'AfriCoreStack Commerce', email: 'b@example.test', status: 'approved', createdAt: '2026-11-01T10:00:00Z', priorRejection: false, notification: 'failed', grantStatus: 'active', expiresAt: '2026-12-01T10:00:00Z' },
    ],
  },
  ...extra,
});

const requestCtx = (actions = { approve: true, reject: true, resend: false, revoke: false }, extra = {}) => base({
  request: {
    request: { id: 'r1', reference: 'DA-0001', platform: 'commerce', platformName: 'AfriCoreStack Commerce', email: `a${XSS}@example.test`, locale: 'fr', status: 'pending', createdAt: '2026-11-03T08:15:00Z', expiresAt: '2026-11-10T08:15:00Z', decidedAt: null, decidedBy: null, internalNote: `note ${XSS}`, priorRejection: true },
    grant: { status: 'awaiting_activation', personas: [{ key: 'store_manager', label: 'Store manager' }, { key: 'cashier', label: `Cashier ${XSS}` }], invitation: { status: 'pending', expiresAt: '2026-11-06T08:15:00Z' }, activatedAt: null, expiresAt: null, firstLoginAt: null, lastActivityAt: null, revokedAt: null },
    emails: [
      { kind: 'admin_notification', recipient: 'ops@example.test', status: 'sent', attempts: 1, lastError: null, sentAt: '2026-11-03T08:16:00Z', createdAt: '2026-11-03T08:15:00Z' },
      { kind: 'invitation', recipient: 'a@example.test', status: 'failed', attempts: 3, lastError: `SMTP ${XSS}`, sentAt: null, createdAt: '2026-11-03T09:00:00Z' },
    ],
    history: [{ at: '2026-11-03T08:15:00Z', event: 'demo_access_requested', actor: 'a@example.test', detail: null }, { at: '2026-11-03T09:00:00Z', event: 'custom_event', actor: 'admin', detail: XSS }],
    actions,
  },
  ...extra,
});

const auditCtx = (events) => base({ audit: { events } });

function assertSafe(html) {
  const doc = dom(html);
  assert.equal(doc.querySelectorAll('script').length, 0, 'no script elements');
  assert.ok(!html.includes('<script'), 'no raw <script in output');
  return doc;
}

describe('demo admin page: overview', () => {
  it('renders header, counters, filters and rows', () => {
    const doc = assertSafe(renderDemoAdmin('overview', overviewCtx()));
    assert.equal(doc.querySelector('h1').textContent, 'ADS demo administration');
    assert.match(doc.body.textContent, /Signed in as admin@example\.test\./);
    assert.match(doc.body.textContent, /Times shown in Africa\/Douala\./);
    const counts = Object.fromEntries([...doc.querySelectorAll('[data-count]')].map(e => [e.dataset.count, e.querySelector('strong').textContent]));
    assert.deepEqual(counts, { pending: '3', awaitingActivation: '2', active: '5', expiringSoon: '1' });
    const navLinks = [...doc.querySelectorAll('nav a')].map(a => a.textContent);
    assert.deepEqual(navLinks, ['Requests', 'Audit']);
    const form = doc.querySelector('[data-testid=filters]');
    assert.equal(form.getAttribute('method'), 'get');
    assert.equal(form.getAttribute('action'), '/demo-admin');
    assert.deepEqual([...form.querySelectorAll('#f-status option')].map(o => o.value), ['all', 'pending', 'approved', 'rejected', 'expired', 'cancelled']);
    assert.equal(form.querySelector('#f-status').value, 'pending');
    assert.equal(form.querySelector('#f-platform').value, 'commerce');
    assert.equal(form.querySelector('#f-q').value, '"><b>q');
    const rows = doc.querySelectorAll('[data-testid=requests] tbody tr');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].querySelector('a').getAttribute('href'), '/demo-admin/requests/r1?lang=en');
    assert.equal(rows[1].querySelector('a').getAttribute('href'), '/demo-admin/requests/r%202?lang=en');
    assert.ok(rows[0].querySelector('[data-flag=prior-rejection]'));
    assert.ok(!rows[1].querySelector('[data-flag=prior-rejection]'));
    assert.match(rows[0].textContent, /Sent \(accepted by provider\)/);
    assert.match(rows[1].textContent, /Active/);
    assert.match(rows[1].textContent, /expires/);
    assert.ok(rows[0].querySelector('time').textContent.includes('2026'));
    // Language switch via layout footer
    assert.equal(doc.querySelector('footer a').getAttribute('href'), '/demo-admin?lang=fr');
    // Sign-out form
    const so = doc.querySelector('form[action="/logout"]');
    assert.equal(so.querySelector('[name=csrf]').value, 'csrf-token-1');
  });

  it('escapes injected values', () => {
    const html = renderDemoAdmin('overview', overviewCtx({ admin: { email: XSS } }));
    const doc = assertSafe(html);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(doc.body.textContent.includes(`x${XSS}@example.test`));
  });

  it('formats dates in the given time zone', () => {
    const doc = dom(renderDemoAdmin('overview', overviewCtx()));
    const expected = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Douala' }).format(new Date('2026-11-03T08:15:00Z'));
    assert.equal(doc.querySelector('tbody time').textContent, expected);
    assert.match(expected, /09:15/);
  });

  it('shows an empty state', () => {
    const ctx = overviewCtx();
    ctx.overview.requests = [];
    const doc = assertSafe(renderDemoAdmin('overview', ctx));
    assert.equal(doc.querySelector('[data-testid=requests]'), null);
    assert.equal(doc.querySelector('[data-testid=empty]').textContent, 'No demo access requests match.');
  });

  it('renders in French', () => {
    const doc = assertSafe(renderDemoAdmin('overview', overviewCtx({ locale: 'fr', langPath: '/demo-admin?status=pending' })));
    assert.equal(doc.documentElement.lang, 'fr');
    assert.equal(doc.querySelector('h1').textContent, 'Administration des démonstrations ADS');
    assert.deepEqual([...doc.querySelectorAll('nav a')].map(a => a.textContent), ['Demandes', 'Journal']);
    assert.match(doc.body.textContent, /Heures affichées en Africa\/Douala/);
    assert.match(doc.body.textContent, /Refus antérieur/);
    assert.equal(doc.querySelector('footer a').getAttribute('href'), '/demo-admin?status=pending&lang=en');
    const expected = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Douala' }).format(new Date('2026-11-03T08:15:00Z'));
    assert.equal(doc.querySelector('tbody time').textContent, expected);
  });
});

describe('demo admin page: request detail', () => {
  it('renders request, grant, email log and history', () => {
    const html = renderDemoAdmin('request', requestCtx());
    const doc = assertSafe(html);
    const text = doc.body.textContent;
    assert.match(text, /DA-0001/);
    assert.match(text, /internal — never shown to the applicant/);
    assert.equal(doc.querySelector('[data-testid=internal-note]').textContent, `note ${XSS}`);
    assert.ok(doc.querySelector('[data-testid=prior-rejection]'));
    assert.match(text, /French/); // applicant language
    assert.match(text, /Awaiting activation/);
    assert.deepEqual([...doc.querySelectorAll('[data-persona]')].map(e => e.textContent), ['Store manager', `Cashier ${XSS}`]);
    const emails = doc.querySelectorAll('[data-testid=emails] tbody tr');
    assert.equal(emails.length, 2);
    assert.match(emails[0].textContent, /Administrator notification/);
    assert.match(emails[0].textContent, /Sent \(accepted by provider\)/);
    assert.match(emails[1].textContent, /Invitation/);
    assert.match(emails[1].textContent, /Failed/);
    assert.match(emails[1].textContent, /SMTP <script>/);
    assert.match(text, /does not prove the message reached the inbox/);
    const hist = doc.querySelectorAll('[data-testid=history] tbody tr');
    assert.match(hist[0].textContent, /Access requested/);
    assert.match(hist[1].textContent, /custom_event/);
  });

  it('shows only allowed action forms, each with csrf, lang and action', () => {
    const doc = assertSafe(renderDemoAdmin('request', requestCtx({ approve: true, reject: true, resend: false, revoke: false })));
    const forms = [...doc.querySelectorAll('form[data-action]')];
    assert.deepEqual(forms.map(f => f.dataset.action), ['approve', 'reject']);
    for (const f of forms) {
      assert.equal(f.getAttribute('method'), 'post');
      assert.equal(f.getAttribute('action'), '/demo-admin/requests/r1');
      assert.equal(f.querySelector('[name=csrf]').value, 'csrf-token-1');
      assert.equal(f.querySelector('[name=lang]').value, 'en');
      assert.equal(f.querySelector('[name=action]').value, f.dataset.action);
    }
    assert.match(forms[0].textContent, /Approve & send invitation/);
    const note = forms[1].querySelector('textarea[name=note]');
    assert.ok(note);
    assert.match(forms[1].querySelector('label').textContent, /Internal reason/);

    const doc2 = dom(renderDemoAdmin('request', requestCtx({ approve: false, reject: false, resend: true, revoke: true })));
    assert.deepEqual([...doc2.querySelectorAll('form[data-action]')].map(f => f.dataset.action), ['resend', 'revoke']);
    assert.match(doc2.body.textContent, /Resend invitation/);
    assert.match(doc2.body.textContent, /Revoke access/);

    const doc3 = dom(renderDemoAdmin('request', requestCtx({})));
    assert.equal(doc3.querySelectorAll('form[data-action]').length, 0);
    assert.match(doc3.body.textContent, /No actions are available/);
  });

  it('handles no grant, no emails, no history and escapes email', () => {
    const ctx = requestCtx();
    Object.assign(ctx.request, { grant: null, emails: [], history: [] });
    ctx.request.request.priorRejection = false;
    const html = renderDemoAdmin('request', ctx);
    const doc = assertSafe(html);
    assert.ok(doc.querySelector('[data-testid=no-grant]'));
    assert.match(doc.body.textContent, /No emails recorded/);
    assert.match(doc.body.textContent, /No history recorded/);
    assert.equal(doc.querySelector('[data-testid=prior-rejection]'), null);
    assert.ok(html.includes('a&lt;script&gt;alert(1)&lt;/script&gt;@example.test'));
  });

  it('renders in French', () => {
    const doc = assertSafe(renderDemoAdmin('request', requestCtx({ approve: true, reject: true, resend: true, revoke: true }, { locale: 'fr' })));
    const text = doc.body.textContent;
    assert.match(text, /interne — jamais montrée au demandeur/);
    assert.match(text, /Approuver et envoyer l'invitation/);
    assert.match(text, /Refuser/);
    assert.match(text, /Renvoyer l'invitation/);
    assert.match(text, /Révoquer l'accès/);
    assert.match(text, /Envoyé \(accepté par le fournisseur\)/);
    assert.match(text, /Avis de refus|Notification administrateur/);
    for (const f of doc.querySelectorAll('form[data-action]')) assert.equal(f.querySelector('[name=lang]').value, 'fr');
  });
});

describe('demo admin page: flash and errors', () => {
  for (const [code, en, fr] of [
    ['approved', /Request approved/, /Demande approuvée/],
    ['rejected', /Request rejected/, /Demande refusée/],
    ['resent', /Invitation queued for resending/, /Invitation remise/],
    ['revoked', /Demo access revoked/, /Accès de démonstration révoqué/],
  ]) {
    it(`flash ${code}`, () => {
      assert.match(dom(renderDemoAdmin('request', requestCtx(undefined, { flash: code }))).querySelector('.ok').textContent, en);
      assert.match(dom(renderDemoAdmin('request', requestCtx(undefined, { flash: code, locale: 'fr' }))).querySelector('.ok').textContent, fr);
    });
  }
  for (const [code, en] of [
    ['REQUEST_NOT_PENDING', /already been decided/], ['GRANT_NOT_ACTIVE', /no longer active/], ['NOTHING_TO_RESEND', /no pending invitation/],
    ['FORM_EXPIRED', /form expired/], ['NOT_FOUND', /Request not found/], ['SOMETHING_ELSE', /Something went wrong/],
  ]) {
    it(`error ${code}`, () => {
      const box = dom(renderDemoAdmin('overview', overviewCtx({ error: code }))).querySelector('.error[role=alert]');
      assert.match(box.textContent, en);
    });
  }
  it('error in French', () => {
    assert.match(dom(renderDemoAdmin('overview', overviewCtx({ error: 'FORM_EXPIRED', locale: 'fr' }))).querySelector('.error').textContent, /formulaire a expiré/);
  });
});

describe('demo admin page: audit and denied', () => {
  it('renders audit events with labels and fallback', () => {
    const doc = assertSafe(renderDemoAdmin('audit', auditCtx([
      { at: '2026-11-03T08:15:00Z', event: 'demo_access_approved', actor: XSS, reference: 'DA-0001', platform: 'commerce', detail: null },
      { at: '2026-11-03T09:15:00Z', event: 'unknown_thing', actor: 'system', reference: null, platform: null, detail: 'x' },
    ])));
    const rows = doc.querySelectorAll('[data-testid=audit] tbody tr');
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /Approved/);
    assert.ok(rows[0].textContent.includes(XSS));
    assert.match(rows[1].textContent, /unknown_thing/);
    assert.equal(doc.querySelector('nav a[aria-current]').textContent, 'Audit');
  });

  it('renders audit empty state and French labels', () => {
    const doc = assertSafe(renderDemoAdmin('audit', auditCtx([])));
    assert.equal(doc.querySelector('[data-testid=empty]').textContent, 'No events recorded.');
    const fr = dom(renderDemoAdmin('audit', { ...auditCtx([{ at: '2026-11-03T08:15:00Z', event: 'demo_access_revoked', actor: 'a', reference: 'r', platform: 'p', detail: '' }]), locale: 'fr' }));
    assert.match(fr.body.textContent, /Accès révoqué/);
  });

  it('renders denied with 403 message and sign-out, no admin nav', () => {
    const doc = assertSafe(renderDemoAdmin('denied', base({ admin: { email: `u${XSS}@example.test` } })));
    assert.match(doc.body.textContent, /403/);
    assert.match(doc.body.textContent, /not an ADS demo administrator/);
    assert.ok(doc.body.textContent.includes(`u${XSS}@example.test`));
    assert.equal(doc.querySelector('nav'), null);
    const so = doc.querySelector('form[action="/logout"]');
    assert.equal(so.getAttribute('method'), 'post');
    assert.equal(so.querySelector('[name=csrf]').value, 'csrf-token-1');
    const fr = dom(renderDemoAdmin('denied', base({ locale: 'fr' })));
    assert.match(fr.body.textContent, /Accès refusé \(403\)/);
    assert.match(fr.body.textContent, /Se déconnecter/);
  });

  it('every style element carries the nonce', () => {
    for (const html of [renderDemoAdmin('overview', overviewCtx()), renderDemoAdmin('request', requestCtx()), renderDemoAdmin('denied', base())]) {
      const styles = [...dom(html).querySelectorAll('style')];
      assert.ok(styles.length >= 1);
      for (const s of styles) assert.equal(s.getAttribute('nonce'), 'n0nce');
      assert.ok(!/\sstyle=/.test(html), 'no inline style attributes');
    }
  });
});
