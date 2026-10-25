import {createClient} from '@supabase/supabase-js';
import {processJobs} from '../src/server/data/worker.ts';
process.loadEnvFile('.env.local');
if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY||!process.env.APIFY_TOKEN)throw new Error('Configure the Supabase server secret and Apify token in .env.local first.');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
do{
 try{console.log(JSON.stringify({at:new Date().toISOString(),...await processJobs(admin,{APIFY_TOKEN:process.env.APIFY_TOKEN,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY,ANTHROPIC_EXTRACT_MODEL:process.env.ANTHROPIC_EXTRACT_MODEL,NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,APIFY_WEBHOOK_SECRET:process.env.APIFY_WEBHOOK_SECRET})}));}catch{console.error('Worker could not process the queue. Check setup and database logs.');if(!process.argv.includes('--loop'))process.exitCode=1;}
 if(!process.argv.includes('--loop')||stopping)break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}while(!stopping);
