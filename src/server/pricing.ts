import type {ModelUsage} from './taste';
// Verified API prices per million tokens. Refuse unknown overrides before spending.
const prices:Record<string,{input:number;output:number}>={
 'claude-sonnet-5-5':{input:2,output:10},
 'claude-haiku-5-5':{input:.1,output:.5},
 'claude-sonnet-4-6':{input:3,output:15},
 'claude-haiku-4-5-20251001':{input:1,output:5}
};
export function assertPricedModel(model:string){if(!prices[model])throw new Error('Model override needs verified pricing before use.');}
export function modelCost(usage:ModelUsage){
 assertPricedModel(usage.model);let rate=prices[usage.model];
 if(usage.model==='claude-haiku-5-5'&&usage.inputTokens>100000)rate={input:.5,output:2.5};
 return (usage.inputTokens*rate.input+usage.outputTokens*rate.output)/1_000_000;
}
