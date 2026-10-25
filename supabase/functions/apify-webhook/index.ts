import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ApifyClient } from '../../../src/server/data/apify.ts';
import { reconcileWebhook, safeSecretEqual, type Rpc } from '../_shared/worker.ts';

Deno.serve(async request => {
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  if (!await safeSecretEqual(request.headers.get('x-webhook-secret'),Deno.env.get('APIFY_WEBHOOK_SECRET'))) return new Response('Unauthorized',{status:401});
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), token=Deno.env.get('APIFY_TOKEN');
  if (!url||!key||!token) return Response.json({error:'Worker credentials are incomplete'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc: Rpc=async(name,args)=>{const result=await db.rpc(name,args);return {data:result.data,error:result.error};};
  try {
    const payload=await request.json();
    const id=payload?.resource?.id??payload?.eventData?.actorRunId;
    if (typeof id!=='string'||id.length>200) return Response.json({error:'Missing run ID'},{status:400});
    const found=await reconcileWebhook(id,{rpc,apify:new ApifyClient(token)});
    return Response.json({accepted:found},{status:found?202:404});
  } catch { return Response.json({error:'Callback reconciliation failed'},{status:500}); }
});
