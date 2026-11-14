import { assert, crypto, fs, os, path, spawnSync, test, writeFile } from './helpers.ts';
import { catalogPackageSeed, copyCatalogPackageSeed } from '../../../scripts/build-full-first-install-package/catalog-package-seed.ts';
import { prepareCatalogMediaSeed } from '../../../scripts/prepare-catalog-media-seed.ts';
import { resolveSelectedPackageSetInput } from '../../../scripts/build-full-first-install-package/runtime-cache-package-set.ts';

function fixture(root: string) {
  writeFile(path.join(root, 'catalog/media-storage.json'), JSON.stringify({ profile: 'catalog' }));
  writeFile(path.join(root, 'tools/query.py'), 'print("catalog")\n');
  const paths = ['catalog/media-storage.json', 'tools/query.py'];
  const hash = crypto.createHash('sha256');
  for (const name of paths) {
    const label = Buffer.from(name), body = fs.readFileSync(path.join(root, name)), size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(label.length)); hash.update(size); hash.update(label);
    size.writeBigUInt64BE(BigInt(body.length)); hash.update(size); hash.update(body);
  }
  writeFile(path.join(root, 'opl-package.json'), JSON.stringify({ package_id: 'mac-media-assets', version: '1.2.3', content_lock: {
    algorithm: 'sha256', canonicalization: 'ordered_path_length_file_length_bytes', paths, digest: 'sha256:' + hash.digest('hex'),
  } }));
  const descriptor=JSON.parse(fs.readFileSync(path.join(root,'opl-package.json'),'utf8'));
  writeFile(path.join(root,'contracts/opl_capability_package_manifest.json'),JSON.stringify(descriptor));
}

