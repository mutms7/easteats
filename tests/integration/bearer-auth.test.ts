import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const browser=vi.hoisted(()=>({
  headers:new Headers(), demoCookie:false,
  cookies:vi.fn(), createServerClient:vi.fn(),
  getUser:vi.fn(async()=>({data:{user:{id:'browser-user',email:'browser@example.invalid'}},error:null}))
}));
vi.mock('next/headers',()=>({headers:async()=>browser.headers,cookies:browser.cookies}));
vi.mock('@supabase/ssr',()=>({createServerClient:browser.createServerClient}));

import {session,requireSession} from '@/server/session';
import {endpoint,json} from '@/server/http';

const users={
  'native.token.one':{id:'native-one',email:'one@example.invalid'},
  'native.token.two':{id:'native-two',email:'two@example.invalid'}
};
let provider:ReturnType<typeof vi.fn>;
const mutation=endpoint(async()=>{
  const auth=await requireSession();
  const {data,error}=await auth.client!.from('saved_places').select('user_id,place_id');
  if(error)throw error;
  return json({userId:auth.user.id,items:data,demo:auth.demo});
},true);
const call=(authorization?:string,extra:Record<string,string>={})=>{
  const headers=new Headers(extra);
  if(authorization!==undefined)headers.set('Authorization',authorization);
  browser.headers=headers;
  return mutation(new Request('https://east-eats.example/api/saved',{method:'POST',headers}));
};

beforeEach(()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY','server-secret-must-never-be-used');
  vi.stubEnv('APP_URL','https://east-eats.example');
  vi.stubEnv('EAST_EATS_DEMO','false');
  browser.headers=new Headers();browser.demoCookie=false;
  browser.cookies.mockReset().mockImplementation(async()=>({
    get:(name:string)=>name==='east-eats-demo'&&browser.demoCookie?{value:'fixture'}:undefined,
    getAll:()=>[{name:'browser-session',value:'existing-cookie'}],set:vi.fn()
  }));
  browser.getUser.mockReset().mockResolvedValue({data:{user:{id:'browser-user',email:'browser@example.invalid'}},error:null});
  browser.createServerClient.mockReset().mockImplementation(()=>({auth:{getUser:browser.getUser}}));
  provider=vi.fn(async(raw:string|URL|Request,init?:RequestInit)=>{
    const url=new URL(String(raw)),headers=new Headers(init?.headers);
    const token=headers.get('Authorization')?.replace(/^Bearer /,'');
    const user=users[token as keyof typeof users];
    if(url.pathname==='/auth/v1/user')return user?Response.json(user):Response.json({message:'invalid JWT',code:'bad_jwt'},{status:401});
    if(url.pathname==='/rest/v1/saved_places')return user?Response.json([{user_id:user.id,place_id:`place-for-${user.id}`} ]):Response.json({message:'unauthorized'},{status:401});
    throw new Error('Unexpected network request');
  });
  vi.stubGlobal('fetch',provider);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('verified native API authentication',()=>{
  it('accepts a mobile token without browser headers and scopes database requests to it',async()=>{
    const response=await call('Bearer native.token.one');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({userId:'native-one',demo:false,items:[{user_id:'native-one',place_id:'place-for-native-one'}]});
    expect(provider.mock.calls.map(([raw])=>new URL(String(raw)).pathname)).toEqual(['/auth/v1/user','/rest/v1/saved_places']);
    for(const [,init]of provider.mock.calls){
      const headers=new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer native.token.one');
      expect(headers.get('apikey')).toBe('sb_publishable_test');
      expect(JSON.stringify(init)).not.toContain('server-secret-must-never-be-used');
    }
    expect(browser.cookies).not.toHaveBeenCalled();expect(browser.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('keeps different native callers on separate database clients',async()=>{
    browser.headers=new Headers({Authorization:'Bearer native.token.one'});
    const first=await requireSession();
    browser.headers=new Headers({Authorization:'Bearer native.token.two'});
    const second=await requireSession();
    const results=await Promise.all([first.client!.from('saved_places').select('*'),second.client!.from('saved_places').select('*')]);
    expect(results.map(result=>result.data?.[0].user_id)).toEqual(['native-one','native-two']);
    expect(first.client).not.toBe(second.client);
  });
  it('accepts a case-insensitive Bearer scheme',async()=>{
    expect((await call('bearer native.token.one')).status).toBe(200);
  });
  it.each(['','Bearer','Basic browser-cookie','Bearer token with spaces','Bearer one, Bearer two','Bearer '+ 'x'.repeat(16385)])('rejects malformed explicit credentials without cookie fallback: %s',async authorization=>{
    browser.demoCookie=true;
    const response=await call(authorization);
    expect(response.status).toBe(401);expect((await response.json()).code).toBe('SIGN_IN_REQUIRED');
    expect(provider).not.toHaveBeenCalled();expect(browser.cookies).not.toHaveBeenCalled();expect(browser.createServerClient).not.toHaveBeenCalled();
  });
  it('verifies an expired token with Auth and never substitutes a signed-in browser or demo account',async()=>{
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('EAST_EATS_DEMO','true');browser.demoCookie=true;
    const response=await call('Bearer expired.token.value');
    expect(response.status).toBe(401);expect(await response.json()).toMatchObject({code:'SIGN_IN_REQUIRED'});
    expect(provider).toHaveBeenCalledTimes(1);expect(browser.cookies).not.toHaveBeenCalled();expect(browser.createServerClient).not.toHaveBeenCalled();
  });
  it.each<Record<string,string>>([{Origin:'https://other.example'},{'Sec-Fetch-Site':'cross-site'}])('retains browser origin protections even with valid mobile credentials: %j',async headers=>{
    expect((await call('Bearer native.token.one',headers)).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('accepts the configured website origin with a verified token',async()=>{
    expect((await call('Bearer native.token.one',{Origin:'https://east-eats.example','Sec-Fetch-Site':'same-origin'})).status).toBe(200);
  });
});

describe('existing browser and explicit demo login',()=>{
  it('continues verifying the cookie session when no Authorization header was sent',async()=>{
    const auth=await requireSession();
    expect(auth.user.id).toBe('browser-user');expect(auth.demo).toBe(false);
    expect(browser.getUser).toHaveBeenCalledWith();expect(provider).not.toHaveBeenCalled();
    const [url,key,options]=browser.createServerClient.mock.calls[0];
    expect(url).toBe('https://project.supabase.co');expect(key).toBe('sb_publishable_test');
    expect(options.cookies.getAll()).toEqual([{name:'browser-session',value:'existing-cookie'}]);
  });
  it('allows demo only with the explicit fixture cookie in development',async()=>{
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('EAST_EATS_DEMO','true');
    expect((await session()).demo).toBe(false);
    browser.demoCookie=true;
    const auth=await session();expect(auth.demo).toBe(true);expect(auth.client).toBeNull();
  });
  it('does not enable fixture login in production',async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('EAST_EATS_DEMO','true');browser.demoCookie=true;
    const auth=await session();expect(auth.demo).toBe(false);expect(auth.user?.id).toBe('browser-user');
  });
});
