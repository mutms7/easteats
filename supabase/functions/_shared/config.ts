import { safeSecretEqual, type Rpc } from './worker.ts';

export const WORKER_CONFIG_KEYS = ['APIFY_TOKEN','ANTHROPIC_API_KEY','ANTHROPIC_EXTRACT_MODEL','WORKER_SECRET','APIFY_WEBHOOK_SECRET','SUPABASE_URL'] as const;
export type WorkerConfig = Partial<Record<typeof WORKER_CONFIG_KEYS[number],string>>;
/** This RPC is service-only. Never pass a user-scoped or publishable client here. */
export async function loadWorkerConfig(rpc: Rpc, env: Record<string,string|undefined>): Promise<WorkerConfig> {
  const {data,error}=await rpc('get_worker_secrets');
  if (error || data===null || typeof data!=='object' || Array.isArray(data)) throw new Error('Worker configuration unavailable');
  const values=data as Record<string,unknown>;
  const config:WorkerConfig={};
  for (const key of WORKER_CONFIG_KEYS) {
    const value=env[key]?.trim()?env[key]:values[key];
    if (typeof value==='string'&&value.trim()) config[key]=value;
  }
  return config;
}

/** Authentication and configuration finish before the job is detached from the HTTP response. */
export async function handleRefreshRequest(
  request: Request,
  load: () => Promise<WorkerConfig>,
  process: (config:WorkerConfig) => Promise<unknown>,
  waitUntil: (task:Promise<unknown>) => void,
): Promise<Response> {
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  const supplied=request.headers.get('x-worker-secret');
  if (!supplied) return new Response('Unauthorized',{status:401});
  let config:WorkerConfig;
  try { config=await load(); } catch { return Response.json({error:'Worker configuration unavailable'},{status:503}); }
  if (!await safeSecretEqual(supplied,config.WORKER_SECRET)) return new Response('Unauthorized',{status:401});
  if (!config.APIFY_TOKEN||!config.SUPABASE_URL||!config.APIFY_WEBHOOK_SECRET) return Response.json({error:'Worker credentials are incomplete'},{status:503});
  waitUntil(Promise.resolve().then(()=>process(config)).catch(()=>{console.error('East Eats background refresh failed; queue lease will permit recovery.');}));
  return Response.json({accepted:true},{status:202});
}
