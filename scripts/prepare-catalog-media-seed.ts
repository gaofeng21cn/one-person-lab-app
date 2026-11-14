import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readAppProductProfile } from './app-product-profile/profile-contract.ts';
import { catalogPackageSeed } from './build-full-first-install-package/catalog-package-seed.ts';

export function prepareCatalogMediaSeed(root:string){
  const metadata=path.join(root,'catalog/media-storage.json');
  if(!fs.existsSync(metadata))return {status:'deferred',reason:'legacy_full_media_payload'};
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'opl-package.json'),'utf8'));
  const paths=manifest.content_lock?.paths;
  if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||/[\r\n*?\[\]]/.test(p)||p.split('/').includes('..')))throw new Error('Invalid catalog media content-lock paths.');
  if(paths.some(p=>!fs.existsSync(path.join(root,p)))){
    const selected=execFileSync('git',['-C',root,'ls-tree','-rz','HEAD','--',...paths],{encoding:'utf8',maxBuffer:16*1024*1024});
    const objects=[...new Set(selected.split('\0').filter(Boolean).map(row=>row.split('\t')[0].split(' ').at(-1)!))];
    // Fetch the selected blobs together; ls-tree -l otherwise lazily fetches
    // each missing blob in its own remote round trip just to obtain its size.
    const trace=execFileSync('git',['-C',root,'cat-file','--batch-check=%(objectname) %(objectsize)'],{
      input:objects.join('\n')+'\n',encoding:'utf8',env:{...process.env,GIT_NO_LAZY_FETCH:'1'},maxBuffer:16*1024*1024,
    });
    const missing=trace.split('\n').filter(row=>row.endsWith(' missing')).map(row=>row.split(' ')[0]);
    if(missing.length)execFileSync('git',['-C',root,'fetch','--no-tags','--no-write-fetch-head','--recurse-submodules=no','--filter=blob:none','--stdin','origin'],{
      input:missing.join('\n')+'\n',stdio:['pipe','pipe','pipe'],
    });
    // Asking for every blob's size hydrates excluded media in a partial clone.
    const tree=execFileSync('git',['-C',root,'ls-tree','-rlz','HEAD','--',...paths],{encoding:'utf8',maxBuffer:16*1024*1024});
    const sizes=new Map(tree.split('\0').filter(Boolean).map(row=>{const [header,name]=row.split('\t');return [name,Number(header.trim().split(/\s+/).at(-1))] as const}));
    const total=paths.reduce((sum,p)=>{if(!sizes.has(p))throw new Error('The frozen source is missing a catalog media member.');return sum+sizes.get(p)!},0);
    const policy=readAppProductProfile().official_profile.distribution_forms.full.catalog_media_dependency;
    if(total>policy.max_unpacked_bytes)throw new Error('Catalog media seed exceeds the Full installer budget before download.');
    execFileSync('git',['-C',root,'sparse-checkout','add','--stdin'],{input:paths.map(p=>'/'+p).join('\n')+'\n',stdio:['pipe','pipe','pipe']});
  }
  const seed=catalogPackageSeed(root)!;return {status:'prepared',package_id:seed.packageId,bytes:seed.bytes,digest:seed.digest};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=process.argv[process.argv.indexOf('--root')+1];
  if(!process.argv.includes('--root')||!root)throw new Error('--root is required');
  console.log(JSON.stringify(prepareCatalogMediaSeed(path.resolve(root))));
}
