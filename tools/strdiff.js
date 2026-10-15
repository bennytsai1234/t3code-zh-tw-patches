const fs=require('fs');const [a,b]=process.argv.slice(2).map(p=>fs.readFileSync(p,'utf8'));
let i=0;const out=[];let ai=0,bi=0;
// iterative: find first diff, then find resync via common suffix search
while(ai<a.length||bi<b.length){
  while(ai<a.length&&bi<b.length&&a[ai]===b[bi]){ai++;bi++}
  if(ai>=a.length&&bi>=b.length)break;
  // find resync: smallest (da,db) such that a.substr(ai+da,60)==b.substr(bi+db,60)
  let found=null;
  for(let s=0;s<200000&&!found;s++){for(let da=0;da<=s;da++){const db=s-da;const k=a.substr(ai+da,80);if(k.length&&k===b.substr(bi+db,80)){found=[da,db];break}}}
  if(!found){out.push({ai,bi,old:a.slice(ai,ai+300),new:b.slice(bi,bi+300),note:'nosync'});break}
  out.push({at:ai,ctx:a.slice(Math.max(0,ai-150),ai),old:a.substr(ai,found[0]),new:b.substr(bi,found[1]),after:a.substr(ai+found[0],80)});
  ai+=found[0];bi+=found[1];
}
console.log(JSON.stringify(out,null,1));
