import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const role=process.argv[2];
if(!['data','taste','ui','integration'].includes(role))throw new Error('Unknown verification scope');
const scopes=role==='integration'?['data','taste','ui','integration']: [role];
for(const scope of scopes){
 const dir=join('tests',scope);
 if(!existsSync(dir)||!readdirSync(dir,{recursive:true}).some(p=>String(p).endsWith('.test.ts')))throw new Error(`Missing required ${scope} tests`);
}
function run(script,args=[]){
 const result=spawnSync(process.execPath,[script,...args],{stdio:'inherit',timeout:180000,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
run('node_modules/vitest/vitest.mjs',['run',...scopes.map(s=>`tests/${s}`)]);
if(role==='integration'){
 run('node_modules/typescript/bin/tsc',['--noEmit']);
 run('node_modules/next/dist/bin/next',['build']);
 run('node_modules/@playwright/test/cli.js',['test']);
}
