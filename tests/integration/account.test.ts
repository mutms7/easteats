import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const auth=vi.hoisted(()=>({signedIn:true,demo:false,userId:'current-user',headers:new Headers(),requireSession:vi.fn(),signOut:vi.fn(),revoke:vi.fn(),deleteUser:vi.fn(),adminClient:vi.fn(),userClient:vi.fn(),oauth:vi.fn(),exchange:vi.fn(),cookieValues:new Map<string,string>(),setCookie:vi.fn(),deleteCookie:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>auth.headers,cookies:async()=>({get:(name:string)=>auth.cookieValues.has(name)?{value:auth.cookieValues.get(name)}:undefined,set:auth.setCookie,delete:auth.deleteCookie})}));
vi.mock('@/server/session',()=>({requireSession:auth.requireSession}));
vi.mock('@/server/supabase',()=>({adminClient:auth.adminClient,userClient:auth.userClient}));
import {DELETE} from '@/app/api/account/route';
import {GET as login} from '@/app/auth/login/route';
import {GET as callback} from '@/app/auth/callback/route';
import {HttpError} from '@/server/http';

beforeEach(()=>{
  vi.clearAllMocks();auth.signedIn=true;auth.demo=false;auth.userId='current-user';auth.headers=new Headers();auth.cookieValues.clear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','test-public-key');vi.stubEnv('APP_URL','https://east-eats.example');
  auth.requireSession.mockImplementation(async()=>{
    if(!auth.signedIn)throw new HttpError(401,'Sign in to continue.','SIGN_IN_REQUIRED');
    return{user:{id:auth.userId},demo:auth.demo,client:auth.demo?null:{auth:{signOut:auth.signOut}}};
  });
  auth.signOut.mockResolvedValue({error:null});auth.revoke.mockResolvedValue({error:null});auth.deleteUser.mockResolvedValue({error:null});
  auth.adminClient.mockReturnValue({auth:{admin:{signOut:auth.revoke,deleteUser:auth.deleteUser}}});
  auth.oauth.mockResolvedValue({data:{url:'https://accounts.google.com/oauth'},error:null});auth.exchange.mockResolvedValue({error:null});
  auth.userClient.mockResolvedValue({auth:{signInWithOAuth:auth.oauth,exchangeCodeForSession:auth.exchange}});
  auth.setCookie.mockImplementation((name:string,value:string)=>{auth.cookieValues.set(name,value);});auth.deleteCookie.mockImplementation((name:string)=>{auth.cookieValues.delete(name);});
});
afterEach(()=>vi.unstubAllEnvs());
const remove=(body:unknown={confirmation:'DELETE'},headers:Record<string,string>={})=>{
  auth.headers=new Headers(headers);
  return DELETE(new Request('https://east-eats.example/api/account',{method:'DELETE',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
};

describe('DELETE /api/account',()=>{
  it('requires authentication before creating a privileged client',async()=>{
    auth.signedIn=false;expect((await remove()).status).toBe(401);
    expect(auth.adminClient).not.toHaveBeenCalled();expect(auth.deleteUser).not.toHaveBeenCalled();
  });
  it.each([{}, {confirmation:'delete'}, {confirmation:'DELETE '}, {userId:'another-user'}])('requires explicit exact confirmation: %j',async body=>{
    expect((await remove(body)).status).toBe(400);expect(auth.adminClient).not.toHaveBeenCalled();expect(auth.deleteUser).not.toHaveBeenCalled();
  });
  it('rejects a demo account without revoking or deleting anything',async()=>{
    auth.demo=true;const response=await remove();expect(response.status).toBe(403);expect((await response.json()).code).toBe('DEMO_ACCOUNT');
    expect(auth.adminClient).not.toHaveBeenCalled();expect(auth.signOut).not.toHaveBeenCalled();expect(auth.deleteUser).not.toHaveBeenCalled();
  });
  it('globally revokes browser sessions before deleting only the verified current user',async()=>{
    const response=await remove({confirmation:'DELETE',userId:'victim-user',id:'victim-user'});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({deleted:true});
    expect(auth.signOut).toHaveBeenCalledWith({scope:'global'});expect(auth.revoke).not.toHaveBeenCalled();
    expect(auth.deleteUser).toHaveBeenCalledExactlyOnceWith('current-user');
    expect(auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(auth.deleteUser.mock.invocationCallOrder[0]);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('globally revokes a verified native bearer session before deletion',async()=>{
    const response=await remove({confirmation:'DELETE'},{Authorization:'bearer native.access.token'});
    expect(response.status).toBe(200);expect(auth.revoke).toHaveBeenCalledWith('native.access.token','global');
    expect(auth.signOut).not.toHaveBeenCalled();expect(auth.deleteUser).toHaveBeenCalledExactlyOnceWith('current-user');
    expect(auth.revoke.mock.invocationCallOrder[0]).toBeLessThan(auth.deleteUser.mock.invocationCallOrder[0]);
  });
  it.each(['browser','native'])('aborts deletion if %s session revocation fails',async mode=>{
    (mode==='browser'?auth.signOut:auth.revoke).mockResolvedValue({error:new Error('private provider detail')});
    const response=await remove({confirmation:'DELETE'},mode==='native'?{Authorization:'Bearer native.access.token'}:{});
    expect(response.status).toBe(503);const body=await response.json();expect(body.error).toContain('has not been deleted');expect(JSON.stringify(body)).not.toContain('private provider detail');
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
  it('reports deletion failure honestly after successful session revocation',async()=>{
    auth.deleteUser.mockResolvedValue({error:new Error('private database detail')});
    const response=await remove();expect(response.status).toBe(503);const body=await response.json();
    expect(body.error).toContain('could not be deleted');expect(body.deleted).toBeUndefined();expect(JSON.stringify(body)).not.toContain('private database detail');
    expect(auth.signOut).toHaveBeenCalledWith({scope:'global'});expect(auth.deleteUser).toHaveBeenCalledExactlyOnceWith('current-user');
  });
  it('rejects a foreign browser origin even when an access token is supplied',async()=>{
    expect((await remove({confirmation:'DELETE'},{Origin:'https://other.example',Authorization:'Bearer native.access.token'})).status).toBe(403);
    expect(auth.requireSession).not.toHaveBeenCalled();expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});

describe('safe account-deletion login return',()=>{
  it('stores a short-lived, protected return cookie and uses the configured OAuth callback',async()=>{
    const response=await login(new Request('https://east-eats.example/auth/login?next=%2Fdelete-account'));
    expect(response.headers.get('location')).toBe('https://accounts.google.com/oauth');
    expect(auth.setCookie).toHaveBeenCalledWith('east-eats-return-to','/delete-account',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
    expect(auth.oauth).toHaveBeenCalledWith({provider:'google',options:{redirectTo:'https://east-eats.example/auth/callback',skipBrowserRedirect:true}});
    const returned=await callback(new Request('https://east-eats.example/auth/callback?code=one-use-code'));
    expect(auth.exchange).toHaveBeenCalledWith('one-use-code');expect(returned.headers.get('location')).toBe('https://east-eats.example/delete-account');
    expect(auth.deleteCookie).toHaveBeenCalledWith('east-eats-return-to');expect(auth.cookieValues.has('east-eats-return-to')).toBe(false);
  });
  it.each(['https://evil.example','//evil.example','/delete-account?next=https://evil.example','/settings'])('ignores unapproved login return destinations: %s',async destination=>{
    await login(new Request(`https://east-eats.example/auth/login?next=${encodeURIComponent(destination)}`));
    expect(auth.cookieValues.get('east-eats-return-to')).toBe('/');
  });
  it('rejects an untrusted destination even if the return cookie is modified',async()=>{
    auth.cookieValues.set('east-eats-return-to','https://evil.example');
    const response=await callback(new Request('https://east-eats.example/auth/callback?code=code'));
    expect(response.headers.get('location')).toBe('https://east-eats.example/');expect(auth.cookieValues.has('east-eats-return-to')).toBe(false);
  });
  it.each([true,false])('clears the return cookie on a failed or missing OAuth code: hasCode=%s',async hasCode=>{
    auth.cookieValues.set('east-eats-return-to','/delete-account');auth.exchange.mockResolvedValue({error:new Error('expired code')});
    const response=await callback(new Request(`https://east-eats.example/auth/callback${hasCode?'?code=expired':''}`));
    expect(response.headers.get('location')).toBe('https://east-eats.example/?auth=failed');expect(auth.cookieValues.has('east-eats-return-to')).toBe(false);
    if(!hasCode)expect(auth.exchange).not.toHaveBeenCalled();
  });
});
