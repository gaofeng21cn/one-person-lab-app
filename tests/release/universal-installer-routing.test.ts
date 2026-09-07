import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createAppComponentManifest } from '../../scripts/write-opl-app-component-manifest.ts';
import { generateFrozenUniversalInstaller } from '../../scripts/generate-frozen-universal-installer.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const installerPath = path.join(appRoot, 'install.sh');

function sha256(bytes: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeExecutable(filePath: string, source: string): void {
  fs.writeFileSync(filePath, source);
  fs.chmodSync(filePath, 0o755);
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function dockerAcquisitionFixture(root: string, universalInstaller?: Buffer) {
  const releaseDir = path.join(root, 'release');
  const bin = path.join(root, 'bin');
  const cacheDir = path.join(root, 'cache');
  const executed = path.join(root, 'executed.log');
  const version = '26.8.14';
  const tag = `v${version}`;
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });

  const assets = new Map<string, Buffer>();
  for (const [name, bytes] of [
    [`One-Person-Lab-${version}-mac-arm64.dmg`, 'dmg'],
    [`One-Person-Lab-${version}-mac-arm64.zip`, 'zip'],
    [`One-Person-Lab-${version}-mac-arm64.zip.blockmap`, 'blockmap'],
    ['latest-mac.yml', 'latest'],
    ['latest-arm64-mac.yml', 'latest-arm64'],
  ] as const) {
    assets.set(name, Buffer.from(bytes));
  }
  const trustedInstaller = Buffer.from(
    '#!/usr/bin/env bash\nprintf \'trusted:%s\\n\' "$*" >> "$OPL_FAKE_EXECUTED"\n',
  );
  assets.set('install-docker-webui.sh', trustedInstaller);
  if (universalInstaller) assets.set('opl-install.sh', universalInstaller);
  for (const [name, bytes] of assets) fs.writeFileSync(path.join(releaseDir, name), bytes);

  const releaseAssets = [...assets].map(([name, bytes]) => ({
    name,
    url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${name}`,
    digest: sha256(bytes),
    size: bytes.length,
    contentType: 'application/octet-stream',
  }));
  const componentManifest = createAppComponentManifest({
    version,
    updaterVersion: '26.8.1491',
    sourceCommit: 'a'.repeat(40),
    shellCommit: 'b'.repeat(40),
    frameworkCommit: 'c'.repeat(40),
    tag,
    releaseUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${tag}`,
    assets: releaseAssets,
    repo: 'gaofeng21cn/one-person-lab-app',
  });
  const manifestPath = path.join(releaseDir, 'opl-app-component-manifest.json');
  writeJson(manifestPath, componentManifest);
  const manifestBytes = fs.readFileSync(manifestPath);
  const allAssets = [
    ...releaseAssets,
    {
      name: 'opl-app-component-manifest.json',
      url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/opl-app-component-manifest.json`,
      digest: sha256(manifestBytes),
      size: manifestBytes.length,
      contentType: 'application/json',
    },
  ];
  const recordPath = path.join(releaseDir, 'github-release.json');
  const writeRecord = (dockerDigest = sha256(trustedInstaller), dockerSize = trustedInstaller.length) => {
    writeJson(recordPath, {
      tag_name: tag,
      draft: false,
      prerelease: false,
      assets: allAssets.map((asset) => ({
        name: asset.name,
        digest: asset.name === 'install-docker-webui.sh' ? dockerDigest : asset.digest,
        size: asset.name === 'install-docker-webui.sh' ? dockerSize : asset.size,
        browser_download_url: asset.url,
      })),
    });
  };
  writeRecord();

  writeExecutable(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
set -u
if [ "\${OPL_FAKE_CURL_OUTAGE:-0}" = 1 ]; then exit 22; fi
output=''
url=''
write_code=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift; output="$1" ;;
    -w) shift; write_code=1 ;;
    http://*|https://*) url="$1" ;;
  esac
  shift
done
case "$url" in
  https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/*)
    source="$OPL_FAKE_RELEASE_DIR/github-release.json"
    ;;
  https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/*)
    source="$OPL_FAKE_RELEASE_DIR/\${url##*/}"
    ;;
  *) exit 22 ;;
esac
/bin/cp "$source" "$output"
if [ "$write_code" = 1 ]; then printf '200'; fi
`,
  );
  writeExecutable(
    path.join(bin, 'uname'),
    '#!/usr/bin/env sh\ncase "${1:-}" in -s) printf \'Linux\\n\' ;; -m) printf \'x86_64\\n\' ;; esac\n',
  );

  const run = (
    extraEnv: NodeJS.ProcessEnv = {},
    args = ['--container-webui', '--release-tag', tag, '--yes', '--no-open'],
    scriptPath = installerPath,
  ) => spawnSync('/bin/bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(root, 'home'),
      OPL_FAKE_EXECUTED: executed,
      OPL_FAKE_RELEASE_DIR: releaseDir,
      OPL_INSTALLER_CACHE_DIR: cacheDir,
      PATH: `${bin}:/usr/bin:/bin`,
      ...extraEnv,
    },
  });
  return { cacheDir, executed, releaseDir, run, trustedInstaller, writeRecord };
}

