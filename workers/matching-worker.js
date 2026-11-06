import {parseISO2709,getRecordAsMarcText} from '../js/marc-parser.js';
import {normalizeRecord,defaultMapping} from '../js/normalization.js';
import {buildIndex,matchRecord,analyzeItems,anomalies,defaults,effectiveStatus,applyDecisions} from '../js/matching.js';
let corpora={},matches=[],idx,config=defaults,mapping=defaultMapping,timings={};
const send=(type,data={})=>postMessage({type,...data});
const compact=({raw,fields,...r})=>r;
function progress(stage,percent){send('progress',{stage,percent});}
const breathe=()=>new Promise(resolve=>setTimeout(resolve,0));
async function batches(kind,records,extra={}){for(let i=0;i<records.length;i+=500){send(kind,{...extra,records:records.slice(i,i+500)});await breathe();}}
async function report(){
  const items=analyzeItems(matches,corpora.pmb.records,corpora.koha.records,idx),issues=anomalies(corpora.pmb.records,corpora.koha.records,idx,matches,Object.entries(corpora).flatMap(([side,c])=>c.errors.map(e=>({...e,side,id:'octet '+e.position}))));
  send('resultStart');await batches('resultBatch',matches,{key:'matches'});await batches('resultBatch',items,{key:'items'});await batches('resultBatch',issues,{key:'anomalies'});send('results',{timings});
}
onmessage=async({data:d})=>{try{
  if(d.type==='load'){
    mapping=d.mapping;const start=performance.now(),buffer=await d.file.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const parsed=parseISO2709(buffer,d.encoding,p=>progress('Lecture '+d.side.toUpperCase(),p));
    const records=parsed.records.map((r,i)=>normalizeRecord(r,i,mapping));
    corpora[d.side]={...parsed,records,hash};timings['Parsing '+d.side.toUpperCase()]=performance.now()-start;
    for(let i=0;i<records.length;i+=500){send('recordBatch',{side:d.side,records:records.slice(i,i+500).map(compact)});await breathe();}
    send('loaded',{side:d.side,hash,errors:parsed.errors,timing:timings['Parsing '+d.side.toUpperCase()]});
  }
  if(d.type==='compare'){
    config=d.config;let start=performance.now();idx=buildIndex(corpora.koha.records,p=>progress('Indexation Koha',p));timings.Indexation=performance.now()-start;
    start=performance.now();matches=corpora.pmb.records.map((r,i)=>{if(i%100===0)progress('Matching PMB → Koha',100*i/corpora.pmb.records.length);return matchRecord(r,corpora.koha.records,idx,config);});
    timings.Matching=performance.now()-start;progress('Matching PMB → Koha',100);await report();
  }
  if(d.type==='decisions'){
    applyDecisions(matches,corpora.pmb.records,corpora.koha.records,d.decisions);
    await report();
  }
  if(d.type==='detail')send('detail',{source:corpora.pmb.records[d.source],targets:matches[d.source].candidates.map(c=>corpora.koha.records[c.target]),marc:getRecordAsMarcText(corpora.pmb.records[d.source])});
  if(d.type==='marc'){
    const chunks=matches.filter(m=>effectiveStatus(m)==='unique').map(m=>corpora.pmb.records[m.source].raw);
    send('download',{blob:new Blob(chunks,{type:'application/marc'}),name:'match-marc-notices-a-importer.mrc'});
  }
}catch(e){send('error',{message:e.message});}};
