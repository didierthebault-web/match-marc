export function ratio(a,b){
  if(a===b)return a?100:0;if(!a||!b)return 0;
  if(a.length>b.length)[a,b]=[b,a];
  // Bound the quadratic calculation for pathological fields; full titles remain displayed.
  a=a.slice(0,600);b=b.slice(0,600);
  let row=Array.from({length:a.length+1},(_,i)=>i);
  for(let j=1;j<=b.length;j++){const next=[j];for(let i=1;i<=a.length;i++)next[i]=Math.min(next[i-1]+1,row[i]+1,row[i-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return Math.round(100*(1-row[a.length]/Math.max(a.length,b.length)));
}
export function partialRatio(a,b){if(a.length>b.length)[a,b]=[b,a];if(!a)return 0;if(b.includes(a))return 100;let best=0;const words=b.split(' ');for(let i=0;i<Math.min(words.length,50);i++){const text=words.slice(i).join(' ').slice(0,a.length);best=Math.max(best,ratio(a,text));}return best;}
export function tokenSortRatio(a,b){return ratio(a.split(' ').sort().join(' '),b.split(' ').sort().join(' '));}
export function tokenSetRatio(a,b){const x=new Set(a.split(' ').filter(Boolean)),y=new Set(b.split(' ').filter(Boolean));const common=[...x].filter(t=>y.has(t)).length;return x.size+y.size?Math.round(200*common/(x.size+y.size)):0;}
export function titleScores(a,b){const global=ratio(a,b),partial=partialRatio(a,b),sort=tokenSortRatio(a,b),set=tokenSetRatio(a,b);return {global,partial,sort,set,score:Math.max(global,Math.min(sort,set))};}
