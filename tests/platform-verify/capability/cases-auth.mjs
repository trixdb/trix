import { API_URL, API_KEY, STAMP, ok, fail, skip } from './lib.mjs';

// AU — Interactive auth / session lifecycle (round 6). The rest of the
// capability suite runs on a single SERVICE api key (gdb_, is_service=true) via
// lib.api(), which BYPASSES login entirely — so the JWT email/password path
// (and the P1 login-500 class) is structurally invisible to it. This module
// drives the real POST /v1/auth/* flow with its own JWT-aware fetch helper.
//
// SAFETY (see recon security_path). loginSecurity is wired in prod, so lockout
// (5 fails/15min, DURABLE in Postgres) and the login limiter (login:{ip}:{email}
// = 5/15min, counts successes too) are both real. Rules this module obeys:
//   * REUSE a founder-supplied account (TRIX_TEST_EMAIL/PASSWORD); never
//     register/delete throwaways (no public DELETE /me; register is 1/email/24h)
//     — SKIP the whole flow cleanly when the env vars are unset.
//   * Exactly ONE real-account login per run (the AU1 happy path).
//   * Every 401 negative uses a RANDOM nonexistent email → failureReason=
//     user_not_found → handleFailedLogin no-ops → no account ever locked, and
//     the per-email bucket stays fresh. We NEVER wrong-password the real account.
//   * forgot-password uses a random email (enumeration-safe 200, nothing sent).
//   * register is only probed with non-durable negatives (disposable→400,
//     dup-email→409, missing-invite→400) against random emails (fresh buckets),
//     except the dup-email 409 which intentionally reuses the known email.

const TEST_EMAIL = process.env.TRIX_TEST_EMAIL;
const TEST_PASSWORD = process.env.TRIX_TEST_PASSWORD;
const VALID_PW = 'ValidPass123!'; // strong throwaway pw for register negatives (never creates a row)

const randTag = () => Math.random().toString(36).slice(2, 10);
const randomEmail = () => `capsuite-au-${STAMP}-${randTag()}@example.com`;
const isJwt = (t) => typeof t === 'string' && t.split('.').length === 3;
const clip = (b) => JSON.stringify(b ?? null).slice(0, 90);

// Raw auth fetch: lib.api() hardcodes the service-key bearer, so AU needs its
// own helper to send email/password bodies and JWT (or no) bearers.
async function authApi(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 / empty */ }
  return { status: res.status, body: json };
}

export async function authSuite() {
  // The credentialed login flow self-skips when TRIX_TEST_EMAIL/PASSWORD are
  // unset. The negatives + register probes are fully cred-free and prod-safe,
  // so they run on EVERY invocation (incl. the plain service-key CI run) and
  // would catch even a total login outage without creds (AU9 hits /login).
  await authFlow();
  await authNegatives();
  await registerNegatives();
}

async function authNegatives() {
  // AU9 invalid credentials → 401 (never 500). Random nonexistent email so
  // failureReason=user_not_found: no real account is locked, bucket stays fresh.
  const bad = await authApi('POST', 'v1/auth/login', { email: randomEmail(), password: 'definitely-not-the-password' });
  bad.status === 401
    ? ok('AU9', 'nonexistent-email login → 401 (no lockout path)')
    : fail('AU9', `expected 401, got ${bad.status} ${clip(bad.body)}`);

  // AU10 malformed body (missing required password) → 400 at schema validation,
  // which runs BEFORE the rate-limit preHandler so it burns no slot.
  const malformed = await authApi('POST', 'v1/auth/login', { email: randomEmail() });
  malformed.status === 400
    ? ok('AU10', 'missing password → 400 schema error')
    : fail('AU10', `expected 400, got ${malformed.status} ${clip(malformed.body)}`);

  // AU11 forgot-password is enumeration-safe: random email → generic 200, no
  // email sent and no user row touched.
  const forgot = await authApi('POST', 'v1/auth/forgot-password', { email: randomEmail() });
  forgot.status === 200 && typeof forgot.body?.message === 'string'
    ? ok('AU11', 'forgot-password neutral 200 (enumeration-safe)')
    : fail('AU11', `expected neutral 200, got ${forgot.status} ${clip(forgot.body)}`);
}

async function registerNegatives() {
  // AU12 disposable-domain registration → 400. The disposable check is the very
  // first thing the handler does (before invite/dup checks), so this holds
  // regardless of invite-gating and creates no row; random localpart → fresh bucket.
  const disp = await authApi('POST', 'v1/auth/register', {
    email: `capsuite-au-${randTag()}@mailinator.com`, password: VALID_PW,
  });
  disp.status === 400
    ? ok('AU12', 'disposable domain rejected → 400')
    : fail('AU12', `expected 400 disposable, got ${disp.status} ${clip(disp.body)}`);

  // AU13 gating-aware negative — probe the env at RUNTIME (the repo can't tell
  // us prod's REQUIRE_INVITE_CODE) and assert the matching non-durable negative.
  const probe = await authApi('GET', 'v1/auth/invite-required');
  if (probe.status !== 200 || typeof probe.body?.required !== 'boolean') {
    fail('AU13', `invite-required probe ${probe.status} ${clip(probe.body)}`);
    return;
  }
  probe.body.required ? await gatedRegisterNegative() : await openRegisterNegative();
}

async function gatedRegisterNegative() {
  // Gated: register without invite_code → 400, and a bogus code via
  // /validate-invite → 400. Random email → no durable state, fresh bucket.
  const email = randomEmail();
  const noInvite = await authApi('POST', 'v1/auth/register', { email, password: VALID_PW });
  const bogus = await authApi('POST', 'v1/auth/validate-invite', { code: 'NOPE12345', email });
  noInvite.status === 400 && bogus.status === 400
    ? ok('AU13', 'invite-gated: missing-invite 400 + bogus-code 400')
    : fail('AU13', `missing-invite=${noInvite.status} bogus-code=${bogus.status}`);
}

