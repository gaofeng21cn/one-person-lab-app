import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readAppProductProfile } from '../app-product-profile/profile-contract.ts';

export function catalogPackageSeed(root: string | undefined) {
  if (!root) return null;
  const policy = readAppProductProfile().official_profile.distribution_forms.full.catalog_media_dependency;
  if (!fs.existsSync(path.join(root,'catalog/media-storage.json'))) return null;
  const storage=JSON.parse(fs.readFileSync(path.join(root,'catalog/media-storage.json'),'utf8'));
  const descriptorPath=path.join(root,'opl-package.json');
  const descriptor=JSON.parse(fs.readFileSync(descriptorPath,'utf8'));
  const ownerManifestPath=path.join(root,'contracts/opl_capability_package_manifest.json');
  const ownerManifest=JSON.parse(fs.readFileSync(ownerManifestPath,'utf8'));
  if(storage.profile!=='catalog'||descriptor.package_id!==policy.package_id)throw new Error('Full accepts only the declared catalog media profile.');
  if(ownerManifest.package_id!==descriptor.package_id||ownerManifest.version!==descriptor.version
    ||JSON.stringify(ownerManifest.content_lock)!==JSON.stringify(descriptor.content_lock)
    ||JSON.stringify(ownerManifest.entrypoints)!==JSON.stringify(descriptor.entrypoints))throw new Error('Catalog media owner manifest differs from its package descriptor.');
  const lock=descriptor.content_lock;
  if(lock?.algorithm!=='sha256'||lock.canonicalization!=='ordered_path_length_file_length_bytes'||!Array.isArray(lock.paths)||new Set(lock.paths).size!==lock.paths.length)throw new Error('Catalog media seed requires its exact content lock.');
  const files=lock.paths.map((name:string)=>{
    if(!name||path.posix.isAbsolute(name)||name.split('/').includes('..')||name.includes('\\'))throw new Error('Catalog media seed path escapes its owner.');
    const absolute=path.resolve(root,name);
    if(!fs.realpathSync(absolute).startsWith(fs.realpathSync(root)+path.sep)||!fs.lstatSync(absolute).isFile())throw new Error('Catalog media seed contains an unavailable or indirect file.');
    return {name,absolute,bytes:fs.statSync(absolute).size};
  });
  const bytes=files.reduce((total:number,item)=>total+item.bytes,0)
    +fs.statSync(descriptorPath).size+fs.statSync(ownerManifestPath).size;
  if(bytes>policy.max_unpacked_bytes)throw new Error('Catalog media seed exceeds the Full installer budget.');
  const hash=crypto.createHash('sha256');
  for(const item of files){
    const name=Buffer.from(item.name),body=fs.readFileSync(item.absolute),size=Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(name.length));hash.update(size);hash.update(name);
    size.writeBigUInt64BE(BigInt(body.length));hash.update(size);hash.update(body);
  }
  const digest='sha256:'+hash.digest('hex');
  if(digest!==lock.digest)throw new Error('Catalog media seed differs from its content lock.');
  return {packageId:policy.package_id,bytes,digest,files,descriptorPath};
}

export function copyCatalogPackageSeed(root:string|undefined,destination:string){
  const seed=catalogPackageSeed(root);if(!seed)return null;
  for(const item of seed.files){const target=path.join(destination,item.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(item.absolute,target)}
  fs.copyFileSync(seed.descriptorPath,path.join(destination,'opl-package.json'));
  const ownerManifest=path.join(root!,'contracts/opl_capability_package_manifest.json');
  const ownerTarget=path.join(destination,'contracts/opl_capability_package_manifest.json');
  fs.mkdirSync(path.dirname(ownerTarget),{recursive:true});fs.copyFileSync(ownerManifest,ownerTarget);
  return seed;
}
