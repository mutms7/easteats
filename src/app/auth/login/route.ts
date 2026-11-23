import {NextResponse} from 'next/server';
import {configured,appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
import {cookies} from 'next/headers';
import {safeDestination} from '@/server/email-auth';
export async function GET(request:Request){
 if(!configured())return NextResponse.redirect(new URL('/?auth=setup',appOrigin()));
 const destination=safeDestination(new URL(request.url).searchParams.get('next'));
 (await cookies()).set('east-eats-return-to',destination,{httpOnly:true,secure:appOrigin().startsWith('https:'),sameSite:'lax',path:'/',maxAge:600});
 const client=await userClient();
 const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${appOrigin()}/auth/callback`,skipBrowserRedirect:true}});
 if(error||!data.url)return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
 return NextResponse.redirect(data.url);
}
