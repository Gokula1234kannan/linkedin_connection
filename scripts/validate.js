const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
function walk(dir){
  let out=[];
  for(const item of fs.readdirSync(dir)){
    const p=path.join(dir,item);
    const s=fs.statSync(p);
    if(s.isDirectory()) out=out.concat(walk(p));
    else if(p.endsWith('.js')) out.push(p);
  }
  return out;
}
for(const file of [...walk('src'), ...walk('scripts')]){
  const r = spawnSync(process.execPath, ['--check', file], { stdio:'inherit' });
  if(r.status !== 0) process.exit(r.status);
}
console.log('Syntax OK');
