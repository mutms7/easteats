import {NextResponse} from 'next/server';
import {configured,appOrigin} from '@/server/config';
import {userClient} from '@/server/supabase';
export async function GET(){
 if(!configured())return NextResponse.redirect(new URL('/?auth=setup',appOrigin()));
 const client=await userClient();
 const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${appOrigin()}/auth/callback`,skipBrowserRedirect:true}});
 if(error||!data.url)return NextResponse.redirect(new URL('/?auth=failed',appOrigin()));
 return NextResponse.redirect(data.url);
}
