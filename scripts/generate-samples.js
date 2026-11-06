import {writeFileSync} from 'node:fs';
import {demo} from './fixtures.js';
for(const [side,bytes]of Object.entries(demo()))writeFileSync(new URL('../samples/corpus-'+side+'-demo.mrc',import.meta.url),bytes);
console.log('Démonstration synthétique : 20 PMB, 30 Koha.');
