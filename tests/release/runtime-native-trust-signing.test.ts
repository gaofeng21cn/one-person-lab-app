import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assertFullRuntimeNativeTrustObject } from '../../scripts/full-runtime-native-trust.ts';
import {
  isDeveloperIdApplicationSignature,
  parseMacosCodeSignatureOutput,
} from '../../scripts/macos-code-signature.ts';
import {
  assertSignedRuntimeExecutableSmoke,
  listFullRuntimeNativeExecutables,
  macosRuntimeCodesignArgs,
  signEmbeddedTemporalCliArchive,
  signedRuntimeExecutableSmokeArgs,
} from '../../scripts/build-full-first-install-package/runtime-native-trust.ts';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result;
}

function writeExecutable(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function withFakeCodesign(callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-fake-codesign-'));
  const logPath = path.join(tempRoot, 'codesign.log');
  const originalPath = process.env.PATH;
  const originalLog = process.env.OPL_TEST_CODESIGN_LOG;
  writeExecutable(path.join(tempRoot, 'codesign'), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$OPL_TEST_CODESIGN_LOG"
case " $* " in
  *" -dv "*)
    printf '%s\\n' 'Identifier=io.onepersonlab.temporal' 'Format=Mach-O thin (arm64)' 'CodeDirectory v=20500 size=763 flags=0x10000(runtime) hashes=13+7 location=embedded' 'Signature size=8997' 'Authority=Developer ID Application: Example (TEAMID1234)' 'Authority=Developer ID Certification Authority' 'Authority=Apple Root CA' 'Timestamp=Aug 25, 2026 at 21:00:00' 'TeamIdentifier=TEAMID1234' 'Runtime Version=26.0.0' >&2
    ;;
esac
`);
  process.env.PATH = `${tempRoot}:${originalPath || ''}`;
  process.env.OPL_TEST_CODESIGN_LOG = logPath;
  try {
    return callback({ tempRoot, logPath });
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalLog === undefined) delete process.env.OPL_TEST_CODESIGN_LOG;
    else process.env.OPL_TEST_CODESIGN_LOG = originalLog;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createTemporalArchive(runtimeRoot, relativeExecutables = ['temporal']) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-source-'));
  const archivePath = path.join(
    runtimeRoot,
    'vendor',
    'temporal',
    'temporal_cli_darwin_arm64.tar.gz',
  );
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  try {
    for (const relativePath of relativeExecutables) {
      writeExecutable(path.join(sourceRoot, relativePath), '#!/bin/sh\necho temporal version 1.5.1\n');
    }
    run('tar', ['-czf', archivePath, '-C', sourceRoot, '.']);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
  return archivePath;
}

test('Full runtime re-signing preserves existing executable metadata', () => {
  assert.deepEqual(
    macosRuntimeCodesignArgs('/tmp/officecli', 'Developer ID Application: Example (TEAMID1234)'),
    [
      '--force',
      '--preserve-metadata=identifier,entitlements,flags,runtime',
      '--options',
      'runtime',
      '--timestamp',
      '--sign',
      'Developer ID Application: Example (TEAMID1234)',
      '/tmp/officecli',
    ],
  );
});

test('Full runtime signing includes dereferenced Python launcher aliases', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-python-runtime-'));
  try {
    const binRoot = path.join(runtimeRoot, 'python', 'cpython-3.12.12-macos-aarch64-none', 'bin');
    for (const name of ['python', 'python3', 'python3.12']) {
      writeExecutable(path.join(binRoot, name), '#!/bin/sh\n');
    }
    assert.deepEqual(
      listFullRuntimeNativeExecutables(runtimeRoot).map((entry) => entry.relative_path),
      [
        'runtime/current/python/cpython-3.12.12-macos-aarch64-none/bin/python',
        'runtime/current/python/cpython-3.12.12-macos-aarch64-none/bin/python3',
        'runtime/current/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12',
      ],
    );
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('Developer ID codesign metadata uses the leaf Authority when Signature= is absent', () => {
  const details = parseMacosCodeSignatureOutput([
    'Executable=/tmp/officecli',
    'Signature size=8997',
    'Authority=Developer ID Application: Example (TEAMID1234)',
    'Authority=Developer ID Certification Authority',
    'Authority=Apple Root CA',
    'TeamIdentifier=TEAMID1234',
  ].join('\n'));

  assert.equal(details.signature, 'Developer ID Application: Example (TEAMID1234)');
  assert.equal(details.signature_kind, 'developer_id_application');
  assert.equal(details.team_identifier, 'TEAMID1234');
  assert.deepEqual(details.authorities, [
    'Developer ID Application: Example (TEAMID1234)',
    'Developer ID Certification Authority',
    'Apple Root CA',
  ]);
  assert.equal(isDeveloperIdApplicationSignature(details, 'TEAMID1234'), true);
});

test('native trust rejects ad hoc and missing signature metadata', () => {
  const adHoc = parseMacosCodeSignatureOutput('Signature=adhoc\nTeamIdentifier=not set\n');
  const missing = parseMacosCodeSignatureOutput('TeamIdentifier=TEAMID1234\n');
  assert.equal(adHoc.signature_kind, 'adhoc');
  assert.equal(isDeveloperIdApplicationSignature(adHoc), false);
  assert.equal(missing.signature_kind, 'missing');
  assert.equal(isDeveloperIdApplicationSignature(missing, 'TEAMID1234'), false);

  assert.throws(
    () => assertFullRuntimeNativeTrustObject(
      {
        schema: 'opl_full_runtime_native_trust.v1',
        status: 'passed',
        executable_count: 1,
        executables: [{
          relative_path: 'runtime/current/node/bin/node',
          codesign_status: 'passed',
          spctl_status: 'not_required',
          quarantine_status: 'absent',
          team_identifier: 'TEAMID1234',
          signature: null,
          signature_kind: 'missing',
          trusted_timestamp: false,
          hardened_runtime: false,
        }],
      },
      {},
      { requireProductionTrust: true, expectedTeamIdentifier: 'TEAMID1234' },
    ),
    /does not match Team ID TEAMID1234/,
  );
});

test('production native trust rejects Developer ID code without timestamp or hardened runtime', () => {
  assert.throws(
    () => assertFullRuntimeNativeTrustObject(
      {
        schema: 'opl_full_runtime_native_trust.v1',
        status: 'passed',
        executable_count: 1,
        executables: [{
          relative_path: 'runtime/current/node/bin/node',
          codesign_status: 'passed',
          spctl_status: 'not_required',
          quarantine_status: 'absent',
          team_identifier: 'TEAMID1234',
          signature: 'Developer ID Application: Example (TEAMID1234)',
          signature_kind: 'developer_id_application',
          trusted_timestamp: false,
          hardened_runtime: false,
        }],
      },
      {},
      { requireProductionTrust: true, expectedTeamIdentifier: 'TEAMID1234' },
    ),
    /does not match Team ID TEAMID1234/,
  );
});

test('Full runtime re-signing runs the OfficeCLI version smoke', () => {
  assert.deepEqual(signedRuntimeExecutableSmokeArgs('runtime/current/bin/officecli'), ['--version']);
  const output = assertSignedRuntimeExecutableSmoke(
    '/tmp/officecli',
    'runtime/current/bin/officecli',
    (command, args) => {
      assert.equal(command, '/tmp/officecli');
      assert.deepEqual(args, ['--version']);
      return { status: 0, stdout: '1.0.139\n', stderr: '' };
    },
  );
  assert.equal(output, '1.0.139');
});

test('Full runtime re-signing fails closed when the OfficeCLI version smoke crashes', () => {
  assert.throws(
    () => assertSignedRuntimeExecutableSmoke(
      '/tmp/officecli',
      'runtime/current/bin/officecli',
      () => ({
        status: 137,
        signal: null,
        stdout: '',
        stderr: 'Failed to create CoreCLR, HRESULT: 0x80070008',
      }),
    ),
    /exit_status=137[\s\S]*Failed to create CoreCLR/,
  );
});

test('Full runtime re-signing does not execute an undeclared binary smoke', () => {
  let invoked = false;
  const result = assertSignedRuntimeExecutableSmoke(
    '/tmp/codex',
    'runtime/current/bin/codex',
    () => {
      invoked = true;
      return { status: 0, stdout: 'codex-cli 1.0.0\n', stderr: '' };
    },
  );
  assert.equal(result, null);
  assert.equal(invoked, false);
});

test('Full runtime re-signing transforms and verifies the embedded Temporal executable', () => {
  withFakeCodesign(({ logPath }) => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-runtime-'));
    const extractedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-readback-'));
    try {
      const archivePath = createTemporalArchive(runtimeRoot);
      const result = signEmbeddedTemporalCliArchive(
        runtimeRoot,
        'Developer ID Application: Example (TEAMID1234)',
      );

      assert.equal(
        result.relative_path,
        'runtime/current/vendor/temporal/temporal_cli_darwin_arm64.tar.gz/temporal',
      );
      assert.equal(result.codesign_status, 'passed');
      assert.equal(result.spctl_status, 'deferred_until_notarized_app');
      assert.equal(result.team_identifier, 'TEAMID1234');
      assert.equal(result.signature, 'Developer ID Application: Example (TEAMID1234)');
      assert.equal(result.signature_kind, 'developer_id_application');
      run('tar', ['-xzf', archivePath, '-C', extractedRoot]);
      assert.equal(fs.statSync(path.join(extractedRoot, 'temporal')).mode & 0o111, 0o111);
      assert.match(
        fs.readFileSync(logPath, 'utf8'),
        /--force --preserve-metadata=identifier,entitlements,flags,runtime --options runtime --timestamp --sign Developer ID Application: Example \(TEAMID1234\)/,
      );
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
      fs.rmSync(extractedRoot, { recursive: true, force: true });
    }
  });
});

test('Full runtime re-signing leaves the original Temporal archive intact when identity is ambiguous', () => {
  withFakeCodesign(() => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-runtime-'));
    try {
      const archivePath = createTemporalArchive(runtimeRoot, ['one/temporal', 'two/temporal']);
      const original = fs.readFileSync(archivePath);
      assert.throws(
        () => signEmbeddedTemporalCliArchive(
          runtimeRoot,
          'Developer ID Application: Example (TEAMID1234)',
        ),
        /must contain exactly one executable temporal binary; found 2/,
      );
      assert.deepEqual(fs.readFileSync(archivePath), original);
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });
});
