import test from 'node:test';
import assert from 'node:assert/strict';
import {parseISO2709,parseRecord,values,getRecordAsMarcText} from '../js/marc-parser.js';
import {normalizeISBN,normalizeTitle,normalizeAuthor,normalizeRecord} from '../js/normalization.js';
import {buildIndex,matchRecord,defaults,analyzeItems,effectiveStatus,applyDecisions} from '../js/matching.js';
import {csv,exportRows} from '../js/exports.js';
import {isbn,makeMARC,concatenate,demo} from '../scripts/fixtures.js';
const rec=(data,index=0)=>normalizeRecord(parseRecord(makeMARC(data)),index);
function match(a,bs){const s=rec(a),ts=bs.map((b,i)=>rec(b,i)),idx=buildIndex(ts);return {m:matchRecord(s,ts,idx,defaults),s,ts,idx};}
test('ISO 2709 : accents multioctets, champs répétés, séparateurs et octets intacts',()=>{
  const bytes=makeMARC({title:'L’œuf — été à São Paulo',isbn:[isbn(1),isbn(2)],extra:[['200','1 \x1faAutre titre\x1feComplément']]});
  const r=parseRecord(bytes);assert.equal(values(r,'200$a')[0],'L’œuf — été à São Paulo');assert.equal(values(r,'010$a').length,2);assert.deepEqual(r.raw,bytes);assert.ok(getRecordAsMarcText(r).includes('$eComplément'));
});
test('ISO 2709 : notice corrompue isolée, récupération et position',()=>{
  const a=makeMARC(),b=makeMARC({id:'2'}),bad=a.slice();bad[12]=57;
  const p=parseISO2709(concatenate([bad,b]));assert.equal(p.errors.length,1);assert.equal(p.records.length,1);assert.equal(p.records[0].position,bad.length);assert.deepEqual(p.records[0].raw,b);
});
test('ISO 2709 : rejet des longueurs, terminaisons, chevauchements, fichier tronqué',()=>{
  const a=makeMARC();for(const pos of [0,20,a.length-1]){const b=a.slice();b[pos]=0;assert.throws(()=>parseRecord(b));}assert.equal(parseISO2709(a.slice(0,-2)).errors.length,1);
  const overlap=a.slice();overlap.set(new TextEncoder().encode('00000'),24+12+7);assert.throws(()=>parseRecord(overlap));
});
test('ISBN : contrôle, conversion 10/13, X, plusieurs ISBN, refus des faux numéros',()=>{
  assert.equal(normalizeISBN('2-07-036822-X'),'9782070368228');assert.equal(normalizeISBN('978-2-07-036822-8'),'9782070368228');assert.equal(normalizeISBN('0-8044-2957-x'),'9780804429573');assert.equal(normalizeISBN('9782070368229'),null);assert.equal(normalizeISBN('123'),null);assert.equal(normalizeISBN('9790000000000'),null);assert.equal(normalizeISBN('ISBN 9782070368228 (broché)'),'9782070368228');
  const {m}=match({isbn:[isbn(10),isbn(11)]},[{isbn:isbn(11)}]);assert.equal(m.status,'duplicate');
});
test('Normalisation Unicode et auteurs sans perdre les originaux',()=>{assert.equal(normalizeTitle(' L’Œuvre — Été! '),'l oeuvre ete');assert.equal(normalizeAuthor('Hugo, Victor'),normalizeAuthor('Victor HUGO'));});
for(const [name,a,bs,expected]of [
  ['A : ISBN et titre identiques',{},[{}],'duplicate'],
  ['B : casse du titre',{title:'Le Petit Prince'},[{title:'Le petit prince'}],'duplicate'],
  ['C : ISBN commun, titres divergents',{title:'Le Petit Prince'},[{title:'Traité de mécanique quantique'}],'review'],
  ['D : triplet sans ISBN',{isbn:null},[{isbn:null}],'review'],
  ['E : titre identique, autre auteur',{isbn:null,author:'Hugo, Victor'},[{isbn:null,author:'Durand, Alice'}],'unique'],
  ['F : triplet identique, ISBN distincts',{isbn:isbn(4)},[{isbn:isbn(5)}],'review'],
  ['G : trois Koha pour un ISBN',{},[{id:'1'},{id:'2'},{id:'3'}],'review'],
  ['H : ni ISBN, ni auteur',{isbn:null,author:''},[{isbn:null,author:''}],'unique'],
  ['Date divergente sur ISBN',{year:2021},[{year:2022}],'review'],
  ['Titre absent',{title:''},[{}],'review'],
])test(name,()=>assert.equal(match(a,bs).m.status,expected));
test('Exemplaires : présent, à créer, autre notice, code absent, répété',()=>{
  const {m,s,ts,idx}=match({barcodes:['PRESENT','NOUVEAU','CONFLIT','']},[{barcodes:['PRESENT']},{id:'2',isbn:isbn(8),title:'Autre titre',barcodes:['CONFLIT']}]);
  const items=analyzeItems([m],[s],ts,idx);assert.deepEqual(items.map(i=>i.status),['DEJA_PRESENT','A_CREER','CONFLIT','CONFLIT']);
  const doubled=rec({barcodes:['X','X']});assert.equal(analyzeItems([m],[doubled],ts,idx)[0].status,'CONFLIT');
});
test('Décisions humaines conservent le statut initial',()=>{const {m}=match({isbn:null},[{isbn:null}]);m.decision='distinct';assert.equal(effectiveStatus(m),'unique');assert.equal(m.initialStatus,'review');m.decision='later';assert.equal(effectiveStatus(m),'review');});
test('Démonstration et exports cohérents : 8 certains / 5 à vérifier / 7 seuls',()=>{
  const d=demo(),pmb=parseISO2709(d.pmb).records.map((r,i)=>normalizeRecord(r,i)),koha=parseISO2709(d.koha).records.map((r,i)=>normalizeRecord(r,i)),idx=buildIndex(koha),matches=pmb.map(r=>matchRecord(r,koha,idx)),items=analyzeItems(matches,pmb,koha,idx);
  assert.equal(pmb.length,20);assert.equal(koha.length,30);for(const [s,n]of [['duplicate',8],['review',5],['unique',7]])assert.equal(matches.filter(m=>m.status===s).length,n);
  const selected=matches.filter(m=>m.status==='unique').map(m=>pmb[m.source].raw),exported=concatenate(selected);assert.equal(parseISO2709(exported).records.length,7);assert.deepEqual(exported,concatenate(selected));assert.equal(exportRows('unique',{matches,items,pmb,koha}).length,8);assert.equal(exportRows('duplicate',{matches,items,pmb,koha}).length,17);
});
test('CSV : UTF-8 BOM, guillemets, sauts de ligne, protection des formules',()=>{const s=csv([['=HYPERLINK("x")','a;b','été\nligne']]);assert.ok(s.startsWith('\ufeff'));assert.ok(s.includes("\"'=HYPERLINK"));assert.ok(s.includes('"a;b"'));});
test('Bloc trop large : aucun classement automatique en notice seule',()=>{const ts=Array.from({length:2001},(_,i)=>rec({id:String(i),title:'Titre commun',isbn:null},i));const m=matchRecord(rec({isbn:null,title:'Titre commun'}),ts,buildIndex(ts));assert.equal(m.status,'review');assert.ok(m.truncated);});
test('ISBN massivement répété : coût borné et vérification obligatoire',()=>{const ts=Array.from({length:110},(_,i)=>rec({id:String(i)},i));const m=matchRecord(rec({}),ts,buildIndex(ts));assert.equal(m.status,'review');assert.equal(m.candidates.length,100);assert.ok(m.truncated);});
test('Titre très long : aucun doublon certain sur comparaison tronquée',()=>{assert.equal(match({title:'a'.repeat(610)+'x'},[{title:'a'.repeat(610)+'y'}]).m.status,'review');});
test('Une validation humaine survit à un durcissement des seuils',()=>{const {s,ts,idx}=match({isbn:null,author:'Martin, Alice'},[{isbn:null,author:'Martin, Alixe'}]);const m=matchRecord(s,ts,idx,{...defaults,noIsbnAuthor:100});assert.equal(m.status,'unique');applyDecisions([m],[s],ts,{0:{decision:'duplicate',target:0,positionKoha:ts[0].position}});assert.equal(effectiveStatus(m),'duplicate');assert.equal(m.initialStatus,'unique');assert.equal(m.candidates.length,1);});