function route(osName: string, architecture: string, args: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-route-'));
  try {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    const uname = path.join(bin, 'uname');
    fs.writeFileSync(uname, `#!/usr/bin/env sh\ncase "\${1:-}" in\n  -s) printf '%s\\n' '${osName}' ;;\n  -m) printf '%s\\n' '${architecture}' ;;\nesac\n`);
    fs.chmodSync(uname, 0o755);
    return spawnSync('/bin/bash', [installerPath, '--print-install-route', ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function directStableMacInstall(osName: string, architecture: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-direct-macos-install-'));
  try {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    writeExecutable(
      path.join(bin, 'uname'),
      `#!/usr/bin/env sh\ncase "\${1:-}" in\n  -s) printf '%s\\n' '${osName}' ;;\n  -m) printf '%s\\n' '${architecture}' ;;\nesac\n`,
    );
    return spawnSync('/bin/bash', [installerPath, '--stable-macos-install', '--yes', '--no-open'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function linuxDesktopExecutableResolver() {
  const source = fs.readFileSync(installerPath, 'utf8');
  const start = source.indexOf('find_linux_desktop_executable() {');
  const endMarker = '\n}\n\ninstall_linux_desktop() {';
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'installer is missing the Linux executable resolver');
  assert.notEqual(end, -1, 'installer Linux executable resolver has no bounded function end');
  return source.slice(start, end + 2);
}

test('personal hosts install one platform Desktop payload by default', () => {
  assert.equal(route('Darwin', 'arm64').stdout.trim(), 'desktop');
  assert.equal(route('Linux', 'x86_64').stdout.trim(), 'linux-desktop');
});

test('explicit Desktop density reaches the platform carrier and unsupported Linux Full fails closed', () => {
  assert.equal(route('Darwin', 'arm64', ['--standard']).stdout.trim(), 'desktop-standard');
  assert.equal(route('Darwin', 'arm64', ['--full']).stdout.trim(), 'desktop-full');
  assert.equal(route('Linux', 'x86_64', ['--standard']).stdout.trim(), 'linux-desktop-standard');

  const linuxFull = route('Linux', 'x86_64', ['--full']);
  assert.notEqual(linuxFull.status, 0);
  assert.equal(linuxFull.stdout, '');
  assert.match(
    linuxFull.stderr,
    /Full Desktop density is not published for Linux x86_64; use --standard/,
  );
});

test('WebUI mode reuses packaged Desktop bytes and retired Native forms fail closed', () => {
  const webui = route('Linux', 'x86_64', ['--webui']);
  assert.equal(webui.status, 0, webui.stderr);
  assert.equal(webui.stdout.trim(), 'linux-desktop-webui');
  for (const args of [
    ['--native-webui'],
    ['--runtime-form', 'native'],
    ['--runtime-form=native-webui'],
    ['--runtime-form=native_webui'],
  ]) {
    const result = route('Linux', 'x86_64', args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unsupported (?:option|runtime form):/);
  }
});

test('server, isolated, headless, and Windows routes stay distinct from the Desktop carrier', () => {
  assert.equal(route('Linux', 'x86_64', ['--server']).stdout.trim(), 'container-webui');
  assert.equal(route('Linux', 'x86_64', ['--isolated']).stdout.trim(), 'container-webui');
  assert.equal(route('Linux', 'x86_64', ['--headless']).stdout.trim(), 'headless');
  assert.equal(route('MINGW64_NT-10.0', 'x86_64').stdout.trim(), 'container-webui');
});

test('unsupported Desktop architecture fails closed before any release asset lookup', () => {
  const result = route('Linux', 'aarch64');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /supported only on macOS arm64 and Linux x86_64/);

  const intelMac = route('Darwin', 'x86_64');
  assert.notEqual(intelMac.status, 0);
  assert.match(intelMac.stderr, /supported only on macOS arm64 and Linux x86_64/);
});

test('direct Stable macOS helper rejects Intel before release asset lookup', () => {
  const result = directStableMacInstall('Darwin', 'x86_64');
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /supported only on macOS arm64/);
  assert.doesNotMatch(result.stderr, /curl|download|release/i);
});

test('Linux Desktop resolves its package from the same exact Release tag', () => {
  const source = fs.readFileSync(installerPath, 'utf8');
  assert.match(source, /resolve_release_asset "\$record_path" "\$asset_name"/);
  assert.match(source, /releases\/download\/\$tag\/\$asset_name/);
  assert.match(source, /Linux Desktop asset URL is not bound to the selected Desktop Release/);
  assert.doesNotMatch(source, /resolve_linux_adjunct_release_record|v\*-optional-\*|opl-optional-platforms-manifest\.json/);
});

test('Linux executable discovery consumes a large package listing before returning the first match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-linux-executable-resolver-'));
  try {
    const bin = path.join(root, 'bin');
    const sortEofMarker = path.join(root, 'sort-consumed-eof');
    fs.mkdirSync(bin);
    writeExecutable(
      path.join(bin, 'dpkg'),
      `#!/usr/bin/env bash
printf '%s\\n' '/opt/One Person Lab/One Person Lab'
for ((i = 0; i < 2048; i += 1)); do
  printf '/zzzz/%0200d-entry-%06d\\n' 0 "$i"
done
`,
    );
    writeExecutable(
      path.join(bin, 'sort'),
      `#!/usr/bin/env bash
/bin/cat
status=$?
if [ "$status" -eq 0 ]; then
  : > "$OPL_SORT_EOF_MARKER"
fi
exit "$status"
`,
    );

    const result = spawnSync(
      '/bin/bash',
      ['-c', `set -euo pipefail\n${linuxDesktopExecutableResolver()}\nfind_linux_desktop_executable opl-test`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          OPL_SORT_EOF_MARKER: sortEofMarker,
          PATH: `${bin}:/usr/bin:/bin`,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), '/opt/One Person Lab/One Person Lab');
    assert.equal(fs.existsSync(sortEofMarker), true, 'resolver returned before consuming the sorted package list');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the universal installer has no Native tarball discovery or verifier fallback', () => {
  const source = fs.readFileSync(installerPath, 'utf8');
  assert.match(source, /One-Person-Lab-\$\{version\}-linux-x64\.deb/);
  assert.doesNotMatch(source, /resolve_linux_adjunct_release_record|opl-optional-platforms-manifest\.json/);
  assert.match(source, /desktop_release_asset_selection_requested/);
  assert.match(source, /validate_install_density_for_route "\$SELECTED_INSTALL_ROUTE"/);
  assert.match(source, /if desktop_release_asset_selection_requested; then\s+stable_macos_install/);
  assert.doesNotMatch(source, /OPL_NATIVE_WEBUI_|install-web\.sh|native-webui-qualified/);
});

test('macOS Full resolves from the exact Standard tag and binds its unified attestation', () => {
  const source = fs.readFileSync(installerPath, 'utf8');
  assert.match(source, /asset_name=\$\(release_asset_name "\$tag" full\)/);
  assert.match(source, /releases\/download\/\$tag\/\$asset_name/);
  assert.match(source, /carrier_context\.standard_attestation\.sha256/);
  assert.match(source, /Full public manifest does not bind the exact Full DMG digest and size/);
  assert.match(source, /Full DMG identity changed while validating its same-tag public manifest/);
  assert.match(source, /No same-tag Full module is published/);
  assert.match(source, /continuing with the Standard DMG/);
  assert.doesNotMatch(source, /resolve_full_adjunct_release_record/);
  assert.doesNotMatch(source, /resolve_linux_adjunct_release_record/);
});

test('Container WebUI acquires and executes only the exact Release-bound installer asset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-docker-acquisition-'));
  try {
    const fixture = dockerAcquisitionFixture(root);
    const result = fixture.run({}, ['--container-webui', '--release-tag', 'v26.8.14', '--yes', '--no-open', '--update']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8').trim(), 'trusted:--update --yes --no-open');
    const identity = JSON.parse(fs.readFileSync(
      path.join(fixture.cacheDir, 'install-docker-webui.identity.json'),
      'utf8',
    ));
    assert.equal(identity.release_tag, 'v26.8.14');
    assert.equal(identity.asset.sha256, sha256(fixture.trustedInstaller).slice('sha256:'.length));
    assert.equal(identity.asset.size_bytes, fixture.trustedInstaller.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('frozen Desktop installer leaves Docker image selection to its independent carrier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-docker-route-'));
  try {
    const outputPath = path.join(root, 'opl-install.sh');
    writeExecutable(outputPath, generateFrozenUniversalInstaller({
      sourcePath: installerPath,
      outputPath,
      version: '26.8.14',
      appSha: 'a'.repeat(40),
      shellSha: 'b'.repeat(40),
      frameworkSha: 'c'.repeat(40),
    }));
    const fixture = dockerAcquisitionFixture(root, fs.readFileSync(outputPath));
    const args = ['--container-webui', '--yes', '--no-open'];
    const defaultImage = fixture.run({ OPL_CONTAINER_WEBUI_TAG: '' }, args, outputPath);
    assert.equal(defaultImage.status, 0, defaultImage.stderr || defaultImage.stdout);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8').trim(), 'trusted:--yes --no-open');
    fs.writeFileSync(fixture.executed, '');
    const explicitImage = fixture.run({ OPL_CONTAINER_WEBUI_TAG: 'independent-docker-version' }, args, outputPath);
    assert.equal(explicitImage.status, 0, explicitImage.stderr || explicitImage.stdout);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8').trim(), 'trusted:--tag independent-docker-version --yes --no-open');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Container WebUI reuses verified cache through metadata outage without unverified fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-docker-cache-outage-'));
  try {
    const fixture = dockerAcquisitionFixture(root);
    assert.equal(fixture.run().status, 0);
    fs.writeFileSync(fixture.executed, '');
    const outage = fixture.run({ OPL_FAKE_CURL_OUTAGE: '1' });
    assert.equal(outage.status, 0, outage.stderr || outage.stdout);
    assert.match(outage.stderr, /Using previously verified Docker\/WebUI installer cache from v26\.8\.14/);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8').trim(), 'trusted:--yes --no-open');
    assert.doesNotMatch(`${outage.stdout}\n${outage.stderr}`, /raw\.githubusercontent|\/main\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Container WebUI rejects mismatched new bytes and preserves the prior verified cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-docker-mismatch-cache-'));
  try {
    const fixture = dockerAcquisitionFixture(root);
    assert.equal(fixture.run().status, 0);
    const cachedBefore = fs.readFileSync(path.join(fixture.cacheDir, 'install-docker-webui.sh'));
    fs.writeFileSync(path.join(fixture.releaseDir, 'install-docker-webui.sh'), '#!/usr/bin/env bash\nprintf \'malicious\\n\' >> "$OPL_FAKE_EXECUTED"\n');
    fs.writeFileSync(fixture.executed, '');
    const mismatch = fixture.run();
    assert.equal(mismatch.status, 0, mismatch.stderr || mismatch.stdout);
    assert.match(mismatch.stderr, /Docker\/WebUI installer (?:SHA256|size) mismatch/);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8').trim(), 'trusted:--yes --no-open');
    assert.deepEqual(fs.readFileSync(path.join(fixture.cacheDir, 'install-docker-webui.sh')), cachedBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Container WebUI refuses a modified cache when the release metadata is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-docker-tampered-cache-'));
  try {
    const fixture = dockerAcquisitionFixture(root);
    assert.equal(fixture.run().status, 0);
    fs.writeFileSync(path.join(fixture.cacheDir, 'install-docker-webui.sh'), 'modified');
    fs.writeFileSync(fixture.executed, '');
    const result = fixture.run({ OPL_FAKE_CURL_OUTAGE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No valid verified Docker\/WebUI installer cache is available/);
    assert.equal(fs.readFileSync(fixture.executed, 'utf8'), '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
