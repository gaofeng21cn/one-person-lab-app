import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeFullShellNativeRpaths } from '../../scripts/build-full-first-install-package/precompression.ts';

function command(name: string, args: string[]) {
  const result = spawnSync(name, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

for (const portable of [true, false]) {
  test(`Full native RPATH normalization ${portable ? 'preserves actual local loading and nested signing order' : 'rejects a dependency that needs the removed path'}`, { skip: process.platform !== 'darwin' }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-native-rpaths-'));
    try {
      const app = path.join(root, 'One Person Lab.app');
      const helper = path.join(app, 'Contents/Resources/app.asar.unpacked/node_modules/example/Helper.app');
      const bin = path.join(helper, 'Contents/MacOS');
      fs.mkdirSync(bin, { recursive: true });
      const library = path.join(bin, 'libportable.dylib');
      const executable = path.join(bin, 'helper');
      const staleTicket = path.join(helper, 'Contents', 'CodeResources');
      fs.writeFileSync(staleTicket, 'upstream-stapled-ticket');
      fs.writeFileSync(path.join(root, 'library.c'), 'int answer(void) { return 42; }\n');
      fs.writeFileSync(path.join(root, 'main.c'), 'extern int answer(void); int main(void) { return answer() == 42 ? 0 : 1; }\n');
      command('cc', ['-dynamiclib', path.join(root, 'library.c'), '-install_name', '@rpath/libportable.dylib', '-o', library]);
      command('cc', [path.join(root, 'main.c'), '-L', bin, '-lportable',
        ...(portable ? ['-Wl,-rpath,@loader_path'] : []), '-Wl,-rpath,/Users/upstream-build/lib', '-o', executable]);
      const original = fs.readFileSync(executable);
      const signed: string[] = [];
      const normalize = () => normalizeFullShellNativeRpaths(app, (target) => {
        signed.push(target);
        if (target === executable) command('codesign', ['--force', '--sign', '-', target]);
      });
      if (!portable) {
        assert.throws(normalize, /no retained local resolution/);
        assert.deepEqual(fs.readFileSync(executable), original);
        assert.equal(fs.existsSync(staleTicket), true);
        assert.deepEqual(signed, []);
        return;
      }
      const changes = normalize();
      assert.equal(changes.length, 1);
      assert.deepEqual(changes[0].removed_rpaths, ['/Users/upstream-build/lib']);
      assert.equal(fs.existsSync(staleTicket), false);
      assert.deepEqual(signed, [executable, helper]);
      assert.doesNotMatch(command('otool', ['-l', executable]), /\/Users\/upstream-build/);
      command('codesign', ['--verify', '--strict', executable]);
      command(executable, []);
      assert.deepEqual(normalize(), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
