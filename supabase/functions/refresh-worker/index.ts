import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ApifyClient } from '../../../src/server/data/apify.ts';
import { extractFeatures, EXTRACTION_PROMPT_VERSION } from '../../../src/server/taste/index.ts';
import { processRefreshJobs, type Rpc } from '../_shared/worker.ts';
import { handleRefreshRequest, loadWorkerConfig } from '../_shared/config.ts';

Deno.serve(async request => {
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  if (!request.headers.get('x-worker-secret')) return new Response('Unauthorized',{status:401});
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url||!key) return Response.json({error:'Worker bootstrap is incomplete'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc: Rpc=async(name,args)=>{const result=await db.rpc(name,args);return {data:result.data,error:result.error};};
  return handleRefreshRequest(request,()=>loadWorkerConfig(rpc,Deno.env.toObject()),config=>processRefreshJobs({rpc,apify:new ApifyClient(config.APIFY_TOKEN!),extract:extractFeatures,anthropicKey:config.ANTHROPIC_API_KEY,extractModel:config.ANTHROPIC_EXTRACT_MODEL??'claude-haiku-5-5',extractionVersion:EXTRACTION_PROMPT_VERSION,webhookUrl:`${config.SUPABASE_URL!.replace(/\/$/,'')}/functions/v1/apify-webhook`,webhookSecret:config.APIFY_WEBHOOK_SECRET}),task=>EdgeRuntime.waitUntil(task));
});
