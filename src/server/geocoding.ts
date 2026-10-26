export type AreaResult={label:string;lat:number;lng:number};
const words=(value:string):string[]=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
export function rankAreas(query:string,items:AreaResult[]):AreaResult[]{
 const terms=[...new Set(words(query))].filter(term=>term.length>2);
 const score=(item:AreaResult)=>{const label=words(item.label);return terms.filter(term=>label.includes(term)).length;};
 return [...items].sort((a,b)=>score(b)-score(a));
}