async function openRegisterNegative() {
  // Open registration: assert dup-email → 409 by reusing the REUSED account's
  // own email (existing email, so no new row). Needs TEST_EMAIL; skip otherwise.
  if (!TEST_EMAIL) { skip('AU13', 'open registration but no TRIX_TEST_EMAIL to assert dup-email 409'); return; }
  const dup = await authApi('POST', 'v1/auth/register', { email: TEST_EMAIL, password: VALID_PW });
  if (dup.status === 409) ok('AU13', 'dup-email → 409');
  else if (dup.status === 429) skip('AU13', 'register rate-limited (429) — safe, retry later');
  else fail('AU13', `expected 409 dup-email, got ${dup.status} ${clip(dup.body)}`);
}

async function authFlow() {
  const ids = ['AU1', 'AU2', 'AU3', 'AU4', 'AU5', 'AU6', 'AU7', 'AU8'];
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    ids.forEach((id) => skip(id, 'set TRIX_TEST_EMAIL/TRIX_TEST_PASSWORD to exercise the login flow'));
    return;
  }
  const login = await authApi('POST', 'v1/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
  if (!gradeLogin(login)) { ids.slice(1).forEach((id) => skip(id, 'prereq AU1 login')); return; }
  await assertMe(login.body.token);
  await assertRefresh(login.body.refresh_token);
  await assertSwitch(login.body.token, login.body.account?.id);
  await assertLogout(login.body.token);
}

// AU1 login happy path — 200 with a full JWT+refresh pair. The explicit 500
// guard is the P1 regression the whole service-key suite could never trip.
function gradeLogin(r) {
  if (r.status === 500) { fail('AU1', `login 500 — P1 login regression: ${clip(r.body)}`); return false; }
  if (r.status === 429) { skip('AU1', 'login rate-limited (429) — keep runs <5/15min'); return false; }
  if (r.status === 423) { skip('AU1', 'account locked (423) — not exercising the lockout path'); return false; }
  const good = r.status === 200 && isJwt(r.body?.token)
    && typeof r.body?.refresh_token === 'string' && r.body.refresh_token.startsWith('gdr_')
    && r.body?.user?.id && r.body?.account?.id;
  if (good) { ok('AU1', 'login 200 with JWT+refresh pair (never 500)'); return true; }
  fail('AU1', `login ${r.status} ${clip(r.body)}`);
  return false;
}

async function assertMe(token) {
  // AU2 the JWT works on an authenticated GET.
  const me = await authApi('GET', 'v1/auth/me', undefined, token);
  me.status === 200 && me.body?.user?.id && Array.isArray(me.body?.accounts)
    ? ok('AU2', 'GET /me → 200 with JWT')
    : fail('AU2', `GET /me ${me.status} ${clip(me.body)}`);

  // AU3 the service API key (gdb_) is rejected on the same JWT-only route — this
  // is exactly why the service-key suite cannot reach this flow.
  const asKey = await authApi('GET', 'v1/auth/me', undefined, API_KEY);
  asKey.status === 401
    ? ok('AU3', 'API key on /me → 401 (authenticateUser JWT-only gate)')
    : fail('AU3', `expected 401 for API key on /me, got ${asKey.status}`);
}

async function assertRefresh(refresh) {
  // AU4 refresh rotation issues a fresh JWT + a successor refresh token.
  const rot = await authApi('POST', 'v1/auth/refresh', { refresh_token: refresh });
  rot.status === 200 && isJwt(rot.body?.token)
    && typeof rot.body?.refresh_token === 'string' && rot.body.refresh_token !== refresh
    && rot.body?.token_type === 'Bearer' && rot.body?.expires_in === 604800
    ? ok('AU4', 'refresh rotated to a new JWT+token pair')
    : fail('AU4', `refresh ${rot.status} ${clip(rot.body)}`);

  // AU5 replaying the now-consumed refresh token → 401 (single-use rotation;
  // presenting a revoked token burns the whole family — token_reuse_detected).
  const reuse = await authApi('POST', 'v1/auth/refresh', { refresh_token: refresh });
  reuse.status === 401
    ? ok('AU5', 'consumed refresh token replay → 401 (family burn)')
    : fail('AU5', `expected 401 on refresh reuse, got ${reuse.status}`);
}

async function assertSwitch(token, accountId) {
  // AU6 switch-account to the caller's OWN account → 200 with a rebound JWT
  // (membership exists; a safe no-op switch that issues no refresh token).
  if (!accountId) { skip('AU6', 'no account id from login'); return; }
  const sw = await authApi('POST', `v1/auth/switch-account/${accountId}`, {}, token);
  sw.status === 200 && isJwt(sw.body?.token) && sw.body?.account?.id === accountId
    ? ok('AU6', 'switch-account → 200 with rebound JWT')
    : fail('AU6', `switch-account ${sw.status} ${clip(sw.body)}`);
}

async function assertLogout(token) {
  // AU7 logout blacklists the JWT for its remaining TTL.
  const out = await authApi('POST', 'v1/auth/logout', {}, token);
  out.status === 200
    ? ok('AU7', 'logout → 200')
    : fail('AU7', `logout ${out.status} ${clip(out.body)}`);

  // AU8 the same JWT is now revoked on any authenticated route.
  const after = await authApi('GET', 'v1/auth/me', undefined, token);
  after.status === 401
    ? ok('AU8', 'post-logout JWT → 401 (revoked/blacklisted)')
    : fail('AU8', `expected 401 after logout, got ${after.status}`);
}
