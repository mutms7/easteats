import { describe,it,expect,vi } from 'vitest';
import { handleRefreshRequest,loadWorkerConfig,type WorkerConfig } from '../../supabase/functions/_shared/config.ts';
import type { Rpc } from '../../supabase/functions/_shared/worker.ts';

const config:WorkerConfig={WORKER_SECRET:'secret',APIFY_TOKEN:'private-apify-token',ANTHROPIC_API_KEY:'private-claude-key',APIFY_WEBHOOK_SECRET:'callback-secret',SUPABASE_URL:'https://test.supabase.co'};
describe('service-only worker configuration handling',()=>{
  it('merges only whitelisted settings and honors nonempty environment overrides',async()=>{
    const rpc:Rpc=async()=>({data:{...config,ARBITRARY:'not-allowed',SUPABASE_SERVICE_ROLE_KEY:'never-loaded-from-vault'},error:null});
    const values=await loadWorkerConfig(rpc,{APIFY_TOKEN:'environment-token',ANTHROPIC_API_KEY:''});
    expect(values.APIFY_TOKEN).toBe('environment-token');
    expect(values.ANTHROPIC_API_KEY).toBe('private-claude-key');
    expect(values).not.toHaveProperty('ARBITRARY');
    expect(values).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('fails closed when the service-only Vault RPC is unavailable',async()=>{
    const rpc:Rpc=async()=>({data:null,error:{message:'Permission denied'}});
    await expect(loadWorkerConfig(rpc,{})).rejects.toThrow('configuration unavailable');
  });
  it('rejects missing authorization before loading secret configuration',async()=>{
    const load=vi.fn(async()=>config),process=vi.fn(async()=>{}),wait=vi.fn();
    expect((await handleRefreshRequest(new Request('https://example.com',{method:'POST'}),load,process,wait)).status).toBe(401);
    expect(load).not.toHaveBeenCalled();expect(process).not.toHaveBeenCalled();expect(wait).not.toHaveBeenCalled();
  });
  it('does not process or expose config for an incorrect shared secret',async()=>{
    const process=vi.fn(async()=>{}),wait=vi.fn();
    const response=await handleRefreshRequest(new Request('https://example.com',{method:'POST',headers:{'x-worker-secret':'wrong'}}),async()=>config,process,wait);
    expect(response.status).toBe(401);expect(await response.text()).not.toContain('private-');expect(process).not.toHaveBeenCalled();expect(wait).not.toHaveBeenCalled();
  });
  it('returns 202 while the authenticated background task is still running',async()=>{
    let finish:()=>void=()=>{};let task:Promise<unknown>|undefined;
    const process=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const response=await handleRefreshRequest(new Request('https://example.com',{method:'POST',headers:{'x-worker-secret':'secret'}}),async()=>config,process,value=>{task=value;});
    expect(response.status).toBe(202);expect(await response.json()).toEqual({accepted:true});expect(task).toBeDefined();expect(process).toHaveBeenCalledTimes(1);finish();await task;
  });
  it('fails closed for missing processing credentials after authentication',async()=>{
    const wait=vi.fn();
    const response=await handleRefreshRequest(new Request('https://example.com',{method:'POST',headers:{'x-worker-secret':'secret'}}),async()=>({WORKER_SECRET:'secret'}),vi.fn(),wait);
    expect(response.status).toBe(503);expect(wait).not.toHaveBeenCalled();
  });
});
