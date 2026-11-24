// A tiny in-memory stand-in for Supabase Auth, so browser tests can drive the real /auth routes,
// cookies, PKCE codes and redirects end to end. Emails land in a mailbox the tests read at /__mail.
// Database reads return nothing, which looks like a brand-new account. Test-only; never deployed.
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const port = Number(process.argv[2] || 3198);
const users = new Map(); // email -> user record
const sessions = new Map(); // access or refresh token -> { userId, sessionId }
const codes = new Map(); // auth code -> { userId, challenge, method, type }
const mail = new Map(); // email -> [{ type, link }]

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const publicUser = user => ({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_confirmed_at: user.confirmed ? user.createdAt : null,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: user.metadata,
  identities: [{ id: user.id, identity_id: user.id, user_id: user.id, provider: 'email', identity_data: { email: user.email, sub: user.id } }], created_at: user.createdAt, updated_at: user.createdAt });
function issueSession(user) {
  const sessionId = randomUUID(), exp = now() + 3600;
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', exp, iat: now(), session_id: sessionId })}.${b64(randomUUID())}`;
  const refresh = randomUUID();
  sessions.set(access, { userId: user.id, sessionId }); sessions.set(refresh, { userId: user.id, sessionId });
  return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: exp, user: publicUser(user) };
}
const byId = id => [...users.values()].find(user => user.id === id);
function bearer(request) {
  const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
  const found = token && sessions.get(token);
  return found ? { token, ...found, user: byId(found.userId) } : null;
}
function sendMail(user, type, redirect) {
  const code = randomUUID();
  codes.set(code, { userId: user.id, challenge: user.pendingChallenge, method: user.pendingMethod, type });
  const list = mail.get(user.email) ?? []; list.push({ type, link: `${redirect}${redirect.includes('?') ? '&' : '?'}code=${code}` }); mail.set(user.email, list);
}
const challengeMatches = (stored, method, verifier) => typeof verifier === 'string' && (method === 's256' ? createHash('sha256').update(verifier).digest('base64url') === stored : verifier === stored);

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  let raw = ''; for await (const chunk of request) raw += chunk;
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
  const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(value === undefined ? '' : JSON.stringify(value)); };
  const fail = (status, code, msg) => send(status, { code: status, error_code: code, msg });
  const path = url.pathname;

  if (path === '/__health') return send(200, { ok: true });
  if (path === '/__mail') return send(200, mail.get((url.searchParams.get('email') ?? '').toLowerCase()) ?? []);

  if (path === '/auth/v1/settings') return send(200, { external: { google: true, email: true }, disable_signup: false, mailer_autoconfirm: false });
  if (path === '/auth/v1/signup' && request.method === 'POST') {
    const email = String(body.email ?? '').toLowerCase();
    const existing = users.get(email);
    // Like Supabase with "Confirm email" on: an existing address gets the same answer and no new account.
    if (existing) return send(200, { ...publicUser(existing), identities: [] });
    const user = { id: randomUUID(), email, password: body.password, metadata: body.data ?? {}, confirmed: false, createdAt: new Date().toISOString(), pendingChallenge: body.code_challenge, pendingMethod: body.code_challenge_method };
    users.set(email, user);
    sendMail(user, 'signup', url.searchParams.get('redirect_to') ?? '');
    return send(200, publicUser(user));
  }
  if (path === '/auth/v1/recover' && request.method === 'POST') {
    const user = users.get(String(body.email ?? '').toLowerCase());
    if (user) { user.pendingChallenge = body.code_challenge; user.pendingMethod = body.code_challenge_method; sendMail(user, 'recovery', url.searchParams.get('redirect_to') ?? ''); }
    return send(200, {});
  }
  if (path === '/auth/v1/token' && request.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const user = users.get(String(body.email ?? '').toLowerCase());
      if (!user || user.password !== body.password) return fail(400, 'invalid_credentials', 'Invalid login credentials');
      if (!user.confirmed) return fail(400, 'email_not_confirmed', 'Email not confirmed');
      return send(200, issueSession(user));
    }
    if (grant === 'pkce') {
      const entry = codes.get(body.auth_code);
      if (!entry || !challengeMatches(entry.challenge, entry.method, body.code_verifier)) return fail(400, 'bad_code_verifier', 'code challenge does not match previously saved code verifier');
      codes.delete(body.auth_code);
      const user = byId(entry.userId); user.confirmed = true;
      return send(200, issueSession(user));
    }
    if (grant === 'refresh_token') {
      const found = sessions.get(body.refresh_token);
      if (!found) return fail(400, 'refresh_token_not_found', 'Invalid Refresh Token');
      sessions.delete(body.refresh_token);
      return send(200, issueSession(byId(found.userId)));
    }
    return fail(400, 'validation_failed', 'Unsupported grant type');
  }
  if (path === '/auth/v1/user') {
    const current = bearer(request);
    if (!current) return fail(401, 'bad_jwt', 'invalid JWT');
    if (request.method === 'PUT') {
      if (typeof body.password === 'string') {
        if (body.password === current.user.password) return fail(422, 'same_password', 'New password should be different from the old password.');
        current.user.password = body.password;
      }
      if (body.data) Object.assign(current.user.metadata, body.data);
    }
    return send(200, publicUser(current.user));
  }
  if (path === '/auth/v1/logout' && request.method === 'POST') {
    const current = bearer(request);
    if (current) {
      const scope = url.searchParams.get('scope') ?? 'global';
      for (const [token, value] of sessions) {
        if (value.userId !== current.userId) continue;
        const same = value.sessionId === current.sessionId;
        if (scope === 'global' || (scope === 'local' && same) || (scope === 'others' && !same)) sessions.delete(token);
      }
    }
    response.writeHead(204); return response.end();
  }

  // PostgREST: a brand-new account has no rows yet.
  if (path.startsWith('/rest/v1/')) {
    if (request.method === 'GET' && /vnd\.pgrst\.object/.test(request.headers.accept ?? '')) return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows', hint: null });
    if (path.startsWith('/rest/v1/rpc/')) return send(200, null);
    return send(request.method === 'GET' ? 200 : 201, []);
  }
  return fail(404, 'not_found', `Fake Supabase has no ${request.method} ${path}`);
}).listen(port, '127.0.0.1');
