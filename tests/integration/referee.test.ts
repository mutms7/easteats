import {describe,it,expect} from 'vitest';
import {judge,context} from '../../scripts/referee.mjs';
describe('independent referee',()=>{
 it('allows a proven success',()=>expect(judge(0,true)).toEqual({status:'PASS',attempts:0,exitCode:0}));
 it('blocks exactly five failed repair continuations',()=>{let attempts=0;for(let i=0;i<5;i++){const result=judge(attempts,false);expect(result.exitCode).toBe(2);attempts=result.attempts;}expect(judge(attempts,false)).toEqual({status:'EXHAUSTED',attempts:5,exitCode:0});});
 it('accepts a verified fix after the fifth repair',()=>expect(judge(5,true).status).toBe('PASS'));
 it('separates agents and sessions',()=>{const base={cwd:process.cwd(),session_id:'one',hook_event_name:'SubagentStop',agent_type:'taste',agent_id:'a'};expect(context(base)!.key).not.toBe(context({...base,agent_id:'b'})!.key);expect(context(base)!.key).not.toBe(context({...base,session_id:'two'})!.key);});
 it('ignores unrelated internal agents',()=>expect(context({cwd:process.cwd(),session_id:'a',hook_event_name:'SubagentStop',agent_type:'Explore'})).toBe(null));
 it('rejects missing identity rather than claiming proof',()=>expect(()=>context({})).toThrow());
});
