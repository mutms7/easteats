import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EmailAuthError, requestPasswordReset, setNewPassword, signInWithEmail, signUpWithEmail, type EmailAuthClient } from '../src/email-auth.ts';

// The website tests cover the shared rules and error mapping in src/lib/account-rules.ts.
// These cover what's different on the phone: Supabase is called directly with the app callback.
const REDIRECT = 'easteats://auth/callback';
const PASSWORD = 'correct horse battery';
let calls: { name: string; args: unknown[] }[] = [];
let responses: Partial<Record<keyof EmailAuthClient, unknown>> = {};
const client = new Proxy({}, { get: (_target, name: string) => async (...args: unknown[]) => { calls.push({ name, args }); const value = responses[name as keyof EmailAuthClient]; if (value instanceof Error) throw value; return value ?? { data: { session: null }, error: null }; } }) as EmailAuthClient;
beforeEach(() => { calls = []; responses = {}; });

describe('native email accounts', () => {
  it('signs up through the app callback with a normalized email and the name', async () => {
    const result = await signUpWithEmail(client, REDIRECT, { name: ' Fixture Diner ', email: ' Fixture@Example.Invalid ', password: PASSWORD });
    assert.deepEqual(calls, [{ name: 'signUp', args: [{ email: 'fixture@example.invalid', password: PASSWORD, options: { emailRedirectTo: REDIRECT, data: { full_name: 'Fixture Diner' } } }] }]);
    assert.equal(result.status, 'sent'); assert.match(result.status === 'sent' ? result.message : '', /on this phone/);
    responses.signUp = { data: { session: {} }, error: null };
    assert.deepEqual(await signUpWithEmail(client, REDIRECT, { name: 'Fixture', email: 'fixture@example.invalid', password: PASSWORD }), { status: 'signed-in' });
  });
  it('checks the name and password on the phone before calling Supabase', async () => {
    await assert.rejects(signUpWithEmail(client, REDIRECT, { name: ' ', email: 'fixture@example.invalid', password: PASSWORD }), /Add your name/);
    await assert.rejects(signUpWithEmail(client, REDIRECT, { name: 'Fixture', email: 'fixture@example.invalid', password: 'seven77' }), /at least 8/);
    await assert.rejects(setNewPassword(client, 'seven77'), /at least 8/);
    assert.deepEqual(calls, []);
  });
  it('maps a wrong password to the same message as the website and rejects a missing session', async () => {
    responses.signInWithPassword = { data: { session: null }, error: { code: 'invalid_credentials', status: 400 } };
    await assert.rejects(signInWithEmail(client, { email: 'fixture@example.invalid', password: PASSWORD }), /don’t match an account/);
    responses.signInWithPassword = { data: { session: null }, error: null };
    await assert.rejects(signInWithEmail(client, { email: 'fixture@example.invalid', password: PASSWORD }), /couldn’t reach/);
  });
  it('sends the reset link to this phone without revealing whether the account exists', async () => {
    const result = await requestPasswordReset(client, REDIRECT, ' Fixture@Example.Invalid ');
    assert.deepEqual(calls, [{ name: 'resetPasswordForEmail', args: ['fixture@example.invalid', { redirectTo: REDIRECT }] }]);
    assert.match(result.status === 'sent' ? result.message : '', /^If an account uses fixture@example\.invalid.*on this phone/);
    responses.resetPasswordForEmail = { error: { code: 'over_email_send_rate_limit', status: 429 } };
    assert.deepEqual(await requestPasswordReset(client, REDIRECT, 'fixture@example.invalid'), result);
  });
  it('carries the account-exists code so the screen can switch to sign in', async () => {
    responses.signUp = { data: { session: null }, error: { code: 'user_already_exists', status: 422 } };
    await assert.rejects(signUpWithEmail(client, REDIRECT, { name: 'Fixture', email: 'fixture@example.invalid', password: PASSWORD }), (error: unknown) => error instanceof EmailAuthError && error.code === 'ACCOUNT_EXISTS');
  });
  it('saves the new password and signs out other devices, even if that sign-out fails', async () => {
    responses.signOut = new Error('offline');
    await setNewPassword(client, PASSWORD);
    assert.deepEqual(calls.map(call => [call.name, call.args[0]]), [['updateUser', { password: PASSWORD }], ['signOut', { scope: 'others' }]]);
  });
  it('reports a rejected new password and keeps other devices signed in', async () => {
    responses.updateUser = { error: { code: 'same_password', status: 422 } };
    await assert.rejects(setNewPassword(client, PASSWORD), /haven’t used/);
    assert.deepEqual(calls.map(call => call.name), ['updateUser']);
  });
});
