export function accountDetails(user: { id: string; email?: string; new_email?: string; user_metadata?: Record<string, unknown> }) {
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return { id: user.id, email: user.email ?? '', name: typeof name === 'string' ? name : '', pendingEmail: user.new_email || null };
}
