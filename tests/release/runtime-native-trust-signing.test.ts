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
    printf '%s\\n' 'Identifier=io.onepersonlab.officecli' 'Format=Mach-O thin (arm64)' 'CodeDirectory v=20500 size=763 flags=0x10000(runtime) hashes=13+7 location=embedded' 'Signature size=8997' 'Authority=Developer ID Application: Example (TEAMID1234)' 'Authority=Developer ID Certification Authority' 'Authority=Apple Root CA' 'Timestamp=Aug 25, 2026 at 21:00:00' 'TeamIdentifier=TEAMID1234' 'Runtime Version=26.0.0' >&2
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

test('Full runtime signing includes Framework esbuild executables', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-esbuild-runtime-'));
  try {
    for (const relativePath of [
      'opl/node_modules/esbuild/bin/esbuild',
      'opl/node_modules/@esbuild/darwin-arm64/bin/esbuild',
    ]) {
      writeExecutable(path.join(runtimeRoot, relativePath), '#!/bin/sh\n');
    }
    assert.deepEqual(
      listFullRuntimeNativeExecutables(runtimeRoot).map((entry) => entry.relative_path),
      [
        'runtime/current/opl/node_modules/@esbuild/darwin-arm64/bin/esbuild',
        'runtime/current/opl/node_modules/esbuild/bin/esbuild',
      ],
    );
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('Full runtime signing skips the esbuild Node launcher and retains native candidates', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-esbuild-launcher-'));
  const npmPath = path.join(runtimeRoot, 'opl/node_modules/esbuild/bin/esbuild');
  const platformPath = path.join(runtimeRoot, 'opl/node_modules/@esbuild/darwin-arm64/bin/esbuild');
  try {
    writeExecutable(npmPath, '#!/usr/bin/env node\nrequire("../lib/main")\n');
    writeExecutable(platformPath, Buffer.from('cffaedfe00000000', 'hex'));
    assert.deepEqual(
      listFullRuntimeNativeExecutables(runtimeRoot).map((entry) => entry.relative_path),
      ['runtime/current/opl/node_modules/@esbuild/darwin-arm64/bin/esbuild'],
    );
    writeExecutable(npmPath, Buffer.from('cffaedfe00000000', 'hex'));
    assert.equal(listFullRuntimeNativeExecutables(runtimeRoot).length, 2);
    writeExecutable(npmPath, '#!/usr/bin/env python\n');
    assert.equal(listFullRuntimeNativeExecutables(runtimeRoot).length, 2);
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
