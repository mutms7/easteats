import type { SupabaseClient } from '@supabase/supabase-js';
import { savedLocationSchema, type SavedLocation } from '@/lib/contracts';

export async function readHomeAddress(client: SupabaseClient, userId: string): Promise<SavedLocation|null> {
  const { data, error } = await client.from('location_preferences').select('home_address').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.home_address ? savedLocationSchema.parse(data.home_address) : null;
}
