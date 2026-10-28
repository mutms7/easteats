import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AUTH_REDIRECT, callbackCode } from './policies';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
type ChunkIndex = { version: string; count: number };
function parseIndex(raw: string | null): ChunkIndex | null {
  if (!raw) return null;
  const data = JSON.parse(raw) as ChunkIndex;
  if (!/^[a-z0-9-]+$/i.test(data.version) || !Number.isInteger(data.count) || data.count < 1 || data.count > 500) throw new Error('Stored sign-in needs to be reset.');
  return data;
}
const chunkKey = (key: string, index: ChunkIndex, i: number) => `${key}.${index.version}.${i}`;
async function removeChunks(key: string, index: ChunkIndex | null) {
  if (index) await Promise.all(Array.from({ length: index.count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, index, i), options)));
}
// Splitting avoids historical per-item Keychain size limits. Only encrypted
// SecureStore holds sessions and PKCE verifiers, never AsyncStorage or logs.
const rawStorage = {
  async getItem(key: string) {
    const index = parseIndex(await SecureStore.getItemAsync(key, options));
    if (!index) return null;
    const chunks = await Promise.all(Array.from({ length: index.count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, index, i), options)));
    if (chunks.some(chunk => chunk === null)) throw new Error('Your stored sign-in is incomplete. Please sign in again.');
    return chunks.join('');
  },
  async setItem(key: string, value: string) {
    const old = parseIndex(await SecureStore.getItemAsync(key, options));
    const characters = Array.from(value);
    const next = { version: Crypto.randomUUID(), count: Math.ceil(characters.length / 400) || 1 };
    if (next.count > 500) throw new Error('This data is too large to save safely on this device.');
    await Promise.all(Array.from({ length: next.count }, (_, i) => SecureStore.setItemAsync(chunkKey(key, next, i), characters.slice(i * 400, (i + 1) * 400).join(''), options)));
    await SecureStore.setItemAsync(key, JSON.stringify(next), options);
    await removeChunks(key, old);
  },
  async removeItem(key: string) {
    const old = parseIndex(await SecureStore.getItemAsync(key, options));
    await SecureStore.deleteItemAsync(key, options);
    await removeChunks(key, old);
  },
};
const queues = new Map<string, Promise<void>>();
function write(key: string, operation: () => Promise<void>) {
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => {});
  return pending;
}
export const secureStorage = {
  async getItem(key: string) { await queues.get(key)?.catch(() => {}); return rawStorage.getItem(key); },
  setItem(key: string, value: string) { return write(key, () => rawStorage.setItem(key, value)); },
  removeItem(key: string) { return write(key, () => rawStorage.removeItem(key)); },
};
const publicUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(publicUrl?.startsWith('https://') && publicKey?.startsWith('sb_publishable_'));
export const supabase = configured ? createClient(publicUrl!, publicKey!, { auth: { storage: secureStorage, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
export function observeAppAuth() {
  const refresh = (state: string) => { if (state === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh(); };
  refresh(AppState.currentState ?? 'active');
  const subscription = AppState.addEventListener('change', refresh);
  return () => { subscription.remove(); supabase?.auth.stopAutoRefresh(); };
}
const exchanged = new Set<string>();
export async function completeSignIn(url: string) {
  if (!supabase) throw new Error('Mobile sign-in is waiting for configuration.');
  const code = callbackCode(url);
  if (exchanged.has(code)) return;
  exchanged.add(code);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) { exchanged.delete(code); throw new Error('Sign-in could not be completed. Please start again.'); }
}
let signingIn = false;
export async function signInGoogle() {
  if (!supabase) throw new Error('Mobile sign-in is waiting for configuration.');
  if (signingIn) return;
  signingIn = true;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error('Could not open Google sign-in. Please try again.');
    const response = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
    if (response.type === 'success') await completeSignIn(response.url);
  } finally { signingIn = false; }
}
export async function signInApple() {
  if (!supabase || process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED !== 'true') throw new Error('Apple sign-in is waiting for configuration.');
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashed });
  if (!credential.identityToken) throw new Error('Apple sign-in did not return an identity token.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw new Error('Apple sign-in could not finish. Please try again.');
}
