import {values} from './marc-parser.js';
export const defaultMapping={id:'001',isbn:'010$a',title:'200$a,200$e,200$h,200$i',authors:'700,701,702,710,711,712',year:'214$d,210$d',edition:'205$a,214$a,214$c,210$a,210$c',physical:'215$a,215$c,215$d',itemTag:'995',site:'b',location:'e',barcode:'f',collection:'8',loan:'r'};
export function normalizeTitle(s=''){return s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export function normalizeAuthor(s=''){return normalizeTitle(s).split(' ').filter(Boolean).sort().join(' ');}
export function isbn13Check(s){let sum=0;for(let i=0;i<12;i++)sum+=Number(s[i])*(i%2?3:1);return String((10-sum%10)%10);}
export function normalizeISBN(original=''){
  const s=original.trim().replace(/^(?:ISBN(?:-1[03])?\s*:?\s*)/i,'').replace(/\s*\([^)]*\)\s*$/,'').replace(/[\s-]/g,'').toUpperCase();
  if(/^\d{9}[\dX]$/.test(s)){
    const sum=[...s].reduce((n,c,i)=>n+(c==='X'?10:Number(c))*(10-i),0);
    if(sum%11)return null;const base='978'+s.slice(0,9);return base+isbn13Check(base);
  }
  return /^97[89]\d{10}$/.test(s)&&isbn13Check(s)===s[12]?s:null;
}
export function normalizeRecord(record,index,mapping=defaultMapping){
  const originalISBNs=values(record,mapping.isbn), title=values(record,mapping.title).join(' : ');
  const authors=[];
  for(const tag of mapping.authors.split(',').map(s=>s.trim())){
    for(const f of record.fields.filter(f=>f.tag===tag)){
      const author=(f.subfields||[]).filter(s=>['a','b'].includes(s.code)).map(s=>s.value).join(', ');if(author)authors.push(author);
    }
  }
  let dateValues=values(record,mapping.year.split(',')[0]);
  if(!dateValues.length)dateValues=values(record,mapping.year.split(',').slice(1).join(','));
  const publicationYears=[...new Set(dateValues.flatMap(s=>s.match(/\b(?:1\d{3}|20\d{2}|21\d{2})\b/g)||[]).map(Number))];
  const items=record.fields.filter(f=>f.tag===mapping.itemTag).map((f,i)=>{
    const item={index:i};for(const key of ['site','location','barcode','collection','loan'])item[key]=(f.subfields||[]).filter(s=>s.code===mapping[key]).map(s=>s.value.trim()).join(' | ');return item;
  });
  return {...record,index,id:values(record,mapping.id)[0]||'',title,normalizedTitle:normalizeTitle(title),authors,normalizedAuthors:authors.map(normalizeAuthor),originalISBNs,normalizedISBNs:[...new Set(originalISBNs.map(normalizeISBN).filter(Boolean))],invalidISBNs:originalISBNs.filter(s=>!normalizeISBN(s)),publicationYears,items,edition:values(record,mapping.edition).join(' ; '),physical:values(record,mapping.physical).join(' ; ')};
}
