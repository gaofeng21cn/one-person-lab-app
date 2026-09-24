import { appRoot, assert, fs, os, path, test, writeExecutable } from './helpers.ts';

import {
  FullPrecompressionGateError,
  runFullPackagePrecompressionGate,
} from '../../../scripts/build-full-first-install-package/precompression.ts';

import { resolveFullCarrierProfile } from '../../../scripts/build-full-first-install-package/carrier-profile.ts';

const RUNTIME_RESOURCE_DIR = resolveFullCarrierProfile().runtimeResourceDir;
const MATCHING_SHA = '1'.repeat(40);
const OTHER_SHA = '2'.repeat(40);
const FORBIDDEN_FRAMEWORK_CODEX_PATHS = [
  'bin/codex',
  'bin/rg',
  'vendor/codex',
  '.runtime-cache/codex-cli',
];

function writeMachO(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from('cffaedfe', 'hex'));
  fs.chmodSync(filePath, 0o755);
}

function writePackagedManifest(
  appPath: string,
  resolvedRefs: Record<string, unknown>,
  declaredPrunedPaths = FORBIDDEN_FRAMEWORK_CODEX_PATHS.map((relativePath) => ({
    path: relativePath,
    expected: 'absent',
    present: false,
  })),
) {
  const manifestPath = path.join(
    appPath,
    'Contents',
    'Resources',
    RUNTIME_RESOURCE_DIR,
    'runtime',
    'current',
    'manifest',
    'full-package-manifest.json',
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    resolved_refs: resolvedRefs,
    runtime_assertions: {
      offline_required_payloads: [
        { path: 'node/bin/node', exists: true, executable: true },
      ],
      declared_pruned_paths: declaredPrunedPaths,
    },
    native_trust: { status: 'local_authorized_unsigned' },
  }, null, 2)}\n`, 'utf8');
}

function writeFakeOtool(binDir: string) {
  const fakeOtool = path.join(binDir, 'otool');
  writeExecutable(fakeOtool, `#!/bin/sh
set -eu
mode="$1"
test "$2" = "-m"
target="$3"
base="$(basename "$target")"
printf '%s:\n' "$target"
if [ "$mode" = "-D" ] && [ "$base" = "self-id.dylib" ]; then
  printf '%s\n' '/opt/homebrew/Cellar/example/1.0/lib/libself-id.dylib'
fi
if [ "$mode" = "-L" ]; then
  case "$base" in
    portable-python)
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '@executable_path/../Frameworks/libportable.dylib'
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '@loader_path/../lib/libpython3.12.dylib'
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '/usr/lib/libSystem.B.dylib'
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation'
      ;;
    self-id.dylib)
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '/opt/homebrew/Cellar/example/1.0/lib/libself-id.dylib'
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '@rpath/libportable.dylib'
      ;;
    bad-python)
      printf '\t%s (compatibility version 3.12.0, current version 3.12.0)\n' '/opt/homebrew/Cellar/python@3.12/3.12.11/Frameworks/Python.framework/Versions/3.12/Python'
      ;;
    bad-rpath)
      printf '\t%s (compatibility version 1.0.0, current version 1.0.0)\n' '@rpath/libbad.dylib'
      ;;
  esac
fi
if [ "$mode" = "-l" ]; then
  case "$base" in
    portable-python)
      printf '%s\n' 'Load command 0'
      printf '%s\n' '          cmd LC_RPATH'
      printf '%s\n' '      cmdsize 48'
      printf '%s\n' '         path @executable_path/../Frameworks (offset 12)'
      printf '%s\n' 'Load command 1'
      printf '%s\n' '          cmd LC_RPATH'
      printf '%s\n' '      cmdsize 40'
      printf '%s\n' '         path @loader_path/../lib (offset 12)'
      ;;
    bad-rpath)
      printf '%s\n' 'Load command 0'
      printf '%s\n' '          cmd LC_RPATH'
      printf '%s\n' '      cmdsize 80'
      printf '%s\n' '         path /opt/homebrew/Cellar/example/1.0/lib (offset 12)'
      ;;
  esac
