import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, Text, View } from 'react-native';
import { AUTH_REDIRECT } from './policies';
import { EmailAuthError, requestPasswordReset, setNewPassword, signInWithEmail, signUpWithEmail, type EmailAuthClient, type EmailResult } from './email-auth';
import { brand, Button, Field, s, T } from './ui';

type Mode = 'closed' | 'signup' | 'signin' | 'forgot';
const HEADING = { signup: 'Create your account', signin: 'Sign in with email', forgot: 'Reset your password' } as const;
const SUBMIT = { signup: ['Create account', 'Creating account…'], signin: ['Sign in', 'Signing in…'], forgot: ['Send reset link', 'Sending link…'] } as const;

// accessibilityLiveRegion only works on Android, so VoiceOver needs an explicit announcement.
function announce(message: string) { if (message) AccessibilityInfo.announceForAccessibility(message); }
// Moves the screen reader to a heading when a new step appears.
function useHeadingFocus(key: unknown) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => { const node = heading.current && findNodeHandle(heading.current); if (node) AccessibilityInfo.setAccessibilityFocus(node); }, [key]);
  return heading;
}

function TextLink({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', opacity: disabled ? .45 : 1 }}><T style={{ color: brand, fontWeight: '700', fontSize: 14 }}>{title}</T></Pressable>;
}

function PasswordInput({ label, value, onChange, kind, editable }: { label: string; value: string; onChange: (value: string) => void; kind: 'new' | 'current'; editable: boolean }) {
  const [show, setShow] = useState(false);
  return <View style={{ gap: 4 }}>
    <Field label={label} value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType={kind === 'new' ? 'newPassword' : 'password'} autoComplete={kind === 'new' ? 'new-password' : 'current-password'} maxLength={72} editable={editable} />
    <View style={{ alignItems: 'flex-end' }}><TextLink title={show ? 'Hide password' : 'Show password'} onPress={() => setShow(current => !current)} /></View>
  </View>;
}

// Email sign-up, sign-in and password reset for the signed-out screen. A successful sign-in or
// confirmation updates the Supabase session, and App's auth listener takes it from there.
export function EmailAuth({ client, disabled }: { client: EmailAuthClient | null; disabled?: boolean }) {
  const [mode, setMode] = useState<Mode>('closed');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState<{ message: string; after: 'confirm' | 'reset' } | null>(null);
  const pending = useRef(false);
  const heading = useHeadingFocus(`${mode}:${Boolean(sent)}`);
  const locked = busy || Boolean(disabled);
  function switchTo(next: Mode) { setMode(next); setError(''); setSent(null); setPassword(''); }
  async function submit() {
    if (!client || pending.current || locked || mode === 'closed') return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result: EmailResult = mode === 'signup' ? await signUpWithEmail(client, AUTH_REDIRECT, { name, email, password }) : mode === 'signin' ? await signInWithEmail(client, { email, password }) : await requestPasswordReset(client, AUTH_REDIRECT, email);
      setPassword('');
      if (result.status === 'sent') { setSent({ message: result.message, after: mode === 'forgot' ? 'reset' : 'confirm' }); announce(result.message); }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That didn’t go through. Please try again.';
      if (cause instanceof EmailAuthError && cause.code === 'ACCOUNT_EXISTS') { setMode('signin'); setPassword(''); }
      setError(message); announce(message);
    } finally { pending.current = false; setBusy(false); }
  }
  if (mode === 'closed') return <View style={{ gap: 12 }}>
    <Button title="Sign up with email" secondary disabled={disabled || !client} onPress={() => switchTo('signup')} />
    <Button title="Sign in with email" secondary disabled={disabled || !client} onPress={() => switchTo('signin')} />
  </View>;
  return <View style={[s.card, { gap: 14 }]}>
    <Text ref={heading} accessibilityRole="header" style={[s.text, s.sectionTitle]}>{HEADING[mode]}</Text>
    {sent ? <View accessibilityLiveRegion="polite" style={{ gap: 10 }}><T>{sent.message}</T><Button title={sent.after === 'confirm' ? 'I’ve confirmed, sign me in' : 'Back to sign in'} secondary onPress={() => switchTo('signin')} /></View> : <>
      {mode === 'forgot' && <T style={s.small}>Enter the email you signed up with and we’ll send you a link to choose a new password.</T>}
      {mode === 'signup' && <Field label="Name" value={name} onChangeText={setName} textContentType="name" autoComplete="name" maxLength={100} editable={!locked} />}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType={mode === 'signup' ? 'emailAddress' : 'username'} autoComplete={mode === 'signup' ? 'email' : 'username'} maxLength={254} editable={!locked} />
      {mode !== 'forgot' && <PasswordInput label="Password" value={password} onChange={setPassword} kind={mode === 'signup' ? 'new' : 'current'} editable={!locked} />}
      {mode === 'signup' && <T style={s.small}>At least 8 characters.</T>}
      {mode === 'signin' && <View style={{ alignItems: 'flex-start' }}><TextLink title="Forgot password?" disabled={locked} onPress={() => switchTo('forgot')} /></View>}
      {error ? <T accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.small, { color: '#B31F0B' }]}>{error}</T> : null}
      <Button title={SUBMIT[mode][busy ? 1 : 0]} disabled={locked} onPress={() => { void submit(); }} />
    </>}
    {mode === 'forgot' ? !sent && <TextLink title="Back to sign in" disabled={locked} onPress={() => switchTo('signin')} /> : <TextLink title={mode === 'signup' ? 'Already have an account? Sign in' : 'New to East Eats? Create an account'} disabled={locked} onPress={() => switchTo(mode === 'signup' ? 'signin' : 'signup')} />}
  </View>;
}

// Shown instead of the app after this phone opens its own reset link.
export function NewPassword({ client, email, onDone, onCancel }: { client: EmailAuthClient; email?: string; onDone: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const heading = useHeadingFocus('new-password');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try { await setNewPassword(client, password); setPassword(''); onDone(); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Your password wasn’t changed. Please try again.'; setError(message); announce(message); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 18 }}>
    <Text ref={heading} accessibilityRole="header" style={[s.text, s.title]}>Choose a new password.</Text>
    {email ? <T style={s.subtitle}>For {email}</T> : null}
    <PasswordInput label="New password" value={password} onChange={setPassword} kind="new" editable={!busy} />
    <T style={s.small}>At least 8 characters. Other devices using the old password will be signed out.</T>
    {error ? <T accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[s.small, { color: '#B31F0B' }]}>{error}</T> : null}
    <Button title={busy ? 'Saving password…' : 'Save new password'} disabled={busy} onPress={() => { void save(); }} />
    <Button title="Not now" secondary disabled={busy} onPress={onCancel} />
  </View>;
}
