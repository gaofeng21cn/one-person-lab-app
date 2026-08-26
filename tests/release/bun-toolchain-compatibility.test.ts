import {
  appRoot,
  assert,
  fs,
  os,
  path,
  test,
} from './app-release-boundary-cases/helpers.ts';
import { collectBunToolchainCompatibilityViolations } from '../../scripts/validate-release-boundary/bun-toolchain-compatibility.ts';

test('release callers use the Bun version that can consume the active Shell lockfile', () => {
  assert.deepEqual(collectBunToolchainCompatibilityViolations(appRoot), []);
});

test('release boundary rejects a Bun version older than the active Shell lockfile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bun-toolchain-'));
  try {
    fs.cpSync(path.join(appRoot, '.github'), path.join(root, '.github'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
    fs.copyFileSync(
      path.join(
        appRoot,
        'contracts',
        'app-full-third-party-source-manifest.json',
      ),
      path.join(root, 'contracts', 'app-full-third-party-source-manifest.json'),
    );
    const shellRoot = path.join(root, 'shell');
    fs.mkdirSync(shellRoot, { recursive: true });
    fs.writeFileSync(
      path.join(shellRoot, 'bun.lock'),
      '{\n  "lockfileVersion": 3,\n}\n',
    );
    const manifestPath = path.join(
      root,
      'contracts',
      'app-full-third-party-source-manifest.json',
    );
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf8'),
    ) as Record<string, any>;
    manifest.toolchain.bun.version = '1.3.14';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    assert.match(
      collectBunToolchainCompatibilityViolations(root, shellRoot).join('\n'),
      /requires Bun 1\.4\.0 or newer, got 1\.3\.14/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release boundary rejects a WebUI Dockerfile Bun version older than the active Shell lockfile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bun-dockerfile-'));
  try {
    fs.cpSync(path.join(appRoot, '.github'), path.join(root, '.github'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
    fs.copyFileSync(
      path.join(appRoot, 'contracts', 'app-full-third-party-source-manifest.json'),
      path.join(root, 'contracts', 'app-full-third-party-source-manifest.json'),
    );
    const shellRoot = path.join(root, 'shell');
    fs.mkdirSync(shellRoot, { recursive: true });
    fs.writeFileSync(path.join(shellRoot, 'bun.lock'), '{\n  "lockfileVersion": 3,\n}\n');
    fs.writeFileSync(path.join(shellRoot, 'Dockerfile'), 'ARG OPL_WEBUI_BUN_VERSION=1.3.14\n');

    assert.match(
      collectBunToolchainCompatibilityViolations(root, shellRoot).join('\n'),
      /webui-dockerfile Bun version 1\.3\.14 must equal 1\.4\.0/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
