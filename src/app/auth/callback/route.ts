import {NextResponse} from 'next/server';
import {appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
import {cookies} from 'next/headers';
import {safeDestination,startRecovery} from '@/server/email-auth';
export async function GET(request:Request){
 const store=await cookies();const saved=store.get('east-eats-return-to')?.value;store.delete('east-eats-return-to');
 const destination=safeDestination(saved);
 // Only PKCE codes are accepted: a code only works in the browser holding its verifier cookie,
 // so a link someone else sends can't sign this browser into their account.
 const code=new URL(request.url).searchParams.get('code');
 if(code){const client=await userClient();const {data,error}=await client.auth.exchangeCodeForSession(code);
  // Supabase marks the verifier saved by resetPasswordForEmail, so only this browser's own reset link counts as a recovery.
  // auth-js returns redirectType at runtime (GoTrueClient _exchangeCodeForSession) but its types omit it.
  if(!error&&(data as {redirectType?:string|null}|null)?.redirectType==='recovery'&&data.user){await startRecovery(data.user.id);return NextResponse.redirect(new URL('/reset-password',appOrigin()));}
  if(!error)return NextResponse.redirect(new URL(destination,appOrigin()));}
 return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
}
