import {isbn13Check} from '../js/normalization.js';
const enc=new TextEncoder();
export function isbn(i){const base='978'+String(i).padStart(9,'0');return base+isbn13Check(base);}
export function makeMARC({id='1',title='Le jardin des étoiles',author='Martin, Alice',year=2021,isbn:isbnValue=isbn(1),barcodes=[],items=null,extra=[]}={}){
  const fields=[['001',String(id)],...(isbnValue?[].concat(isbnValue).map(v=>['010','  \x1fa'+v]):[]),['200','1 \x1fa'+title],...(author?[['700','  \x1fa'+author]]:[]),...(year?[['214','  \x1fd'+year]]:[]),...(items||barcodes.map(barcode=>({barcode,site:'CENTRE',location:'ADULTES',collection:'GENERAL',loan:'NORMAL'}))).map(it=>['995','  '+[['b',it.site],['e',it.location],['f',it.barcode],['8',it.collection],['r',it.loan]].filter(([,v])=>v).map(([k,v])=>'\x1f'+k+v).join('')]),...extra];
  let offset=0;const chunks=[],directory=[];
  for(const [tag,value]of fields){const data=enc.encode(value+'\x1e');directory.push(tag+String(data.length).padStart(4,'0')+String(offset).padStart(5,'0'));chunks.push(data);offset+=data.length;}
  const base=24+directory.length*12+1,length=base+offset+1;
  const leader=String(length).padStart(5,'0')+'nam a22'+String(base).padStart(5,'0')+'   4500';
  if(leader.length!==24)throw new Error('leader');
  const out=new Uint8Array(length);out.set(enc.encode(leader+directory.join('')+'\x1e'));let p=base;for(const c of chunks){out.set(c,p);p+=c.length;}out[p]=0x1d;return out;
}
export function concatenate(records){const out=new Uint8Array(records.reduce((n,r)=>n+r.length,0));let p=0;for(const r of records){out.set(r,p);p+=r.length;}return out;}
export function demo(){
  const pmb=[],koha=[];
  for(let i=0;i<8;i++){
    const data={id:'PMB-'+(i+1),title:['Le jardin des étoiles','Une île en hiver','L’atelier des nuages','Cartographie des possibles','Le chemin des lucioles','Les voix de la rivière','Carnets du grand large','Mémoire des pierres'][i],author:'Auteur fictif, Camille '+i,year:2020+i%4,isbn:isbn(i+1),barcodes:['PMB-'+i+'-A','PMB-'+i+'-B']};
    pmb.push(makeMARC(data));koha.push(makeMARC({...data,id:String(1001+i),barcodes:i===0?['PMB-0-A']:i===1?['PMB-2-A']:[]}));
  }
  for(let i=8;i<11;i++){const d={id:'PMB-'+(i+1),title:['Le musée des brumes','La fabrique du silence','Atlas des petits voyages'][i-8],author:'Personnage, Lou '+i,year:2019,isbn:null,barcodes:['SANSISBN-'+i]};pmb.push(makeMARC(d));koha.push(makeMARC({...d,id:String(1001+i),barcodes:[]}));}
  const ambiguous={id:'PMB-12',title:'Les saisons de papier',author:'Plume, Noé',year:2023,isbn:isbn(12),barcodes:['AMB-12']};pmb.push(makeMARC(ambiguous));koha.push(makeMARC({...ambiguous,id:'1012'}),makeMARC({...ambiguous,id:'1013',year:2024}));
  pmb.push(makeMARC({id:'PMB-13',title:'Voyage au centre du livre',isbn:isbn(13)}));koha.push(makeMARC({id:'1014',title:'Manuel de mécanique céleste',isbn:isbn(13),author:'Autre, Auteur',year:2001}));
  for(let i=13;i<20;i++)pmb.push(makeMARC({id:'PMB-'+(i+1),title:'Chronique inédite '+(i+1),author:'Inventé, Sam '+i,year:2010+i%5,isbn:i===19?'978-0-000-00000-0':isbn(i+1),barcodes:['UNIQUE-'+i]}));
  for(let i=koha.length;i<30;i++)koha.push(makeMARC({id:String(1001+i),title:'Ressource cible uniquement '+i,author:'Cible, Alex '+i,year:1999,isbn:isbn(i+100)}));
  return {pmb:concatenate(pmb),koha:concatenate(koha)};
}