fi
`);
  return fakeOtool;
}

function createFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-precompression-'));
  const appPath = path.join(tempRoot, 'One Person Lab.app');
  const binDir = path.join(tempRoot, 'bin');
  const reportPath = path.join(tempRoot, 'full-precompression-gate.json');
  const resolvedRefs = {
    opl_framework: {
      label: 'OPL Framework',
      requested_ref: MATCHING_SHA,
      resolved_commit: MATCHING_SHA,
    },
    mas: {
      label: 'MAS',
      requested_ref: 'main',
      resolved_commit: OTHER_SHA,
    },
  };
  writePackagedManifest(appPath, resolvedRefs);
  writeFakeOtool(binDir);
  return { tempRoot, appPath, binDir, reportPath, resolvedRefs };
}

test('Full builder runs the precompression gate before the expensive DMG stage', () => {
  const builder = fs.readFileSync(
    path.join(appRoot, 'scripts', 'build-full-first-install-package.ts'),
    'utf8',
  );
  const gateIndex = builder.indexOf('runFullPackagePrecompressionGate({');
  const compressionIndex = builder.indexOf('const packageCompressionStartedAt', gateIndex);
  const dmgIndex = builder.indexOf('createFullDmgFromVerifiedApp(', compressionIndex);

  assert.notEqual(gateIndex, -1);
  assert.ok(compressionIndex > gateIndex);
  assert.ok(dmgIndex > compressionIndex);
});

test('Full precompression gate accepts portable packaged Python load paths and ignores a dylib install ID', () => {
  const fixture = createFixture();
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binDir}${path.delimiter}${previousPath ?? ''}`;
  try {
    writeMachO(path.join(
      fixture.appPath,
      'Contents',
      'Resources',
      RUNTIME_RESOURCE_DIR,
      'runtime',
      'current',
      'python',
      'cpython-3.12-macos-aarch64-none',
      'bin',
      'portable-python',
    ));
    writeMachO(path.join(fixture.appPath, 'Contents', 'Frameworks', 'self-id.dylib'));

    const report = runFullPackagePrecompressionGate({
      builtAppPath: fixture.appPath,
      resolvedRefs: fixture.resolvedRefs,
      runtimeCurrentness: { status: 'passed' },
      reportPath: fixture.reportPath,
    });

    assert.equal(report.status, 'passed');
    assert.equal(report.rebuild_policy, 'proceed_to_dmg_compression');
    assert.equal(report.gates.resolved_ref_identity.full_sha_requested_ref_count, 1);
    assert.equal(report.gates.macho_portability.macho_file_count, 2);
    assert.equal(report.gates.macho_portability.rpath_count, 2);
    assert.equal(report.gates.macho_portability.ignored_install_id_count, 1);
    assert.deepEqual(report.issues, []);
    assert.equal(JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8')).status, 'passed');
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('Full precompression gate rejects a host LC_RPATH behind an @rpath dependency', () => {
  const fixture = createFixture();
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binDir}${path.delimiter}${previousPath ?? ''}`;
  try {
    writeMachO(path.join(fixture.appPath, 'Contents', 'Resources', RUNTIME_RESOURCE_DIR, 'bad-rpath'));

    assert.throws(
      () => runFullPackagePrecompressionGate({
        builtAppPath: fixture.appPath,
        resolvedRefs: fixture.resolvedRefs,
        runtimeCurrentness: { status: 'passed' },
        reportPath: fixture.reportPath,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullPrecompressionGateError);
        assert.equal(error.failureClass, 'runtime_source_invalid');
        assert.match(error.message, /homebrew_cellar_rpath/);
        return true;
      },
    );
    const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
    assert.equal(report.gates.macho_portability.rpath_count, 1);
    assert.equal(report.issues[0].rpath.includes('/opt/homebrew/Cellar/'), true);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('Full precompression gate rejects a Homebrew Cellar dependency before DMG compression', () => {
  const fixture = createFixture();
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binDir}${path.delimiter}${previousPath ?? ''}`;
  try {
    writeMachO(path.join(fixture.appPath, 'Contents', 'Resources', RUNTIME_RESOURCE_DIR, 'bad-python'));

    assert.throws(
      () => runFullPackagePrecompressionGate({
        builtAppPath: fixture.appPath,
        resolvedRefs: fixture.resolvedRefs,
        runtimeCurrentness: { status: 'passed' },
        reportPath: fixture.reportPath,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullPrecompressionGateError);
        assert.equal(error.failureClass, 'runtime_source_invalid');
        assert.match(error.message, /homebrew_cellar_dependency/);
        return true;
      },
    );
    const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.rebuild_policy, 'fix_runtime_source_then_rebuild');
    assert.equal(report.issues[0].dependency.includes('/opt/homebrew/Cellar/'), true);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('Full precompression gate rejects a frozen requested SHA that differs from packaged bytes', () => {
  const fixture = createFixture();
  try {
    const mismatchedRefs = {
      opl_framework: {
        label: 'OPL Framework',
        requested_ref: MATCHING_SHA,
        resolved_commit: OTHER_SHA,
      },
    };
    writePackagedManifest(fixture.appPath, mismatchedRefs);

    assert.throws(
      () => runFullPackagePrecompressionGate({
        builtAppPath: fixture.appPath,
        resolvedRefs: mismatchedRefs,
        runtimeCurrentness: { status: 'passed' },
        reportPath: fixture.reportPath,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullPrecompressionGateError);
        assert.equal(error.failureClass, 'runtime_source_invalid');
        assert.match(error.message, /requested_sha_mismatch/);
        return true;
      },
    );
    const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
    assert.equal(report.gates.resolved_ref_identity.status, 'failed');
    assert.equal(report.gates.macho_portability.macho_file_count, 0);
  } finally {
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('Full precompression gate rejects prepared-to-packaged ref drift and unexpected refs', () => {
  const fixture = createFixture();
  const preparedRefs = {
    mas: {
      label: 'MAS',
      requested_ref: 'main',
      resolved_commit: MATCHING_SHA,
    },
  };
  writePackagedManifest(fixture.appPath, {
    mas: {
      label: 'MAS',
      requested_ref: 'main',
      resolved_commit: OTHER_SHA,
    },
    stale_component: {
      label: 'Stale component',
      requested_ref: 'main',
      resolved_commit: OTHER_SHA,
    },
  });

  try {
    assert.throws(
      () => runFullPackagePrecompressionGate({
        builtAppPath: fixture.appPath,
        resolvedRefs: preparedRefs,
        runtimeCurrentness: { status: 'passed' },
        reportPath: fixture.reportPath,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullPrecompressionGateError);
        assert.equal(error.failureClass, 'artifact_invalid');
        assert.match(error.message, /packaged_resolved_ref_drift/);
        assert.match(error.message, /packaged_resolved_ref_unexpected/);
        return true;
      },
    );
    const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
    assert.equal(report.rebuild_policy, 'rebuild_artifact');
    assert.equal(report.gates.resolved_ref_identity.status, 'failed');
  } finally {
    fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('Full precompression gate rejects missing declarations or physical Framework Codex payloads', async (context) => {
  await context.test('manifest absence declaration is incomplete', () => {
    const fixture = createFixture();
    try {
      writePackagedManifest(fixture.appPath, fixture.resolvedRefs, []);
      assert.throws(
        () => runFullPackagePrecompressionGate({
          builtAppPath: fixture.appPath,
          resolvedRefs: fixture.resolvedRefs,
          runtimeCurrentness: { status: 'passed' },
          reportPath: fixture.reportPath,
        }),
        /framework_codex_absence_evidence_invalid/,
      );
      const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
      assert.deepEqual(
        report.issues
          .filter((issue) => issue.code === 'framework_codex_absence_evidence_invalid')
          .map((issue) => issue.relative_path),
        FORBIDDEN_FRAMEWORK_CODEX_PATHS,
      );
    } finally {
      fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  await context.test('built App contains forbidden paths', () => {
    const fixture = createFixture();
    try {
      const runtimeRoot = path.join(
        fixture.appPath,
        'Contents',
        'Resources',
        RUNTIME_RESOURCE_DIR,
        'runtime',
        'current',
      );
      for (const relativePath of FORBIDDEN_FRAMEWORK_CODEX_PATHS) {
        fs.mkdirSync(path.join(runtimeRoot, ...relativePath.split('/')), { recursive: true });
      }
      assert.throws(
        () => runFullPackagePrecompressionGate({
          builtAppPath: fixture.appPath,
          resolvedRefs: fixture.resolvedRefs,
          runtimeCurrentness: { status: 'passed' },
          reportPath: fixture.reportPath,
        }),
        /framework_codex_payload_present/,
      );
      const report = JSON.parse(fs.readFileSync(fixture.reportPath, 'utf8'));
      assert.deepEqual(
        report.issues
          .filter((issue) => issue.code === 'framework_codex_payload_present')
          .map((issue) => issue.relative_path),
        FORBIDDEN_FRAMEWORK_CODEX_PATHS,
      );
    } finally {
      fs.rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });
});
