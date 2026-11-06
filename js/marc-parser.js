// ISO 2709: all offsets and lengths refer to bytes, never decoded characters.
const ascii = new TextDecoder('ascii');
function number(bytes, start, length) {
  const s = ascii.decode(bytes.subarray(start, start + length));
  if (!/^\d+$/.test(s)) throw new Error('Nombre ISO 2709 invalide');
  return Number(s);
}
export function parseRecord(bytes, position = 0, encoding = 'auto') {
  if (bytes.length < 26) throw new Error('Notice trop courte');
  const length = number(bytes, 0, 5), base = number(bytes, 12, 5);
  if (length !== bytes.length || bytes[length - 1] !== 0x1d) throw new Error('Longueur ou fin de notice invalide');
  const leader = ascii.decode(bytes.subarray(0,24));
  const lw = number(bytes,20,1), pw = number(bytes,21,1), iw = number(bytes,22,1), step = 3+lw+pw+iw;
  if (!lw || !pw || base < 25 || base >= length || bytes[base-1] !== 0x1e || (base-25)%step) throw new Error('Répertoire ou adresse de base invalide');
  const warnings=[];
  let decoder;
  if (encoding === 'auto') {
    try { new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(base)); decoder=new TextDecoder('utf-8'); }
    catch { decoder=new TextDecoder('iso-8859-1'); warnings.push('UTF-8 invalide : repli Windows-1252 (compatible ISO-8859-1 hors contrôles). Vérifiez l’encodage ; ISO 5426 et MARC-8 ne sont pas pris en charge.'); }
  } else decoder = new TextDecoder(encoding);
  const fields=[], spans=[];
  const indicators=number(bytes,10,1), subLength=number(bytes,11,1);
  if(subLength!==2) throw new Error('Longueur des identifiants de sous-champs non prise en charge');
  for(let p=24;p<base-1;p+=step){
    const tag=ascii.decode(bytes.subarray(p,p+3)), len=number(bytes,p+3,lw), offset=number(bytes,p+3+lw,pw);
    const start=base+offset,end=start+len;
    if(!/^\d{3}$/.test(tag)||!len||end>length-1||bytes[end-1]!==0x1e) throw new Error('Zone '+tag+' hors limites ou mal terminée');
    spans.push([start,end]);
    const value=decoder.decode(bytes.subarray(start,end-1));
    if(value.includes('\ufffd')) warnings.push('Caractère de remplacement dans '+tag+' : vérifiez l’encodage.');
    if(tag.startsWith('00')) fields.push({tag,value});
    else {
      if(value.length<indicators) throw new Error('Indicateurs manquants : '+tag);
      const chunks=value.slice(indicators).split('\x1f');
      if(chunks[0].trim()) warnings.push('Texte hors sous-champ en '+tag);
      fields.push({tag,indicators:value.slice(0,indicators),subfields:chunks.slice(1).map(s=>({code:s[0],value:s.slice(1)}))});
    }
  }
  spans.sort((a,b)=>a[0]-b[0]);
  let cursor=base;
  for(const [start,end] of spans){if(start!==cursor)throw new Error('Zones chevauchantes ou données non référencées');cursor=end;}
  if(cursor!==length-1)throw new Error('Fin de données non référencée');
  return {position,length,leader,fields,raw:bytes,warnings};
}
export function parseISO2709(buffer, encoding='auto', progress=()=>{}) {
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer), records=[],errors=[];
  let position=0;
  while(position<bytes.length){
    const start=position;
    try {
      const length=number(bytes,start,5);
      if(length<26||start+length>bytes.length)throw new Error('Longueur de notice hors limites');
      records.push(parseRecord(bytes.subarray(start,start+length),start,encoding));position+=length;
    } catch(e){
      // Recover only at a record terminator; never manufacture an exportable record.
      const end=bytes.indexOf(0x1d,start);position=end<0?bytes.length:end+1;
      errors.push({position:start,length:position-start,message:e.message});
    }
    if((records.length+errors.length)%500===0)progress(position/bytes.length*100);
  }
  progress(100);return {records,errors,byteLength:bytes.length};
}
export function values(record, spec) {
  const out=[];
  for(const part of spec.split(/[,;]+/).map(x=>x.trim()).filter(Boolean)){
    const [tag,code]=part.split('$');
    for(const f of record.fields.filter(f=>f.tag===tag)){
      if(f.value!==undefined){if(!code)out.push(f.value);}
      else for(const s of f.subfields)if(!code||code.includes(s.code))out.push(s.value);
    }
  }return out;
}
export function getRecordAsMarcText(record){return ['=LDR  '+record.leader,...record.fields.map(f=>'='+f.tag+'  '+(f.value??f.indicators+f.subfields.map(s=>'$'+s.code+s.value).join('')))].join('\n');}
