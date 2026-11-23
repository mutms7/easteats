import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

// Each test guards one code path in the email account feature. The PKCE code callback and the
// shared origin helper are already covered by account.test.ts, so they aren't repeated here.
const auth=vi.hoisted(()=>({signUp:vi.fn(),signIn:vi.fn(),reset:vi.fn(),verifyOtp:vi.fn(),exchange:vi.fn(),updateUser:vi.fn(),signOut:vi.fn(),userClient:vi.fn(),current:null as null|{user:{id:string},demo:boolean,client:unknown},cookieValues:new Map<string,string>(),setCookie:vi.fn(),deleteCookie:vi.fn(),consoleError:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers(),cookies:async()=>({get:(name:string)=>auth.cookieValues.has(name)?{value:auth.cookieValues.get(name)}:undefined,set:auth.setCookie,delete:auth.deleteCookie})}));
vi.mock('@/server/supabase',()=>({userClient:auth.userClient}));
vi.mock('@/server/session',async()=>{const {HttpError}=await import('@/server/http');return {session:async()=>({user:null,demo:false,client:null}),requireSession:async()=>{if(!auth.current)throw new HttpError(401,'Sign in to continue.','SIGN_IN_REQUIRED');return auth.current;}};});
import {POST as signup} from '@/app/auth/signup/route';
import {POST as password} from '@/app/auth/password/route';
import {POST as reset} from '@/app/auth/reset/route';
import {GET as recoveryWindow,POST as updatePassword} from '@/app/auth/update-password/route';
import {GET as callback} from '@/app/auth/callback/route';
import {accountDetails} from '@/server/account';
import {authProviders} from '@/server/config';
import {GET as sessionRoute} from '@/app/api/session/route';

const PASSWORD='correct horse battery';
beforeEach(()=>{
  vi.clearAllMocks();auth.cookieValues.clear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','test-public-key');vi.stubEnv('APP_URL','https://east-eats.example');
  auth.userClient.mockResolvedValue({auth:{signUp:auth.signUp,signInWithPassword:auth.signIn,resetPasswordForEmail:auth.reset,verifyOtp:auth.verifyOtp,exchangeCodeForSession:auth.exchange}});
  auth.signUp.mockResolvedValue({data:{user:{id:'new-user'},session:null},error:null});
  auth.signIn.mockResolvedValue({data:{user:{id:'user'},session:{access_token:'token'}},error:null});
  auth.reset.mockResolvedValue({data:{},error:null});auth.verifyOtp.mockResolvedValue({error:null});
  auth.updateUser.mockResolvedValue({data:{user:{id:'user'}},error:null});auth.signOut.mockResolvedValue({error:null});
  auth.current={user:{id:'user'},demo:false,client:{auth:{updateUser:auth.updateUser,signOut:auth.signOut}}};
  auth.cookieValues.set('east-eats-recovery','user');
  auth.setCookie.mockImplementation((name:string,value:string)=>{auth.cookieValues.set(name,value);});auth.deleteCookie.mockImplementation((name:string)=>{auth.cookieValues.delete(name);});
  vi.spyOn(console,'error').mockImplementation(auth.consoleError);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
type Route='signup'|'signin'|'reset'|'update';
const routes={signup,signin:password,reset,update:updatePassword};
const bodies:Record<Route,Record<string,unknown>>={signup:{name:'  Fixture Diner ',email:' Fixture@Example.Invalid ',password:PASSWORD},signin:{email:'fixture@example.invalid',password:PASSWORD},reset:{email:' Fixture@Example.Invalid '},update:{password:PASSWORD}};
const mocks:Record<Route,()=>ReturnType<typeof vi.fn>>={signup:()=>auth.signUp,signin:()=>auth.signIn,reset:()=>auth.reset,update:()=>auth.updateUser};
const call=(route:Route,body:unknown=bodies[route],headers:Record<string,string>={})=>routes[route](new Request('https://east-eats.example/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://east-eats.example',...headers},body:JSON.stringify(body)}));
const noSupabaseCalls=()=>{for(const mock of Object.values(mocks))expect(mock()).not.toHaveBeenCalled();};