test('Full copies only the verified catalog lock, even from a full source checkout', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-catalog-seed-'));
  try {
    const root = path.join(temp, 'source'), destination = path.join(temp, 'runtime');
    fixture(root);
    const file = fs.openSync(path.join(root, 'unregistered-large-media.bin'), 'w');
    fs.ftruncateSync(file, 64 * 1024 * 1024); fs.closeSync(file);
    const seed = copyCatalogPackageSeed(root, destination)!;
    assert.equal(seed.packageId, 'mac-media-assets');
    assert.ok(seed.bytes < 1024);
    assert.equal(fs.readFileSync(path.join(destination,'contracts/opl_capability_package_manifest.json'),'utf8'),
      fs.readFileSync(path.join(root,'contracts/opl_capability_package_manifest.json'),'utf8'));
    assert.equal(fs.existsSync(path.join(destination, 'unregistered-large-media.bin')), false);
    assert.equal(catalogPackageSeed(destination)?.digest, seed.digest);
    fs.appendFileSync(path.join(root, 'tools/query.py'), '# changed');
    assert.throws(() => catalogPackageSeed(root), /differs from its content lock/);
    fixture(root);
    const oversized = fs.openSync(path.join(root, 'tools/query.py'), 'w');
    fs.ftruncateSync(oversized, 50 * 1024 * 1024 + 1); fs.closeSync(oversized);
    assert.throws(() => catalogPackageSeed(root), /exceeds.*budget/);
    fixture(root);
    writeFile(path.join(root,'contracts/opl_capability_package_manifest.json'),JSON.stringify({package_id:'mac-media-assets',version:'1.2.3'}));
    assert.throws(() => catalogPackageSeed(root), /owner manifest differs/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('legacy media is deferred, while a catalog seed enters the Full dependency closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-catalog-package-set-'));
  try {
    writeFile(path.join(root, 'opl-package.json'), '{}');
    assert.equal(catalogPackageSeed(root), null);
    fixture(root);
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const selected = resolveSelectedPackageSetInput({ macMediaAssetsRoot: root, macRoot: root }, {
      profile_id: 'starter', package_ids: ['med-autocast'], dependency_closure: ['med-autocast'],
    });
    assert.deepEqual(selected.dependency_closure, ['med-autocast', 'mac-media-assets']);
    assert.equal(selected.packages.at(-1)?.source_fingerprint, catalogPackageSeed(root)?.digest);
    const storage = path.join(root, 'catalog/media-storage.json');
    writeFile(storage, JSON.stringify({ profile: 'full' }));
    assert.throws(() => catalogPackageSeed(root), /only.*catalog/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('catalog preparation restores locked files in a non-cone sparse checkout', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opl-catalog-sparse-'));
  try {
    fixture(root);
    writeFile(path.join(root,'payloads/large.bin'),'legacy media stays excluded');
    for (const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],
      ['sparse-checkout','set','--no-cone','/catalog/','/contracts/','/opl-package.json']]) {
      const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
    assert.equal(fs.existsSync(path.join(root,'tools/query.py')),false);
    assert.equal(prepareCatalogMediaSeed(root).status,'prepared');
    assert.equal(fs.existsSync(path.join(root,'tools/query.py')),true);
    assert.equal(fs.existsSync(path.join(root,'payloads/large.bin')),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('catalog preparation leaves excluded media blobs unfetched in a partial clone', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-catalog-partial-'));
  const source = path.join(temp, 'source'), clone = path.join(temp, 'clone');
  const git = (cwd: string, args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    fixture(source);
    // Several locked blobs must be absent to expose per-object lazy fetching.
    for (const name of ['one', 'two', 'three']) {
      const file = `tools/${name}.py`;
      writeFile(path.join(source, file), `print("${name}")\n`);
    }
    const descriptor = JSON.parse(fs.readFileSync(path.join(source, 'opl-package.json'), 'utf8'));
    descriptor.content_lock.paths.push('tools/one.py', 'tools/two.py', 'tools/three.py');
    const hash = crypto.createHash('sha256');
    for (const name of descriptor.content_lock.paths) {
      const label = Buffer.from(name), body = fs.readFileSync(path.join(source, name)), size = Buffer.alloc(8);
      size.writeBigUInt64BE(BigInt(label.length)); hash.update(size); hash.update(label);
      size.writeBigUInt64BE(BigInt(body.length)); hash.update(size); hash.update(body);
    }
    descriptor.content_lock.digest = `sha256:${hash.digest('hex')}`;
    for (const name of ['opl-package.json', 'contracts/opl_capability_package_manifest.json']) {
      writeFile(path.join(source, name), JSON.stringify(descriptor));
    }
    writeFile(path.join(source, 'payloads/large.bin'), 'excluded full media');
    for (const args of [['init', '-q'], ['add', '.'],
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'],
      ['config', 'uploadpack.allowFilter', 'true']]) git(source, args);
    const excluded = git(source, ['rev-parse', 'HEAD:payloads/large.bin']).trim();
    git(temp, ['clone', '-q', '--no-checkout', '--filter=blob:none', `file://${source}`, clone]);
    git(clone, ['sparse-checkout', 'set', '--no-cone', '/catalog/', '/contracts/', '/opl-package.json']);
    git(clone, ['checkout', '-q']);
    const present = () => git(clone, ['cat-file', '--batch-all-objects', '--batch-check=%(objectname)'])
      .split('\n').includes(excluded);
    assert.equal(present(), false, 'Fixture must start without the excluded blob');
    const trace = path.join(temp, 'fetch.log');
    const result = spawnSync(process.execPath, ['--experimental-strip-types',
      path.resolve(import.meta.dirname, '../../../scripts/prepare-catalog-media-seed.ts'), '--root', clone],
      { encoding: 'utf8', env: { ...process.env, GIT_TRACE: trace } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'prepared');
    assert.equal(fs.readFileSync(trace, 'utf8').split('\n').filter(line => line.includes('built-in: git fetch')).length,
      1, 'Selected missing blobs must use a single remote fetch');
    assert.equal(fs.existsSync(path.join(clone, 'tools/query.py')), true);
    assert.equal(present(), false, 'Catalog size inspection must not download full media');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
