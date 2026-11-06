import {effectiveStatus} from './matching.js';
export function csv(rows){
  // Neutralize spreadsheet formula injection without changing MARC originals.
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');
}
export function download(content,name,type='text/csv;charset=utf-8'){const blob=content instanceof Blob?content:new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
export function exportRows(kind,state){
  const {matches,items,pmb,koha}=state;
  const head=['id_notice_PMB','biblionumber_Koha','isbn','titre_PMB','titre_Koha','auteur_PMB','auteur_Koha','date_PMB','date_Koha','methode_matching','score_titre','score_auteur','decision','validation_humaine'];
  const pairRow=(m,c)=>{const s=pmb[m.source],t=koha[c?.target];return [s.id,t?.id||'',s.originalISBNs.join(' | '),s.title,t?.title||'',s.authors.join(' | '),t?.authors.join(' | '),s.publicationYears.join(' | '),t?.publicationYears.join(' | '),m.method,c?.titles.score??'',c?.author??'',effectiveStatus(m),m.decision||''];};
  if(kind==='duplicate'){
    const rows=[[...head,'code_barres','site','localisation','fonds','type_pret','statut_exemplaire','raison_exemplaire']];
    const grouped=new Map();for(const it of items){if(!grouped.has(it.source))grouped.set(it.source,[]);grouped.get(it.source).push(it);}
    for(const m of matches.filter(m=>effectiveStatus(m)==='duplicate')){const c=m.candidates.find(c=>c.target===m.selectedTarget),its=grouped.get(m.source)||[];for(const it of its.length?its:[{}])rows.push([...pairRow(m,c),it.barcode,it.site,it.location,it.collection,it.loan,it.status,it.reason]);}return rows;
  }
  if(kind==='review')return [[...head,'raisons'],...matches.filter(m=>effectiveStatus(m)==='review').flatMap(m=>(m.candidates.length?m.candidates:[null]).map(c=>[...pairRow(m,c),m.reasons.join(' ')]))];
  return [['id_PMB','isbn','titre','auteur','date','raison'],...matches.filter(m=>effectiveStatus(m)==='unique').map(m=>{const s=pmb[m.source];return [s.id,s.originalISBNs.join(' | '),s.title,s.authors.join(' | '),s.publicationYears.join(' | '),m.decision==='distinct'?'Notice distincte : validation humaine':m.reasons.join(' ')];})];
}
