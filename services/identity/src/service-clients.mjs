// Service clients (OAuth 2.0 client_credentials, RFC 6749 §4.4) and per-client token exchange
// allow lists (RFC 8693). Shared by the reviewed client list check (demo.mjs validateClientList),
// the operator CLI (register-client) and the token endpoint, so a bad entry is refused everywhere.
//
// Reviewed list (config/clients.demo.json):
//   service_clients: [{ client_id, kind: "service", display_name, allowedServiceScopes: [...], allowedAudiences: [...],
//                       client_secret_setting?, notes? }]
//   products[i].tokenExchange: [{ audience, scopes: [...] }]   (sign-in clients only; needs_client_secret: true)
//
// Service scopes are namespaced ("commerce.sector_offers", "agri.input_vouchers"), so they can never be
// confused with the admin API scopes ("members:read") or OpenID scopes. Audiences look like client ids
// but must NOT be the id of any registered client: a product accepts tokens whose audience is its own
// client id as signed-in user tokens, so a service or exchanged token must never carry one.
export const CLIENT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const SERVICE_SCOPE = /^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39}){1,4}$/;
export const AUDIENCE = CLIENT_ID;
export const CLIENT_KINDS = ['web', 'service'];

const fail = message => { throw new Error(message); };

function distinctList(value, pattern, where, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length)) fail(`${where} must be a non-empty list`);
  if (value.length > 20) fail(`${where} has more than 20 entries`);
  for (const v of value) if (typeof v !== 'string' || !pattern.test(v)) fail(`${where}: bad value ${JSON.stringify(v)}`);
  if (new Set(value).size !== value.length) fail(`${where} has duplicates`);
  return [...value];
}

// [{ audience, scopes }] -> the same, checked. clientIds: every client id in the list (audiences may not be one).
export function validateTokenExchange(list, where, clientIds = new Set()) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) fail(`${where}: tokenExchange must be a list`);
  if (list.length > 10) fail(`${where}: tokenExchange has more than 10 entries`);
  const seen = new Set();
  return list.map((e, i) => {
    const at = `${where}: tokenExchange[${i}]`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`${at} must be { audience, scopes }`);
    const extra = Object.keys(e).filter(k => !['audience', 'scopes'].includes(k));
    if (extra.length) fail(`${at}: unknown field ${extra[0]}`);
    if (typeof e.audience !== 'string' || !AUDIENCE.test(e.audience)) fail(`${at}: bad audience ${JSON.stringify(e.audience)}`);
    if (clientIds.has(e.audience)) fail(`${at}: audience ${e.audience} is a client id (tokens for it would pass as that product's sign-in tokens)`);
    if (seen.has(e.audience)) fail(`${at}: audience ${e.audience} listed twice`);
    seen.add(e.audience);
    return { audience: e.audience, scopes: distinctList(e.scopes, SERVICE_SCOPE, `${at}.scopes`) };
  });
}

// Fields a service client must not carry (it has no users, no sign-in pages and no roles).
const NOT_FOR_SERVICE = ['redirect_uris', 'post_logout_redirect_uris', 'self_service_roles', 'admin_scopes', 'admin_roles', 'assignable_roles',
  'ads_only_roles', 'demo_orgs', 'tenant_settings', 'tokenExchange'];

export function validateServiceClient(p, clientIds = new Set()) {
  const where = `service client ${p?.client_id}`;
  if (!p || typeof p !== 'object') fail('service client entry must be an object');
  if (!CLIENT_ID.test(String(p.client_id))) fail(`bad client_id ${p.client_id}`);
  if (p.kind !== 'service') fail(`${where}: kind must be "service"`);
  if (typeof p.display_name !== 'string' || !p.display_name.trim() || p.display_name.length > 120) fail(`${where}: display_name required`);
  for (const k of NOT_FOR_SERVICE) {
    const v = p[k];
    if (v !== undefined && !(Array.isArray(v) && !v.length) && !(v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) fail(`${where}: ${k} is not allowed on a service client`);
  }
  if (p.allow_personal_workspace === true) fail(`${where}: allow_personal_workspace is not allowed on a service client`);
  if (p.demo_access_denied_redirect === true) fail(`${where}: demo_access_denied_redirect is not allowed on a service client`);
  // A service client authenticates with its secret: always needs one.
  if (p.needs_client_secret !== undefined && p.needs_client_secret !== true) fail(`${where}: needs_client_secret must be true (or left out)`);
  const scopes = distinctList(p.allowedServiceScopes, SERVICE_SCOPE, `${where}: allowedServiceScopes`);
  const audiences = distinctList(p.allowedAudiences, AUDIENCE, `${where}: allowedAudiences`);
  for (const a of audiences) if (clientIds.has(a)) fail(`${where}: audience ${a} is a client id (tokens for it would pass as that product's sign-in tokens)`);
  return { scopes, audiences };
}

// Sign-in (web) client: refuses service-only fields and checks its exchange allow list.
export function validateWebClientServiceFields(p, clientIds = new Set()) {
  const where = String(p.client_id);
  if (p.kind !== undefined && p.kind !== 'web') fail(`${where}: kind "${p.kind}" is not allowed in products (service clients go in service_clients)`);
  for (const k of ['allowedServiceScopes', 'allowedAudiences']) if (p[k] !== undefined) fail(`${where}: ${k} is only for service clients`);
  const tokenExchange = validateTokenExchange(p.tokenExchange, where, clientIds);
  if (tokenExchange.length && p.needs_client_secret !== true) fail(`${where}: tokenExchange needs needs_client_secret: true (the product server authenticates with its secret)`);
  return tokenExchange;
}

// Parses a space-separated OAuth scope parameter (RFC 6749 §3.3). null when absent.
export function parseScope(value) {
  if (value === undefined || value === null || value === '') return null;
  const list = String(value).split(' ').filter(Boolean);
  return [...new Set(list)];
}
