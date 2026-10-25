import type { SupabaseClient } from '@supabase/supabase-js';
import { ApifyClient } from './apify.ts';
import { processRefreshJobs, type Rpc } from '../../../supabase/functions/_shared/worker.ts';
import { extractFeatures, EXTRACTION_PROMPT_VERSION } from '../taste/index.ts';

export interface WorkerEnv { APIFY_TOKEN?: string; ANTHROPIC_API_KEY?: string; ANTHROPIC_EXTRACT_MODEL?: string; NEXT_PUBLIC_SUPABASE_URL?: string; APIFY_WEBHOOK_SECRET?: string; }
export async function processJobs(admin: SupabaseClient, env: WorkerEnv) {
  if (!env.APIFY_TOKEN) throw new Error('APIFY_TOKEN is required');
  const rpc: Rpc=async(name,args)=>{const result=await admin.rpc(name,args);return {data:result.data,error:result.error};};
  return processRefreshJobs({rpc,apify:new ApifyClient(env.APIFY_TOKEN),extract:extractFeatures,anthropicKey:env.ANTHROPIC_API_KEY,extractModel:env.ANTHROPIC_EXTRACT_MODEL??'claude-haiku-5-5',extractionVersion:EXTRACTION_PROMPT_VERSION,...(env.NEXT_PUBLIC_SUPABASE_URL&&env.APIFY_WEBHOOK_SECRET?{webhookUrl:`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/apify-webhook`,webhookSecret:env.APIFY_WEBHOOK_SECRET}:{})});
}
