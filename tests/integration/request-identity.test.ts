import {afterEach,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {queueRefresh} from '@/server/repository';
afterEach(()=>vi.unstubAllEnvs());
it('keeps the same paid-work key across polls and changing enrichment URLs, but changes it for a new submission',async()=>{
 vi.stubEnv('WORKER_SECRET','');const rpc=vi.fn().mockResolvedValue({data:{id:'job',status:'running'},error:null});const client={rpc} as unknown as SupabaseClient;
 const first='50af1120-c246-4f90-a1e3-cf838796255b',second='a80f5fe4-36cc-4e75-bb3a-a429f5bd8ed5';
 await queueRefresh(client,'details',{urls:['https://maps.google.com/?cid=1','https://maps.google.com/?cid=2']},first);
 await queueRefresh(client,'details',{urls:['https://maps.google.com/?cid=2']},first);
 await queueRefresh(client,'details',{urls:['https://maps.google.com/?cid=2']},second);
 expect(rpc.mock.calls[0][1].p_key).toBe(rpc.mock.calls[1][1].p_key);expect(rpc.mock.calls[2][1].p_key).not.toBe(rpc.mock.calls[1][1].p_key);
 expect(rpc.mock.calls[0][1].p_input.searchId).toBe(first);
});
it('explains the real daily limit instead of making it look like no places exist',async()=>{
 const client={rpc:vi.fn().mockResolvedValue({data:null,error:{message:'Daily refresh limit reached'}})} as unknown as SupabaseClient;
 await expect(queueRefresh(client,'discovery',{lat:43.52,lng:-80.52},'50af1120-c246-4f90-a1e3-cf838796255b')).rejects.toMatchObject({status:429,code:'SEARCH_LIMIT'});
});
