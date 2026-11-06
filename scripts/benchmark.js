import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {makeMARC,isbn,concatenate} from './fixtures.js';
import {parseISO2709} from '../js/marc-parser.js';
import {normalizeRecord} from '../js/normalization.js';
import {buildIndex,matchRecord} from '../js/matching.js';
const results=[];
for(const n of [1000,10000,100000]){
  let t=performance.now();const bytes=concatenate(Array.from({length:n},(_,i)=>makeMARC({id:String(i),title:'Ressource synthétique '+i,isbn:isbn(i+1)})));const generation=performance.now()-t;
  t=performance.now();const a=parseISO2709(bytes),b=parseISO2709(bytes);const parsing=performance.now()-t;
  t=performance.now();const source=a.records.map((r,i)=>normalizeRecord(r,i)),target=b.records.map((r,i)=>normalizeRecord(r,i));const normalization=performance.now()-t;
  t=performance.now();const index=buildIndex(target);const indexing=performance.now()-t;
  t=performance.now();let duplicates=0;for(const r of source)if(matchRecord(r,target,index).status==='duplicate')duplicates++;const matching=performance.now()-t;
  const row={noticesPerCorpus:n,bytesPerCorpus:bytes.length,generationMs:Math.round(generation),parsingBothMs:Math.round(parsing),normalizationBothMs:Math.round(normalization),indexingMs:Math.round(indexing),matchingMs:Math.round(matching),duplicates,heapUsedMB:Math.round(process.memoryUsage().heapUsed/1048576),rssMB:Math.round(process.memoryUsage().rss/1048576)};results.push(row);console.log(JSON.stringify(row));if(duplicates!==n)throw new Error('Résultat de matching incorrect');
}
writeFileSync(new URL('../tests/benchmark-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),runtime:process.version,scope:'Node, deux corpus synthétiques identiques, mesures indicatives non assimilables à un navigateur',results},null,2));
