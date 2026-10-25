import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ApifyClient } from '../../../src/server/data/apify.ts';
import { extractFeatures, EXTRACTION_PROMPT_VERSION } from '../../../src/server/taste/index.ts';
import { processRefreshJobs, safeSecretEqual, type Rpc } from '../_shared/worker.ts';

Deno.serve(async request => {
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  if (!await safeSecretEqual(request.headers.get('x-worker-secret'),Deno.env.get('WORKER_SECRET'))) return new Response('Unauthorized',{status:401});
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), token=Deno.env.get('APIFY_TOKEN');
  if (!url||!key||!token) return Response.json({error:'Worker credentials are incomplete'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc: Rpc=async(name,args)=>{const result=await db.rpc(name,args);return {data:result.data,error:result.error};};
  try {
    const result=await processRefreshJobs({rpc,apify:new ApifyClient(token),extract:extractFeatures,anthropicKey:Deno.env.get('ANTHROPIC_API_KEY'),extractModel:Deno.env.get('ANTHROPIC_EXTRACT_MODEL')??'claude-haiku-5-5',extractionVersion:EXTRACTION_PROMPT_VERSION,webhookUrl:`${url}/functions/v1/apify-webhook`,webhookSecret:Deno.env.get('APIFY_WEBHOOK_SECRET')});
    return Response.json(result);
  } catch { return Response.json({error:'Worker processing failed'},{status:500}); }
});
