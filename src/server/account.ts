export function accountDetails(user: { id: string; email?: string; new_email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) {
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const linked = user.app_metadata?.providers;
  const providers: unknown[] = Array.isArray(linked) ? linked : [user.app_metadata?.provider];
  const provider = providers.includes('google') ? 'google' as const : providers.includes('email') ? 'email' as const : undefined;
  return { id: user.id, email: user.email ?? '', name: typeof name === 'string' ? name : '', pendingEmail: user.new_email || null, provider };
}
