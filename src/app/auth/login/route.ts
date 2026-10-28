import {NextResponse} from 'next/server';
import {configured,appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
import {cookies} from 'next/headers';
export async function GET(request:Request){
 if(!configured())return NextResponse.redirect(new URL('/?auth=setup',appOrigin()));
 const destination=new URL(request.url).searchParams.get('next')==='/delete-account'?'/delete-account':'/';
 (await cookies()).set('east-eats-return-to',destination,{httpOnly:true,secure:appOrigin().startsWith('https:'),sameSite:'lax',path:'/',maxAge:600});
 const client=await userClient();
 const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${appOrigin()}/auth/callback`,skipBrowserRedirect:true}});
 if(error||!data.url)return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
 return NextResponse.redirect(data.url);
}
