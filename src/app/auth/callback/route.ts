import {NextResponse} from 'next/server';
import {appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
export async function GET(request:Request){
 const code=new URL(request.url).searchParams.get('code');
 if(code){const client=await userClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/',appOrigin()));}
 return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
}