describe('POST /auth/signup',()=>{
  it('creates a normalized account, remembers the return path, and never echoes the password',async()=>{
    const response=await call('signup',{...bodies.signup,next:'/delete-account'});
    expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(auth.signUp).toHaveBeenCalledExactlyOnceWith({email:'fixture@example.invalid',password:PASSWORD,options:{data:{full_name:'Fixture Diner'},emailRedirectTo:'https://east-eats.example/auth/callback'}});
    const body=await response.json();expect(body.status).toBe('confirm-email');expect(JSON.stringify(body)).not.toContain(PASSWORD);
    expect(auth.setCookie).toHaveBeenCalledExactlyOnceWith('east-eats-return-to','/delete-account',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:3600});
  });
  it('signs in immediately when the project does not require confirmation',async()=>{
    auth.signUp.mockResolvedValue({data:{user:{id:'new-user'},session:{access_token:'token'}},error:null});
    expect(await (await call('signup',{...bodies.signup,next:'/delete-account'})).json()).toEqual({status:'signed-in',destination:'/delete-account'});
  });
  it('gives an already-registered email the same response as a new one',async()=>{
    const fresh=await (await call('signup')).json();
    auth.signUp.mockResolvedValue({data:{user:{id:'obfuscated',identities:[]},session:null},error:null});
    expect(await (await call('signup')).json()).toEqual(fresh);
  });
  it('reports setup when Supabase is not configured',async()=>{
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');expect((await call('signup')).status).toBe(503);expect(auth.userClient).not.toHaveBeenCalled();
  });
});

describe('POST /auth/password',()=>{
  it('signs in with the normalized email and drops an unsafe destination',async()=>{
    const response=await call('signin',{email:' Fixture@Example.Invalid',password:PASSWORD,next:'//evil.example'});
    expect(await response.json()).toEqual({status:'signed-in',destination:'/'});
    expect(auth.signIn).toHaveBeenCalledExactlyOnceWith({email:'fixture@example.invalid',password:PASSWORD});
  });
});

