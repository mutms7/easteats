import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function judge(attempts,passed){return passed?{status:'PASS',attempts,exitCode:0}:attempts>=5?{status:'EXHAUSTED',attempts:5,exitCode:0}:{status:'FAILED',attempts:attempts+1,exitCode:2};}
export function context(input){
 const cwd=input.cwd||process.env.CLAUDE_PROJECT_DIR;
 if(!cwd||!input.session_id)throw new Error('Missing hook session or directory');
 const root=execFileSync('git',['-C',cwd,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
 const role=input.hook_event_name==='SubagentStop'?input.agent_type:'integration';
 if(!['data','taste','ui','integration'].includes(role))return null;
 const key=createHash('sha256').update([root,input.session_id,input.agent_id||'lead'].join('|')).digest('hex').slice(0,24);
 return {root,role,key};
}
export function runHook(input){
 const value=context(input);if(!value)return 0;
 const {root,role,key}=value;const state=join(root,'.referee',key);mkdirSync(state,{recursive:true});
 let attempts=0;try{attempts=Number(readFileSync(join(state,'attempts'),'utf8'));}catch{}
 if(!Number.isInteger(attempts)||attempts<0||attempts>5)attempts=5;
 const checked=spawnSync(process.execPath,[join(root,'scripts','verify.mjs'),role],{cwd:root,encoding:'utf8',timeout:260000,maxBuffer:8*1024*1024});
 const log=`${checked.stdout||''}\n${checked.stderr||''}\n${checked.error?.message||''}`;
 writeFileSync(join(state,'check.log'),log);
 const result=judge(attempts,!checked.error&&checked.status===0);
 writeFileSync(join(state,'attempts'),String(result.attempts));writeFileSync(join(state,'status'),result.status);
 if(result.status==='FAILED')process.stderr.write(`${log.split('\n').slice(-20).join('\n')}\nReferee ${role}: repair continuation ${result.attempts}/5. Fix failures without weakening proof.\n`);
 else process.stdout.write(JSON.stringify({systemMessage:result.status==='PASS'?`REFEREE PASS: ${role} checks passed.`:`REFEREE EXHAUSTED: ${role} still fails. Report unresolved failures. This is not a pass.`})+'\n');
 return result.exitCode;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=runHook(JSON.parse(readFileSync(0,'utf8')||'{}'));}
 catch{console.log(JSON.stringify({systemMessage:'REFEREE UNVERIFIED: judge setup failed. Report this blocker; do not claim a pass.'}));process.exitCode=0;}
}
