import {NextResponse} from 'next/server';
import {appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
import {cookies} from 'next/headers';
export async function GET(request:Request){
 const store=await cookies();const saved=store.get('east-eats-return-to')?.value;store.delete('east-eats-return-to');
 const destination=saved==='/delete-account'?'/delete-account':'/';
 const code=new URL(request.url).searchParams.get('code');
 if(code){const client=await userClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(destination,appOrigin()));}
 return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
}