describe('password reset',()=>{
  it('sends a recovery link back to this site and answers without revealing whether the account exists',async()=>{
    const response=await call('reset');
    expect(auth.reset).toHaveBeenCalledExactlyOnceWith('fixture@example.invalid',{redirectTo:'https://east-eats.example/auth/callback'});
    const body=await response.json();expect(body.status).toBe('reset-sent');expect(body.message).toMatch(/^If an account uses fixture@example\.invalid/);
    // Supabase's per-email send limit only hits real accounts, so it must look identical to a sent link.
    auth.reset.mockResolvedValue({data:{},error:{code:'over_email_send_rate_limit',status:429}});
    const limited=await call('reset');expect(limited.status).toBe(200);expect(await limited.json()).toEqual(body);
  });
  it('turns this browser’s own recovery code into a short reset window, and only a recovery code',async()=>{
    auth.exchange.mockResolvedValue({data:{user:{id:'user'},session:{},redirectType:'recovery'},error:null});
    const response=await callback(new Request('https://east-eats.example/auth/callback?code=recovery-code'));
    expect(response.headers.get('location')).toBe('https://east-eats.example/reset-password');
    expect(auth.setCookie).toHaveBeenCalledWith('east-eats-recovery','user',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:900});
    auth.setCookie.mockClear();auth.exchange.mockResolvedValue({data:{user:{id:'user'},session:{},redirectType:null},error:null});
    expect((await callback(new Request('https://east-eats.example/auth/callback?code=signin-code'))).headers.get('location')).toBe('https://east-eats.example/');
    expect(auth.setCookie).not.toHaveBeenCalledWith('east-eats-recovery',expect.anything(),expect.anything());
    auth.exchange.mockResolvedValue({data:{user:null,session:null,redirectType:'recovery'},error:new Error('stale verifier')});
    expect((await callback(new Request('https://east-eats.example/auth/callback?code=stale-code'))).headers.get('location')).toBe('https://east-eats.example/?auth=failed');
    expect(auth.setCookie).not.toHaveBeenCalledWith('east-eats-recovery',expect.anything(),expect.anything());
  });
  it('tells the reset page whether this account’s window is still open',async()=>{
    expect(await (await recoveryWindow(new Request('https://east-eats.example/auth/update-password'))).json()).toEqual({active:true});
    auth.cookieValues.set('east-eats-recovery','someone-else');
    expect(await (await recoveryWindow(new Request('https://east-eats.example/auth/update-password'))).json()).toEqual({active:false});
  });
  it('sets the new password, closes the reset window, and signs out other sessions',async()=>{
    const response=await call('update');
    expect(await response.json()).toEqual({status:'password-updated'});
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({password:PASSWORD});
    expect(auth.cookieValues.has('east-eats-recovery')).toBe(false);expect(auth.signOut).toHaveBeenCalledWith({scope:'others'});
  });
  it.each([
    ['no reset window',()=>auth.cookieValues.delete('east-eats-recovery'),403],
    ['a window opened for another account',()=>auth.cookieValues.set('east-eats-recovery','someone-else'),403],
    ['a demo account',()=>{auth.current={user:{id:'user'},demo:true,client:null};},403],
    ['no session',()=>{auth.current=null;},401],
  ])('refuses a password change with %s',async(_label,arrange,status)=>{
    arrange();expect((await call('update')).status).toBe(status);expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('shared request guards',()=>{
  it.each([
    ['signup',{...bodies.signup,name:''}],
    ['signup',{...bodies.signup,email:'not-an-email'}],
    ['signup',{...bodies.signup,password:'seven77'}],
    ['signup',{...bodies.signup,password:'🍜'.repeat(20)}],
    ['signup',{...bodies.signup,role:'admin'}],
    ['signin',{...bodies.signin,password:''}],
    ['reset',{email:'not-an-email'}],
    ['update',{password:'seven77'}],
  ] as [Route,unknown][])('%s rejects invalid input before calling Supabase: %j',async(route,body)=>{
    expect((await call(route,body)).status).toBe(400);noSupabaseCalls();
  });
  it.each((['signup','signin','reset','update'] as Route[]).flatMap(route=>[[route,{Origin:'https://other.example'},403],[route,{'Content-Type':'text/plain'},415]] as [Route,Record<string,string>,number][]))('%s rejects cross-site or non-JSON requests: %j',async(route,headers,status)=>{
    expect((await call(route,undefined,headers)).status).toBe(status);noSupabaseCalls();
  });
  it.each([
    ['signup','weak_password',400,'stronger password'],
    ['signup','over_email_send_rate_limit',429,'Too many attempts'],
    ['signup','signup_disabled',403,'Continue with Google'],
    ['signup','user_already_exists',409,'Try signing in'],
    ['signin','invalid_credentials',401,'That email and password don’t match an account.'],
    ['signin','email_not_confirmed',403,'Confirm your email first'],
    ['update','same_password',400,'haven’t used'],
    ['update','reauthentication_needed',403,'Request a new one'],
    ['reset','user_not_found',503,'couldn’t reach account sign-in'],
  ] as [Route,string,number,string][])('%s maps Supabase %s to a stable message without provider details',async(route,code,status,text)=>{
    mocks[route]().mockResolvedValue({data:{user:null,session:null},error:{code,status:400,message:'private provider detail'}});
    const response=await call(route);
    expect(response.status).toBe(status);const body=await response.text();expect(body).toContain(text);expect(body).not.toContain('private provider detail');
  });
  it('hides unexpected failures and never logs the password',async()=>{
    auth.signUp.mockRejectedValue(new Error(`network failure ${PASSWORD}`));
    const response=await call('signup');expect(response.status).toBe(503);expect(await response.text()).not.toContain(PASSWORD);
    expect(JSON.stringify(auth.consoleError.mock.calls)).not.toContain(PASSWORD);
  });
});

describe('email confirmation callback',()=>{
  it('refuses token-hash links, which could sign this browser into someone else’s account',async()=>{
    const response=await callback(new Request('https://east-eats.example/auth/callback?token_hash=attacker-token&type=signup'));
    expect(auth.verifyOtp).not.toHaveBeenCalled();expect(response.headers.get('location')).toBe('https://east-eats.example/?auth=failed');
  });
});

describe('provider detection and labels',()=>{
  it('offers email only when the provider is on and sign-ups are open, and fails closed',async()=>{
    const settings=(value:unknown)=>vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(value),{status:200}));
    settings({external:{google:true,email:true},disable_signup:false});expect(await authProviders()).toEqual({google:true,email:true});
    settings({external:{google:true,email:true},disable_signup:true});expect(await authProviders()).toEqual({google:true,email:false});
    settings({external:{google:true,email:false}});expect(await authProviders()).toEqual({google:true,email:false});
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline'));expect(await authProviders()).toEqual({google:false,email:false});
  });
  it('marks signed-out sessions configured when only email is available',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({external:{google:false,email:true}}),{status:200}));
    const body=await (await sessionRoute(new Request('https://east-eats.example/api/session'))).json();
    expect(body.configured).toBe(true);expect(body.providers).toEqual({google:false,email:true});
  });
  it('labels sign-in providers, preferring a linked Google identity',()=>{
    expect(accountDetails({id:'a',app_metadata:{provider:'email'}}).provider).toBe('email');
    expect(accountDetails({id:'a',app_metadata:{provider:'email',providers:['email','google']}}).provider).toBe('google');
    expect(accountDetails({id:'a',app_metadata:{provider:'<script>'}}).provider).toBeUndefined();
  });
});
