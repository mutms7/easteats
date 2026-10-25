import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const paths=execFileSync('git',['ls-files','--cached'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const vars=existsSync('.env.local')?parseEnv(readFileSync('.env.local','utf8')):{};
const secrets=['APIFY_TOKEN','ANTHROPIC_API_KEY','SUPABASE_SECRET_KEY','APIFY_WEBHOOK_SECRET','WORKER_SECRET','SUPABASE_ACCESS_TOKEN'].map(k=>vars[k]).filter(v=>v&&v.length>12);
const failures=[];
for(const path of paths){
 if(/^\.env/.test(path)&&path!=='.env.example')failures.push(path);
 if(!existsSync(path))continue;
 const text=readFileSync(path,'utf8');if(secrets.some(secret=>text.includes(secret)))failures.push(path);
}
if(failures.length){console.error('Secret exposure detected in:',[...new Set(failures)].join(', '));process.exitCode=1;}
else console.log(`Checked ${paths.length} tracked files. No configured private key values or environment files found.`);
