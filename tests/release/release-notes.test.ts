import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { appRoot } from './release-readiness/helpers.ts';
import {
  stableInstallCommand,
  validStandardAiReleaseNotes,
} from './app-release-boundary-cases/release-notes-fixtures.ts';
import {
  completeAiReleaseNotesWithEvidence,
  publicMarkdownBeforeTechnicalDetails,
} from '../../scripts/release-notes-ai-writer-parts/markdown-normalization.ts';
import { extractOpenAICompatibleText } from '../../scripts/release-notes-ai-writer-parts/provider-transport.ts';
import { validateAiReleaseNotes } from '../../scripts/release-notes-ai-writer-parts/validation.ts';

function runNode(args, options = {}) {
  return spawnSync(process.execPath, ['--experimental-strip-types', ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

const canonicalFrameworkRemote = 'https://github.com/gaofeng21cn/one-person-lab.git';

function jsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Ref(filePath: string) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function gitFixture(root: string, name: string, setup: (directory: string) => void) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  setup(directory);
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'fixture@example.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', '.'],
    ['commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return {
    root: directory,
    ref: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).stdout.trim(),
  };
}

function commitFixtureChange(root: string, message: string) {
  for (const args of [
    ['add', '-A'],
    ['commit', '-qm', message],
  ]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
}

function runFixtureGit(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function configureCanonicalFrameworkRemote(fixtureRoot: string, framework: { root: string; ref: string }) {
  runFixtureGit(framework.root, ['branch', '-M', 'main']);
  const remoteRoot = path.join(fixtureRoot, 'framework-origin.git');
  const clone = spawnSync('git', ['clone', '-q', '--bare', framework.root, remoteRoot], { encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  runFixtureGit(framework.root, ['remote', 'add', 'origin', canonicalFrameworkRemote]);
  runFixtureGit(framework.root, [
    'config',
    `url.${pathToFileURL(remoteRoot).href}.insteadOf`,
    canonicalFrameworkRemote,
  ]);
}

function advanceCanonicalFrameworkRemote(framework: { root: string; ref: string }) {
  const tree = runFixtureGit(framework.root, ['rev-parse', 'HEAD^{tree}']);
  const remoteCommit = runFixtureGit(framework.root, [
    'commit-tree', tree, '-p', framework.ref, '-m', 'remote advance',
  ]);
  runFixtureGit(framework.root, ['push', 'origin', `${remoteCommit}:refs/heads/main`]);
}

function fullPayloadAuthorityFixture(options: { nestedFramework?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-notes-full-authority-'));
  const codexVersion = '0.144.6';
  const staleAppCodexProjection = '0.144.5';
  const nodeVersion = '24.11.0';
  const claudeVersion = '2.1.215';
  const officeRef = 'a'.repeat(40);
  const mineruRef = 'b'.repeat(40);
  const app = gitFixture(root, 'app', (directory) => {
    jsonFile(path.join(directory, 'contracts', 'app-full-third-party-source-manifest.json'), {
      schema: 'opl_app_full_third_party_source_manifest.v1',
      sources: {
        officecli: { repository: 'iOfficeAI/OfficeCLI', ref: officeRef, release_tag: 'v1.2.3' },
        mineru: { repository: 'opendatalab/MinerU-Ecosystem', ref: mineruRef },
      },
      runtime_payloads: {
        codex_cli: {
          version: staleAppCodexProjection,
          qualification_input_ref: 'contracts/missing-qualification-input.json#runtime_payloads.codex_cli',
        },
        officecli: { version: '1.2.3' },
      },
    });
    const qualificationHarnessPath = path.join(directory, 'scripts', 'validate-webui-runtime-image.ts');
    fs.mkdirSync(path.dirname(qualificationHarnessPath), { recursive: true });
    fs.writeFileSync(qualificationHarnessPath, 'export const fixtureHarness = true;\n');
  });
  const shell = gitFixture(root, 'shell', (directory) => {
    jsonFile(path.join(directory, 'package.json'), { aioncoreVersion: 'v0.1.49' });
    fs.writeFileSync(path.join(directory, 'Dockerfile'), 'FROM node:22-bookworm-slim\n');
    jsonFile(path.join(directory, 'contracts', 'aionui-upstream-intake.json'), {
      managed_runtime: { codex_cli: { package: '@openai/codex', version: codexVersion } },
    });
    const runtimeKey = 'darwin-arm64';
    const runtimeRoot = path.join(directory, 'resources', 'bundled-aioncore', runtimeKey);
    const managedRoot = path.join(runtimeRoot, 'managed-resources');
    const nodeRootRelative = `node/node-v${nodeVersion}-${runtimeKey}`;
    const nodeRoot = path.join(managedRoot, nodeRootRelative);
    const nodeExecutableRelative = 'bin/node';
    const nodeExecutable = path.join(nodeRoot, nodeExecutableRelative);
    const claudeRootRelative = `cli/claude/${claudeVersion}/${runtimeKey}`;
    const claudeRoot = path.join(managedRoot, claudeRootRelative);
    const claudeExecutableRelative = 'claude';
    const claudeExecutable = path.join(claudeRoot, claudeExecutableRelative);
    const codexRootRelative = `cli/codex/${codexVersion}/${runtimeKey}`;
    const codexRoot = path.join(managedRoot, codexRootRelative);
    const codexExecutableRelative = 'vendor/aarch64-apple-darwin/bin/codex';
    const codexExecutable = path.join(codexRoot, codexExecutableRelative);
    const codexRequiredFileRelative = 'vendor/aarch64-apple-darwin/codex-path/rg';
    const codexRequiredFile = path.join(codexRoot, codexRequiredFileRelative);
    const codexRequiredDirectoryRelative = 'vendor/aarch64-apple-darwin/codex-resources';
    const codexRequiredDirectory = path.join(codexRoot, codexRequiredDirectoryRelative);
    const codexRequiredDirectoryFile = path.join(codexRequiredDirectory, 'zsh', 'bin', 'zsh');
    jsonFile(path.join(runtimeRoot, 'manifest.json'), {
      platform: 'darwin',
      arch: 'arm64',
      version: 'v0.1.49',
      sourceType: 'download',
      source: {
        url: 'https://github.com/iOfficeAI/AionCore/releases/download/v0.1.49/aioncore-v0.1.49-aarch64-apple-darwin.tar.gz',
      },
    });
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'aioncore'), 'aioncore fixture\n');
    jsonFile(path.join(managedRoot, 'manifest.json'), {
      schemaVersion: 2,
      runtimeKey,
      node: {
        version: nodeVersion,
        root: nodeRootRelative,
        executable: nodeExecutableRelative,
      },
      clis: [{
        name: 'claude',
        version: claudeVersion,
        root: claudeRootRelative,
        platformDirectory: runtimeKey,
        executable: claudeExecutableRelative,
        requiredFiles: [],
        requiredDirectories: [],
      }, {
        name: 'codex',
        version: codexVersion,
        root: codexRootRelative,
        platformDirectory: runtimeKey,
        executable: codexExecutableRelative,
        requiredFiles: [codexRequiredFileRelative],
        requiredDirectories: [codexRequiredDirectoryRelative],
      }],
    });
    fs.mkdirSync(path.dirname(nodeExecutable), { recursive: true });
    fs.mkdirSync(path.dirname(claudeExecutable), { recursive: true });
    fs.mkdirSync(path.dirname(codexExecutable), { recursive: true });
    fs.mkdirSync(path.dirname(codexRequiredFile), { recursive: true });
    fs.mkdirSync(path.dirname(codexRequiredDirectoryFile), { recursive: true });
    fs.writeFileSync(nodeExecutable, 'node fixture\n');
    fs.writeFileSync(claudeExecutable, 'claude fixture\n');
    fs.writeFileSync(codexExecutable, 'codex fixture\n');
    fs.writeFileSync(codexRequiredFile, 'rg fixture\n');
    fs.writeFileSync(codexRequiredDirectoryFile, 'zsh fixture\n');
  });
  const framework = gitFixture(root, options.nestedFramework ? path.join('app', 'framework-source') : 'framework', (directory) => {
    fs.writeFileSync(path.join(directory, 'framework.txt'), 'framework fixture\n');
  });
  if (options.nestedFramework) configureCanonicalFrameworkRemote(root, framework);
  const baseImageIndexPath = path.join(root, 'base-image-index.json');
  jsonFile(baseImageIndexPath, {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [{
      digest: `sha256:${'c'.repeat(64)}`,
      size: 4321,
      platform: { os: 'linux', architecture: 'amd64' },
    }],
  });
  const codexPackageRoot = path.join(root, 'codex-package', 'package');
  fs.mkdirSync(codexPackageRoot, { recursive: true });
  jsonFile(path.join(codexPackageRoot, 'package.json'), {
    name: '@openai/codex',
    version: codexVersion,
  });
  const codexTarballPath = path.join(root, 'codex-cli.tgz');
  const packed = spawnSync('tar', ['-czf', codexTarballPath, 'package'], {
    cwd: path.dirname(codexPackageRoot),
    encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr);
  return {
    root,
    app,
    shell,
    framework,
    baseImageIndexPath,
    codexTarballPath,
    thirdPartyManifestPath: path.join(app.root, 'contracts', 'app-full-third-party-source-manifest.json'),
    codexRequiredFile: path.join(
      shell.root,
      'resources',
      'bundled-aioncore',
      'darwin-arm64',
      'managed-resources',
      'cli',
      'codex',
      codexVersion,
      'darwin-arm64',
      'vendor',
      'aarch64-apple-darwin',
      'codex-path',
      'rg',
    ),
    codexVersion,
    staleAppCodexProjection,
    nodeVersion,
    claudeVersion,
    officeRef,
    mineruRef,
  };
}

function fullPayloadAuthorityArgs(fixture: ReturnType<typeof fullPayloadAuthorityFixture>, output: string) {
  return [
    'scripts/prepare-release-notes-full-payload-authority.ts',
    '--app-root', fixture.app.root,
    '--app-ref', fixture.app.ref,
    '--shell-root', fixture.shell.root,
    '--shell-ref', fixture.shell.ref,
    '--framework-root', fixture.framework.root,
    '--framework-ref', fixture.framework.ref,
    '--third-party-source-manifest', fixture.thirdPartyManifestPath,
    '--output', output,
  ];
}

function standardEvidence(version = '26.9.1', overrides: any = {}) {
  const base = {
    schema: 'opl_app_release_notes_evidence.v1',
    version,
    channel: 'stable',
    release_title: `One Person Lab v${version}`,
    release_repo: 'gaofeng21cn/one-person-lab-app',
    current_tag: `v${version}`,
    previous_tag: 'v26.9.0',
    install_command: stableInstallCommand,
    full_changelog_url: `https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.9.0...v${version}`,
    grouped_changes: [{
      title: 'First launch and setup',
      bullets: ['First launch setup is clearer before users open built-in OPL sessions.'],
    }],
    payload: {
      include_full_package: false,
      lines: ['- Standard package: App-managed MAS, MAG, RCA, and OPL Meta Agent entry surface plus Codex plugin and skill sync policy.'],
      bundled_refs: [],
      updates_since_previous_stable: [],
    },
    agent_runtime_changes: [],
    family_repo_changes: [{
      label: 'One Person Lab App',
      repository: 'gaofeng21cn/one-person-lab-app',
      previous_ref: 'v26.9.0',
      current_ref: `v${version}`,
      compare_url: `https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.9.0...v${version}`,
      commit_count: 1,
      change_subjects: ['fix(first-run): clarify setup'],
    }],
  };
  return {
    ...base,
    ...overrides,
    payload: { ...base.payload, ...(overrides.payload ?? {}) },
  };
}

function writeSequencedOpenAiCompatibleCurl(binDir: string, requestLogPath: string, responses: string[]) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const payload = JSON.parse(args[args.indexOf('-d') + 1]);
const requestLogPath = ${JSON.stringify(requestLogPath)};
const requests = fs.existsSync(requestLogPath) ? JSON.parse(fs.readFileSync(requestLogPath, 'utf8')) : [];
requests.push(String(payload.messages?.[0]?.content || ''));
fs.writeFileSync(requestLogPath, JSON.stringify(requests));
const responses = ${JSON.stringify(responses)};
const content = responses[Math.min(requests.length - 1, responses.length - 1)];
process.stdout.write(JSON.stringify({ choices: [{ message: { content } }] }));
`, { mode: 0o755 });
}

function writeTransientOpenAiCompatibleCurl(
  binDir: string,
  attemptPath: string,
  failuresBeforeSuccess: number,
  successMarkdown: string,
) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const attemptPath = ${JSON.stringify(attemptPath)};
const attempt = fs.existsSync(attemptPath) ? Number(fs.readFileSync(attemptPath, 'utf8')) + 1 : 1;
fs.writeFileSync(attemptPath, String(attempt));
if (attempt <= ${failuresBeforeSuccess}) {
  process.stderr.write('curl: (28) Operation timed out with 0 bytes received\\n');
  process.exit(28);
}
process.stdout.write(JSON.stringify({ choices: [{ message: { content: ${JSON.stringify(successMarkdown)} } }] }));
`, { mode: 0o755 });
}

function runWithFakeOpenAiNotes(evidence: any, responses: string[]) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-openai-compatible-notes-repair-'));
  const binDir = path.join(tempRoot, 'bin');
  const requestLogPath = path.join(tempRoot, 'requests.json');
  const evidencePath = path.join(tempRoot, 'evidence.json');
  const outputPath = path.join(tempRoot, 'notes.md');
  writeSequencedOpenAiCompatibleCurl(binDir, requestLogPath, responses);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  const result = runNode([
    'scripts/release-notes-ai-writer.ts',
    '--evidence', evidencePath,
    '--output', outputPath,
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPL_RELEASE_NOTES_PROVIDER: 'auto',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3001/v1',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY: 'freellmapi-test',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL: 'auto',
    },
  });
  return {
    result,
    outputPath,
    requests: JSON.parse(fs.readFileSync(requestLogPath, 'utf8')),
  };
}

