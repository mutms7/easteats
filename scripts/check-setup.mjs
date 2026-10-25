import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
if(!existsSync('.env.local'))writeFileSync('.env.local',readFileSync('.env.example'));
let text=readFileSync('.env.local','utf8');let vars=parseEnv(text);
if(process.argv.includes('--generate-secrets')){
 for(const key of ['APIFY_WEBHOOK_SECRET','WORKER_SECRET'])if(!vars[key]){
  const value=randomBytes(32).toString('hex');const regex=new RegExp(`^${key}=.*$`,'m');text=regex.test(text)?text.replace(regex,`${key}=${value}`):`${text}\n${key}=${value}\n`;
 }
 writeFileSync('.env.local',text);vars=parseEnv(text);
}
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','APIFY_TOKEN','ANTHROPIC_API_KEY','NEXT_PUBLIC_MAPTILER_KEY','APIFY_WEBHOOK_SECRET','WORKER_SECRET'])console.log(`${key}: ${vars[key]?.trim()?'configured':'missing'}`);
console.log('Google OAuth must also be enabled in Supabase. No secret values were printed.');
