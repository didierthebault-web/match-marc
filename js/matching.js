import {titleScores,ratio} from './similarity.js';
export const defaults={candidateTitle:80,isbnTitle:85,noIsbnTitle:90,noIsbnAuthor:85,dateTolerance:0};
const add=(map,key,id)=>{if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id);};
const tokens=r=>[...new Set(r.normalizedTitle.split(' ').filter(s=>s.length>2))];
export function buildIndex(records,progress=()=>{}){
  const idx={isbn:new Map(),title:new Map(),author:new Map(),word:new Map(),barcode:new Map()};
  records.forEach((r,i)=>{
    r.normalizedISBNs.forEach(k=>add(idx.isbn,k,i));add(idx.title,r.normalizedTitle,i);
    r.normalizedAuthors.forEach(k=>add(idx.author,k,i));tokens(r).forEach(k=>add(idx.word,k,i));
    r.items.forEach(it=>{if(it.barcode)add(idx.barcode,it.barcode,{record:i,item:it.index});});
    if(i%1000===0)progress(i/records.length*100);
  });progress(100);return idx;
}
export function comparePair(source,target){
  const titles=titleScores(source.normalizedTitle,target.normalizedTitle);
  let author=0;for(const a of source.normalizedAuthors)for(const b of target.normalizedAuthors)author=Math.max(author,ratio(a,b));
  const dateDistance=source.publicationYears.length&&target.publicationYears.length?Math.min(...source.publicationYears.flatMap(a=>target.publicationYears.map(b=>Math.abs(a-b)))):null;
  const sharedISBNs=source.normalizedISBNs.filter(s=>target.normalizedISBNs.includes(s));
  return {target:target.index,titles,author,dateDistance,sharedISBNs};
}
export function matchRecord(source,targets,idx,config=defaults){
  const isbnIDs=new Set();let truncated=false;
  for(const key of source.normalizedISBNs){const block=idx.isbn.get(key)||[];if(block.length>100)truncated=true;for(let i=0;i<Math.min(block.length,100);i++){if(isbnIDs.size>=100){truncated=true;break;}isbnIDs.add(block[i]);}}
  const ids=new Set(isbnIDs);
  if(!isbnIDs.size){
    const blocks=[idx.title.get(source.normalizedTitle),...source.normalizedAuthors.map(k=>idx.author.get(k)),...tokens(source).map(k=>idx.word.get(k))].filter(Boolean).sort((a,b)=>a.length-b.length);
    // Every block is bounded, not a Cartesian catalogue scan. Report any unexamined candidates.
    for(const block of blocks){if(block.length>2000){truncated=true;continue;}for(const id of block){if(ids.size>=2000&&!ids.has(id)){truncated=true;break;}ids.add(id);}}
  }
  const pairs=[...ids].map(i=>comparePair(source,targets[i]));
  let candidates=isbnIDs.size?pairs:pairs.filter(p=>p.titles.score>=config.candidateTitle&&p.author>=config.noIsbnAuthor&&p.dateDistance!==null&&p.dateDistance<=config.dateTolerance);
  candidates.sort((a,b)=>b.titles.score-a.titles.score||b.author-a.author||a.target-b.target);
  let status='unique',reasons=['Aucune correspondance ISBN ; aucun candidat Titre/Auteur/Date suffisant.'];
  if(candidates.length){
    status='review';reasons=[];
    if(isbnIDs.size){
      reasons.push('ISBN valide commun.');
      if(isbnIDs.size>1)reasons.push('Plusieurs notices Koha possèdent un ISBN commun.');
      const p=candidates[0],t=targets[p.target];
      const authorConflict=source.authors.length&&t.authors.length&&p.author<85;
      const dateConflict=p.dateDistance!==null&&p.dateDistance!==0;
      const editionConflict=source.edition&&t.edition&&source.edition!==t.edition;
      const longTitle=source.normalizedTitle.length>600||t.normalizedTitle.length>600;
      if(p.titles.score<config.isbnTitle||authorConflict||dateConflict||editionConflict||longTitle)reasons.push('ISBN commun mais divergence bibliographique détectée (titre, auteur, date ou édition/publication), ou titre trop long pour un contrôle complet.');
      else if(isbnIDs.size===1&&!truncated){status='duplicate';reasons.push('Candidat unique, titre au-dessus du seuil et aucune divergence majeure connue.');}
      if(!source.authors.length||!t.authors.length||p.dateDistance===null)reasons.push('Auteur ou date manquant : contrôle partiel.');
    }else {
      reasons.push('Titre + Auteur + Date : validation humaine requise.');
      if(candidates.some(p=>p.titles.score<config.noIsbnTitle))reasons.push('Similarité du titre sous le seuil sans ISBN : candidat faible à examiner.');
      if(source.normalizedISBNs.length&&candidates.some(p=>targets[p.target].normalizedISBNs.length))reasons.push('Titre/Auteur/Date proches mais ISBN différents.');
      if(candidates.length>1)reasons.push('Plusieurs candidats proches.');
    }
  }
  if(truncated){status='review';reasons.push('Bloc de recherche trop large : recherche incomplète, aucune importation automatique. Affinez les données.');}
  if(!source.title){status='review';reasons.push('Notice sans titre : validation nécessaire.');}
  return {source:source.index,status,initialStatus:status,method:isbnIDs.size?'ISBN':'Titre/Auteur/Date',candidates,reasons,truncated,decision:null,selectedTarget:status==='duplicate'?candidates[0].target:null};
}
export function effectiveStatus(match){return match.decision==='duplicate'?'duplicate':match.decision==='distinct'?'unique':match.decision==='later'?'review':match.status;}
export function analyzeItems(matches,sources,targets,idx){
  const sourceBarcodes=new Map();for(const s of sources)for(const it of s.items)if(it.barcode)add(sourceBarcodes,it.barcode,s.index);
  const items=[];
  for(const m of matches){
    const status=effectiveStatus(m);if(status!=='duplicate')continue;
    for(const it of sources[m.source].items){
      const found=idx.barcode.get(it.barcode)||[];
      const conflict=!it.barcode||(sourceBarcodes.get(it.barcode)||[]).length>1||found.length>1||found.some(x=>x.record!==m.selectedTarget);
      items.push({...it,source:m.source,target:m.selectedTarget,status:conflict?'CONFLIT':found.length?'DEJA_PRESENT':'A_CREER',reason:conflict?'Conflit d’exemplaire — validation nécessaire (code-barres absent, répété ou sur une autre notice).':''});
    }
  }return items;
}
export function anomalies(sources,targets,idx,matches,parseErrors=[]){
  const out=[...parseErrors];
  for(const [side,records] of [['PMB',sources],['Koha',targets]]){
    const isbn=new Map(),barcodes=new Map();
    for(const r of records){
      if(!r.id)out.push({side,id:'#'+(r.index+1),message:'Identifiant absent : position de fichier utilisée.'});
      if(!r.title)out.push({side,id:r.id,message:'Notice sans titre'});
      for(const s of r.invalidISBNs)out.push({side,id:r.id,message:'ISBN invalide : '+s});
      for(const w of r.warnings)out.push({side,id:r.id,message:w});
      for(const k of r.normalizedISBNs)add(isbn,k,r.id||'#'+r.index);
      for(const it of r.items)if(it.barcode)add(barcodes,it.barcode,r.id||'#'+r.index);
    }
    for(const [k,ids] of isbn)if(ids.length>1)out.push({side,id:ids.join(', '),message:'Plusieurs notices avec le même ISBN : '+k});
    for(const [k,ids] of barcodes)if(ids.length>1)out.push({side,id:ids.join(', '),message:'Code-barres répété : '+k});
    const ids=new Map();for(const r of records)if(r.id)add(ids,r.id,r.index);
    for(const [id,list]of ids)if(list.length>1)out.push({side,id,message:'Identifiant notice répété : validation conservée par position.'});
  }
  for(const m of matches)if(m.initialStatus==='review')out.push({side:'PMB',id:sources[m.source].id,message:m.reasons.join(' ')});
  return out;
}