function writeOpenAiCompatibleCurlResponse(binDir: string, response: unknown) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'curl'), `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify(response))});
`, { mode: 0o755 });
}

test('OpenAI-compatible text extraction accepts typed Chat and Responses shapes only', () => {
  assert.equal(
    extractOpenAICompatibleText({ choices: [{ message: { content: 'chat text' } }] }),
    'chat text',
  );
  assert.equal(
    extractOpenAICompatibleText({
      choices: [{ message: { content: [{ type: 'text', text: 'part one' }, { type: 'output_text', text: 'part two' }] } }],
    }),
    'part one\npart two',
  );
  assert.equal(extractOpenAICompatibleText({ output_text: 'responses convenience text' }), 'responses convenience text');
  assert.equal(
    extractOpenAICompatibleText({
      object: 'response',
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'responses item text' }],
      }],
    }),
    'responses item text',
  );
  assert.equal(
    extractOpenAICompatibleText({ choices: [{ message: { content: null, reasoning_content: 'private reasoning' } }] }),
    null,
  );
  assert.equal(extractOpenAICompatibleText({ error: { message: 'provider failure' } }), null);
});

test('OpenAI-compatible provider probe accepts a Responses output message', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-openai-compatible-responses-probe-'));
  const binDir = path.join(tempRoot, 'bin');
  writeOpenAiCompatibleCurlResponse(binDir, {
    object: 'response',
    output: [{
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'OPL_RELEASE_NOTES_PROVIDER_OK' }],
    }],
  });

  const result = runNode([
    'scripts/release-notes-ai-writer.ts',
    '--probe-openai-compatible',
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3001/v1',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY: 'freellmapi-test',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL: 'responses-fixture',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'ok',
    provider: 'openai_compatible',
    model: 'responses-fixture',
    endpoint: '127.0.0.1:3001',
  });
});

test('AI release notes writer auto provider prefers the OpenAI-compatible online endpoint', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-openai-compatible-notes-'));
  const binDir = path.join(tempRoot, 'bin');
  const requestPath = path.join(tempRoot, 'request.json');
  const evidencePath = path.join(tempRoot, 'evidence.json');
  const outputPath = path.join(tempRoot, 'notes.md');
  const remoteMarker = '<!-- OPENAI_COMPATIBLE_REMOTE_FIXTURE -->';
  const aiMarkdown = validStandardAiReleaseNotes('26.9.1')
    .replace('## What improved', `${remoteMarker}\n\n## What improved`);

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const endpoint = args.find((arg) => /^https?:\\/\\//.test(arg));
const payload = JSON.parse(args[args.indexOf('-d') + 1]);
fs.writeFileSync(${JSON.stringify(requestPath)}, JSON.stringify({
  endpoint,
  model: payload.model,
  contentIncludesEvidence: String(payload.messages?.[0]?.content || '').includes('"release_evidence"'),
  hasBearer: args.includes('Authorization: Bearer freellmapi-test'),
}));
process.stdout.write(JSON.stringify({ choices: [{ message: { content: ${JSON.stringify(aiMarkdown)} } }] }));
`, { mode: 0o755 });
  fs.writeFileSync(evidencePath, `${JSON.stringify({
    schema: 'opl_app_release_notes_evidence.v1',
    version: '26.9.1',
    channel: 'stable',
    release_title: 'One Person Lab v26.9.1',
    release_repo: 'gaofeng21cn/one-person-lab-app',
    current_tag: 'v26.9.1',
    previous_tag: 'v26.9.0',
    install_command: stableInstallCommand,
    full_changelog_url: 'https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.9.0...v26.9.1',
    grouped_changes: [{
      title: 'First launch and setup',
      bullets: ['First launch setup is clearer before users open built-in OPL sessions.'],
    }],
    payload: {
      include_full_package: false,
      lines: ['- Standard package: App-managed MAS, MAG, RCA, and OPL Meta Agent entry surface plus Codex plugin and skill sync policy.'],
      bundled_refs: [],
      updates_since_previous_stable: [],
    },
    agent_runtime_changes: [],
    family_repo_changes: [{
      label: 'One Person Lab App',
      repository: 'gaofeng21cn/one-person-lab-app',
      previous_ref: 'v26.9.0',
      current_ref: 'v26.9.1',
      compare_url: 'https://github.com/gaofeng21cn/one-person-lab-app/compare/v26.9.0...v26.9.1',
      commit_count: 1,
      change_subjects: ['fix(first-run): clarify setup'],
    }],
  }, null, 2)}\n`);

  const result = runNode([
    'scripts/release-notes-ai-writer.ts',
    '--evidence',
    evidencePath,
    '--output',
    outputPath,
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPL_RELEASE_NOTES_PROVIDER: 'auto',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3001/v1',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY: 'freellmapi-test',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL: 'auto',
      GITHUB_TOKEN: 'github-models-legacy-token',
      GH_TOKEN: 'github-models-legacy-token',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(requestPath, 'utf8')), {
    endpoint: 'http://127.0.0.1:3001/v1/chat/completions',
    model: 'auto',
    contentIncludesEvidence: true,
    hasBearer: true,
  });
  const output = fs.readFileSync(outputPath, 'utf8');
  assert.match(output, /OPENAI_COMPATIBLE_REMOTE_FIXTURE/);
  assert.match(output, /<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->/);
});

test('online AI notes retries bounded transport timeouts in the same job and writes a passed receipt', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-openai-compatible-transport-retry-'));
  const binDir = path.join(tempRoot, 'bin');
  const attemptPath = path.join(tempRoot, 'attempt.txt');
  const evidencePath = path.join(tempRoot, 'evidence.json');
  const outputPath = path.join(tempRoot, 'notes.md');
  const receiptPath = path.join(tempRoot, 'notes-prepare-receipt.json');
  const evidence = standardEvidence('26.9.6');
  writeTransientOpenAiCompatibleCurl(binDir, attemptPath, 2, validStandardAiReleaseNotes('26.9.6'));
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const result = runNode([
    'scripts/release-notes-ai-writer.ts',
    '--evidence', evidencePath,
    '--output', outputPath,
    '--receipt-output', receiptPath,
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPL_RELEASE_NOTES_PROVIDER: 'openai_compatible',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3001/v1',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY: 'freellmapi-test',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL: 'auto',
      OPL_RELEASE_NOTES_AI_RETRY_DELAY_MS: '0',
      GITHUB_RUN_ID: '789',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(attemptPath, 'utf8'), '3');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.identity.workflow_run_id, '789');
  assert.equal(receipt.provider.max_transport_attempts_per_request, 3);
  assert.match(receipt.notes_sha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.failure, null);
});

test('online AI notes exhausts bounded timeout retries and writes a typed failure receipt', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-openai-compatible-transport-failure-'));
  const binDir = path.join(tempRoot, 'bin');
  const attemptPath = path.join(tempRoot, 'attempt.txt');
  const evidencePath = path.join(tempRoot, 'evidence.json');
  const outputPath = path.join(tempRoot, 'notes.md');
  const receiptPath = path.join(tempRoot, 'notes-prepare-receipt.json');
  const evidence = standardEvidence('26.9.7');
  writeTransientOpenAiCompatibleCurl(binDir, attemptPath, 3, validStandardAiReleaseNotes('26.9.7'));
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const result = runNode([
    'scripts/release-notes-ai-writer.ts',
    '--evidence', evidencePath,
    '--output', outputPath,
    '--receipt-output', receiptPath,
  ], {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPL_RELEASE_NOTES_PROVIDER: 'openai_compatible',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3001/v1',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY: 'freellmapi-test',
      OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODEL: 'auto',
      OPL_RELEASE_NOTES_AI_RETRY_DELAY_MS: '0',
      GITHUB_RUN_ID: '790',
    },
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(attemptPath, 'utf8'), '3');
  assert.match(result.stderr, /provider_transport_timeout.*transport attempt 3\/3/s);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.identity.workflow_run_id, '790');
  assert.deepEqual(receipt.failure, {
    taxonomy: 'transport',
    type: 'provider_transport_timeout',
    transport_attempts: 3,
    transport_retry_exhausted: true,
    message: receipt.failure.message,
  });
  assert.match(receipt.failure.message, /transport attempt 3\/3/);
  assert.equal(receipt.notes_sha256, null);
  assert.equal(fs.existsSync(outputPath), false);
});

test('stable manifest notes expose install, component refs, and version changes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-notes-manifest-'));
  const currentPath = path.join(tempRoot, 'current.json');
  const previousPath = path.join(tempRoot, 'previous.json');
  fs.writeFileSync(currentPath, JSON.stringify({ components: {
    mas: { git_commit: 'a'.repeat(40) },
    officecli: { version: '1.2.3' },
  } }));
  fs.writeFileSync(previousPath, JSON.stringify({ components: {
    mas: { git_commit: 'b'.repeat(40) },
    officecli: { version: '1.2.2' },
  } }));

  const result = runNode([
    'scripts/generate-release-notes.ts',
    '--version', '26.9.2',
    '--channel', 'stable',
    '--previous-tag', 'v26.9.1',
    '--current-tag', 'v26.9.2',
    '--shell-root', appRoot,
    '--previous-app-ref', 'HEAD',
    '--current-app-ref', 'HEAD',
    '--previous-shell-ref', 'HEAD',
    '--current-shell-ref', 'HEAD',
    '--full-package-manifest', currentPath,
    '--previous-full-package-manifest', previousPath,
  ], { env: { OPL_RELEASE_NOTES_SKIP_REMOTE_FAMILY_REPOS: '1' } });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(stableInstallCommand));
  assert.match(result.stdout, /Packaged component refs: MAS @ aaaaaaa; OfficeCLI 1\.2\.3/);
  assert.match(result.stdout, /Component updates since previous Stable: MAS bbbbbbb -> aaaaaaa; OfficeCLI 1\.2\.2 -> 1\.2\.3/);
});

test('Full notes derive only selected prebuild input refs from exact App, Shell, and Framework authorities', () => {
  const fixture = fullPayloadAuthorityFixture();
  assert.equal(path.relative(fixture.app.root, fixture.framework.root).startsWith('..'), true);
  const authorityPath = path.join(fixture.root, 'full-payload-authority.json');
  const evidencePath = path.join(fixture.root, 'notes-evidence.json');
  const authorityResult = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.equal(authorityResult.status, 0, authorityResult.stderr);

  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  assert.deepEqual(authority.intent, {
    include_full_package: true,
    phase: 'prebuild',
    build_artifact_bytes_known: false,
    usage: 'prepared_release_notes_evidence',
  });
  assert.deepEqual(authority.components.codex, { version: `codex-cli ${fixture.codexVersion}` });
  assert.equal(authority.runtime_authority.codex_cli.shell_source_commit, fixture.shell.ref);
  assert.equal(authority.runtime_authority.codex_cli.source, 'shell_aioncore_managed_resources_v2_direct_clis');
  assert.equal(authority.runtime_authority.codex_cli.managed_resources_schema_version, 2);
  assert.equal(authority.runtime_authority.codex_cli.node_runtime.version, fixture.nodeVersion);
  assert.equal(authority.runtime_authority.codex_cli.claude_cli.name, 'claude');
  assert.equal(authority.runtime_authority.codex_cli.claude_cli.version, fixture.claudeVersion);
  assert.equal(authority.runtime_authority.codex_cli.direct_cli.name, 'codex');
  assert.equal(authority.runtime_authority.codex_cli.version, fixture.codexVersion);
  assert.match(authority.runtime_authority.codex_cli.managed_resources_manifest_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(authority.runtime_authority.codex_cli.direct_cli.executable_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(authority.runtime_authority.codex_cli.direct_cli.required_files[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(authority.runtime_authority.codex_cli.direct_cli.required_directories[0].tree_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(authority.runtime_authority.codex_cli.qualification_input_ref, undefined);
  assert.notEqual(authority.runtime_authority.codex_cli.version, fixture.staleAppCodexProjection);
  assert.doesNotMatch(JSON.stringify(authority), /codex_acp|package_lock|npm_integrity|tarball_url/);
  assert.equal('framework_release_set' in authority, false);
  assert.equal('packages' in authority, false);
  assert.doesNotMatch(JSON.stringify(authority), /size_bytes|dmg_sha256|artifact_sha256/);

  const notesResult = runNode([
    'scripts/generate-release-notes.ts',
    '--version', '26.9.8',
    '--channel', 'stable',
    '--previous-tag', 'v26.9.7',
    '--current-tag', 'v26.9.8',
    '--shell-root', fixture.shell.root,
    '--previous-app-ref', 'HEAD',
    '--current-app-ref', 'HEAD',
    '--previous-shell-ref', fixture.shell.ref,
    '--current-shell-ref', fixture.shell.ref,
    '--include-full-package',
    '--full-payload-authority', authorityPath,
    '--previous-full-package-manifest', authorityPath,
    '--evidence-output', evidencePath,
  ], { env: { OPL_RELEASE_NOTES_SKIP_REMOTE_FAMILY_REPOS: '1' } });
  assert.equal(notesResult.status, 0, notesResult.stderr);

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const expectedRefs = [
    `OPL Framework @ ${fixture.framework.ref.slice(0, 7)}`,
    `Codex CLI ${fixture.codexVersion}`,
    `OfficeCLI @ ${fixture.officeRef.slice(0, 7)}`,
    `MinerU @ ${fixture.mineruRef.slice(0, 7)}`,
  ];
  assert.equal(evidence.payload.include_full_package, true);
  assert.equal(evidence.payload.full_payload_authority_sha256, sha256Ref(authorityPath));
  assert.deepEqual(evidence.payload.bundled_refs, expectedRefs);
  assert.match(
    evidence.payload.lines[0],
    /Full first-install package contents recorded in this release manifest: OPL Framework, Codex CLI, OfficeCLI, MinerU/,
  );
  assert.equal(evidence.payload.lines[1], `- Packaged component refs: ${expectedRefs.join('; ')}.`);
});

test('Standard freeze excludes future Full authority and independent WebUI build inputs', () => {
  const fixture = fullPayloadAuthorityFixture();
  const authorityPath = path.join(fixture.root, 'full-payload-authority.json');
  const notesPath = path.join(fixture.root, 'prepared-notes.md');
  const evidencePath = path.join(fixture.root, 'prepared-notes-evidence.json');
  const authorityResult = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.equal(authorityResult.status, 0, authorityResult.stderr);
  fs.writeFileSync(
    notesPath,
    '# One Person Lab v26.7.20\n\nPrepared notes.\n\n<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->\n',
  );

  const writeEvidence = (fullPayloadAuthoritySha256?: string) => {
    jsonFile(evidencePath, {
      schema: 'opl_app_release_notes_evidence.v1',
      payload: {
        include_full_package: false,
        ...(fullPayloadAuthoritySha256
          ? { full_payload_authority_sha256: fullPayloadAuthoritySha256 }
          : {}),
      },
    });
  };
  const runFreeze = (outputName: string) => runNode([
    'scripts/framework-release-adapter.ts',
    'freeze-request',
    '--channel', 'stable',
    '--version', '26.7.20',
    '--updater-version', '26.7.20',
    '--app-root', fixture.app.root,
    '--shell-root', fixture.shell.root,
    '--framework-root', fixture.framework.root,
    '--notes', notesPath,
    '--notes-evidence', evidencePath,
    '--include-full-package', 'false',
    '--package-compatibility-abi', 'opl_packages.v1',
    '--package-compatibility-version-range', '>=0.1.0 <1.0.0',
    '--source-cutoff-observed-at', '2026-07-23T00:00:00.000Z',
    '--base-image-index', fixture.baseImageIndexPath,
    '--frozen-codex-tarball', fixture.codexTarballPath,
    '--output', path.join(fixture.root, outputName),
  ]);

  writeEvidence();
  const accepted = runFreeze('accepted-freeze-request.json');
  assert.equal(accepted.status, 0, accepted.stderr);
  const acceptedRequest = JSON.parse(
    fs.readFileSync(path.join(fixture.root, 'accepted-freeze-request.json'), 'utf8'),
  );
  assert.equal(acceptedRequest.prepared_notes.evidence.payload.full_payload_authority_sha256, undefined);
  assert.equal(acceptedRequest.frozen_build_inputs, undefined);
  assert.equal(acceptedRequest.source_cutoff, undefined);

  writeEvidence(`sha256:${'f'.repeat(64)}`);
  const digestDrift = runFreeze('digest-drift-freeze-request.json');
  assert.notEqual(digestDrift.status, 0);
  assert.match(digestDrift.stderr, /cannot bind a Full payload authority digest/);
});

test('prebuild Full notes authority accepts the verified Actions nested Framework checkout topology', () => {
  const fixture = fullPayloadAuthorityFixture({ nestedFramework: true });
  assert.equal(path.relative(fixture.app.root, fixture.framework.root), 'framework-source');
  const authorityPath = path.join(fixture.root, 'nested-framework-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));

  assert.equal(result.status, 0, result.stderr);
  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  assert.equal(authority.sources.app.source_commit, fixture.app.ref);
  assert.equal(authority.sources.framework.source_commit, fixture.framework.ref);
});

test('prebuild Full notes authority rejects a nested checkout from the wrong repository', () => {
  const fixture = fullPayloadAuthorityFixture({ nestedFramework: true });
  runFixtureGit(fixture.framework.root, [
    'remote', 'set-url', 'origin', 'https://github.com/gaofeng21cn/not-one-person-lab.git',
  ]);
  const authorityPath = path.join(fixture.root, 'wrong-framework-repo-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Nested Framework origin must be gaofeng21cn\/one-person-lab/);
  assert.equal(fs.existsSync(authorityPath), false);
});

test('prebuild Full notes authority rejects a nested checkout at the wrong workflow input SHA', () => {
  const fixture = fullPayloadAuthorityFixture({ nestedFramework: true });
  const authorityPath = path.join(fixture.root, 'wrong-framework-sha-authority.json');
  const args = fullPayloadAuthorityArgs(fixture, authorityPath);
  args[args.indexOf('--framework-ref') + 1] = 'f'.repeat(40);
  const result = runNode(args);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Framework checkout drifted/);
  assert.equal(fs.existsSync(authorityPath), false);
});

test('prebuild Full notes authority rejects a nested checkout behind live Framework main', () => {
  const fixture = fullPayloadAuthorityFixture({ nestedFramework: true });
  advanceCanonicalFrameworkRemote(fixture.framework);
  const authorityPath = path.join(fixture.root, 'stale-framework-main-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Nested Framework live origin\/main must exactly match/);
  assert.equal(fs.existsSync(authorityPath), false);
});

test('prebuild Full notes authority rejects nested extras and every other App dirty state', () => {
  const fixture = fullPayloadAuthorityFixture({ nestedFramework: true });
  const authorityPath = path.join(fixture.root, 'dirty-nested-framework-authority.json');
  const frameworkExtra = path.join(fixture.framework.root, 'unexpected.txt');
  fs.writeFileSync(frameworkExtra, 'unexpected\n');

  const frameworkDirty = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.notEqual(frameworkDirty.status, 0);
  assert.match(frameworkDirty.stderr, /Framework checkout must be clean/);
  assert.equal(fs.existsSync(authorityPath), false);
  fs.rmSync(frameworkExtra);

  const appExtra = path.join(fixture.app.root, 'unexpected-app.txt');
  fs.writeFileSync(appExtra, 'unexpected\n');
  const appUntracked = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.notEqual(appUntracked.status, 0);
  assert.match(appUntracked.stderr, /App checkout must be clean/);
  assert.equal(fs.existsSync(authorityPath), false);
  fs.rmSync(appExtra);

  fs.appendFileSync(fixture.thirdPartyManifestPath, '\n');
  runFixtureGit(fixture.app.root, ['add', 'contracts/app-full-third-party-source-manifest.json']);
  const appIndexed = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.notEqual(appIndexed.status, 0);
  assert.match(appIndexed.stderr, /App checkout must be clean/);
  assert.equal(fs.existsSync(authorityPath), false);
});

test('prebuild Full notes authority does not require a Release Set input', () => {
  const fixture = fullPayloadAuthorityFixture();
  const authorityPath = path.join(fixture.root, 'open-composition-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.equal(result.status, 0, result.stderr);
  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  assert.equal('framework_release_set' in authority, false);
  assert.equal('packages' in authority, false);
});

test('prebuild Full notes authority rejects absent or drifted Shell AionCore materialization', async (context) => {
  for (const [label, mutate, expected] of [
    [
      'missing root manifest',
      (fixture: ReturnType<typeof fullPayloadAuthorityFixture>) => fs.rmSync(path.join(
        fixture.shell.root,
        'resources',
        'bundled-aioncore',
        'darwin-arm64',
        'manifest.json',
      )),
      /AionCore root manifest file is missing/,
    ],
    [
      'missing managed manifest',
      (fixture: ReturnType<typeof fullPayloadAuthorityFixture>) => fs.rmSync(path.join(
        fixture.shell.root,
        'resources',
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'manifest.json',
      )),
      /AionCore managed-resources manifest file is missing/,
    ],
    [
      'Shell pin drift',
      (fixture: ReturnType<typeof fullPayloadAuthorityFixture>) => jsonFile(
        path.join(fixture.shell.root, 'package.json'),
        { aioncoreVersion: 'v0.1.50' },
      ),
      /root manifest must exactly match the Shell pin/,
    ],
    [
      'official release URL drift',
      (fixture: ReturnType<typeof fullPayloadAuthorityFixture>) => {
        const manifestPath = path.join(
          fixture.shell.root,
          'resources',
          'bundled-aioncore',
          'darwin-arm64',
          'manifest.json',
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.source.url = 'https://github.com/iOfficeAI/AionCore/releases/latest/download/aioncore.tar.gz';
        jsonFile(manifestPath, manifest);
      },
      /root manifest must exactly match the Shell pin/,
    ],
    [
      'missing Codex required file',
      (fixture: ReturnType<typeof fullPayloadAuthorityFixture>) => {
        fs.rmSync(fixture.codexRequiredFile);
      },
      /codex CLI required file is missing/,
    ],
  ] as const) {
    await context.test(label, () => {
      const fixture = fullPayloadAuthorityFixture();
      mutate(fixture);
      fixture.shell.ref = commitFixtureChange(fixture.shell.root, label);
      const authorityPath = path.join(fixture.root, 'invalid-aioncore-authority.json');
      const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
      assert.equal(fs.existsSync(authorityPath), false);
    });
  }
});

test('prebuild Full notes authority rejects Shell direct CLI materialization drift before writing evidence', () => {
  const fixture = fullPayloadAuthorityFixture();
  const managedManifestPath = path.join(
    fixture.shell.root,
    'resources',
    'bundled-aioncore',
    'darwin-arm64',
    'managed-resources',
    'manifest.json',
  );
  const managedManifest = JSON.parse(fs.readFileSync(managedManifestPath, 'utf8'));
  managedManifest.clis[1].root = 'cli/codex/0.143.0/darwin-arm64';
  jsonFile(managedManifestPath, managedManifest);
  fixture.shell.ref = commitFixtureChange(fixture.shell.root, 'drift direct Codex CLI root');
  const authorityPath = path.join(fixture.root, 'drifted-codex-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed codex CLI root must match its exact version and platform/);
  assert.equal(fs.existsSync(authorityPath), false);
});

test('prebuild Full notes authority ignores unselected Package metadata', () => {
  const fixture = fullPayloadAuthorityFixture();
  jsonFile(path.join(fixture.framework.root, 'contracts', 'opl-framework', 'packages', 'mas.json'), {
    package_id: 'mas',
    version: '99.0.0',
  });
  fixture.framework.ref = commitFixtureChange(fixture.framework.root, 'add unselected Package metadata');
  const authorityPath = path.join(fixture.root, 'unselected-package-authority.json');
  const result = runNode(fullPayloadAuthorityArgs(fixture, authorityPath));
  assert.equal(result.status, 0, result.stderr);
  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  assert.equal(authority.sources.framework.source_commit, fixture.framework.ref);
  assert.equal('packages' in authority, false);
});

test('final notes normalization sanitizes evidence sections added after model cleanup', () => {
  const evidence = standardEvidence('26.9.3', {
    grouped_changes: [{
      title: 'Release readiness',
      bullets: ['The workflow gate keeps first-launch setup ready for research sessions.'],
    }],
  });
  const rawMarkdown = `${evidence.release_title}\n\nUsers can install or upgrade One Person Lab App to open MAS research, MAG grant-writing, RCA visual deliverable, and OPL Meta Agent sessions.\n`;
  const output = completeAiReleaseNotesWithEvidence(rawMarkdown, evidence);
  const publicMarkdown = publicMarkdownBeforeTechnicalDetails(output);

  assert.doesNotMatch(publicMarkdown, /\b(?:gate|workflow)\b/i);
  assert.match(publicMarkdown, /checks|sessions/i);
  assert.doesNotThrow(() => validateAiReleaseNotes(output, evidence));
});

test('online AI notes performs one bounded repair without echoing the validator diagnostic', () => {
  const evidence = standardEvidence('26.9.4', {
    agent_runtime_changes: [
      { label: 'MAS', user_value_hint: 'Supports research sessions.', change_summary_hint: 'Runtime state is clearer.' },
      { label: 'MAG', user_value_hint: 'Supports grant writing.', change_summary_hint: 'Runtime state is clearer.' },
      { label: 'RCA', user_value_hint: 'Supports visual deliverables.', change_summary_hint: 'Runtime state is clearer.' },
    ],
  });
  const firstDraft = validStandardAiReleaseNotes('26.9.4');
  const repairedDraft = firstDraft.replace(
    '## What improved',
    'MAS research sessions, MAG grant writing, and RCA visual deliverable work now shows clearer runtime state.\n\n## What improved',
  );
  const { result, requests, outputPath } = runWithFakeOpenAiNotes(evidence, [firstDraft, repairedDraft]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /Do not quote or paraphrase any diagnostic message/);
  assert.doesNotMatch(requests[1], /Quality gate failure to fix|missing concrete runtime change detail/);
  assert.ok(fs.existsSync(outputPath));
  assert.match(fs.readFileSync(outputPath, 'utf8'), /<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->/);
});

test('online AI notes fails closed after the single repair remains invalid', () => {
  const evidence = standardEvidence('26.9.5', {
    agent_runtime_changes: [
      { label: 'MAS', user_value_hint: 'Supports research sessions.', change_summary_hint: 'Runtime state is clearer.' },
      { label: 'MAG', user_value_hint: 'Supports grant writing.', change_summary_hint: 'Runtime state is clearer.' },
      { label: 'RCA', user_value_hint: 'Supports visual deliverables.', change_summary_hint: 'Runtime state is clearer.' },
    ],
  });
  const invalidDraft = validStandardAiReleaseNotes('26.9.5');
  const { result, requests, outputPath } = runWithFakeOpenAiNotes(evidence, [invalidDraft, invalidDraft]);

  assert.notEqual(result.status, 0);
  assert.equal(requests.length, 2);
  assert.match(result.stderr, /AI release notes failed quality gate/);
  assert.equal(fs.existsSync(outputPath), false);
});
