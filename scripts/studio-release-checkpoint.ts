#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Identity = {
  appRef: string;
  studioSha: string;
  studioTree: string;
  studioTag: string;
};

type CheckpointFile = {
  path: string;
  size_bytes: number;
  sha256: string;
};

type QualificationIdentity = Identity & {
  checkpointRoot: string;
  qualificationRoot: string;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function versionFromTag(tag: string): string {
  invariant(/^v/.test(tag), 'Studio checkpoint tag must start with v.');
  const version = tag.slice(1);
  invariant(versionPattern.test(version), 'Studio checkpoint tag must contain numeric SemVer.');
  return version;
}

function validateIdentity(identity: Identity): string {
  invariant(shaPattern.test(identity.appRef), 'Studio checkpoint App ref must be an exact lowercase SHA.');
  invariant(shaPattern.test(identity.studioSha), 'Studio checkpoint source SHA must be exact lowercase SHA.');
  invariant(shaPattern.test(identity.studioTree), 'Studio checkpoint source tree must be exact lowercase SHA.');
  return versionFromTag(identity.studioTag);
}

function expectedPaths(version: string): string[] {
  return [
    `assets/one-person-lab-preview-${version}-mac-arm64.dmg`,
    `assets/one-person-lab-preview-${version}-mac-arm64.zip`,
    `assets/one-person-lab-preview-${version}-mac-arm64.zip.blockmap`,
    'assets/latest-mac.yml',
    'assets/latest-arm64-mac.yml',
    'evidence/app-notarization.json',
    'evidence/apple-credentials-preflight.json',
    'evidence/dmg-notarization.json',
    'evidence/release-assets.json',
    'evidence/release-notes.md',
    'evidence/source-admission.json',
  ].sort();
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function regularFile(root: string, relativePath: string): string {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.lstatSync(absolutePath);
  invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `${relativePath} must be one nonempty regular file.`);
  return absolutePath;
}

function fileIdentity(root: string, relativePath: string): CheckpointFile {
  const absolutePath = regularFile(root, relativePath);
  const stat = fs.statSync(absolutePath);
  return { path: relativePath, size_bytes: stat.size, sha256: sha256(absolutePath) };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function allFiles(root: string): string[] {
  const visit = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    invariant(!entry.isSymbolicLink(), `Studio checkpoint cannot contain symbolic link ${absolutePath}.`);
    if (entry.isDirectory()) return visit(absolutePath);
    invariant(entry.isFile(), `Studio checkpoint contains unsupported entry ${absolutePath}.`);
    return [path.relative(root, absolutePath).split(path.sep).join('/')];
  });
  return visit(root).filter((entry) => entry !== 'checkpoint.json').sort();
}

function validateSupportingEvidence(root: string, identity: Identity, version: string, files: CheckpointFile[]): void {
  const source = readJson(path.join(root, 'evidence/source-admission.json')) as Record<string, any>;
  invariant(source.schema === 'opl_studio_protected_release_admission.v1', 'Studio source admission schema is invalid.');
  invariant(source.app_executor?.commit_sha === identity.appRef, 'Studio source admission App ref does not match.');
  invariant(source.source?.commit_sha === identity.studioSha, 'Studio source admission commit does not match.');
  invariant(source.source?.tree_sha === identity.studioTree, 'Studio source admission tree does not match.');
  invariant(source.source?.tag === identity.studioTag, 'Studio source admission tag does not match.');

  const appNotary = readJson(path.join(root, 'evidence/app-notarization.json')) as Record<string, any>;
  invariant(appNotary.status === 'Accepted', 'Studio App notarization must be Accepted.');
  const dmgNotary = readJson(path.join(root, 'evidence/dmg-notarization.json')) as Record<string, any>;
  invariant(dmgNotary.notarization?.status === 'Accepted', 'Studio DMG notarization must be Accepted.');

  const assetManifest = readJson(path.join(root, 'evidence/release-assets.json')) as Record<string, any>;
  invariant(assetManifest.schema === 'opl_studio_release_assets.v1', 'Studio release asset manifest schema is invalid.');
  invariant(assetManifest.repository === 'gaofeng21cn/opl-studio', 'Studio release asset repository is invalid.');
  invariant(assetManifest.version === version && assetManifest.tag === identity.studioTag, 'Studio release asset version identity is invalid.');
  invariant(Array.isArray(assetManifest.assets), 'Studio release asset manifest must contain assets.');
  const checkpointAssets = files
    .filter((entry) => entry.path.startsWith('assets/'))
    .map((entry) => ({ name: path.posix.basename(entry.path), size_bytes: entry.size_bytes, sha256: entry.sha256 }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const declaredAssets = assetManifest.assets
    .map((entry: Record<string, unknown>) => ({
      name: String(entry.name ?? ''),
      size_bytes: Number(entry.size_bytes),
      sha256: String(entry.sha256 ?? ''),
    }))
    .sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name));
  invariant(JSON.stringify(declaredAssets) === JSON.stringify(checkpointAssets), 'Studio release asset manifest does not bind checkpoint bytes.');
}

export function sealStudioReleaseCheckpoint(root: string, identity: Identity) {
  const version = validateIdentity(identity);
  const expected = expectedPaths(version);
  invariant(JSON.stringify(allFiles(root)) === JSON.stringify(expected), 'Studio checkpoint file set is not exact.');
  const files = expected.map((entry) => fileIdentity(root, entry));
  validateSupportingEvidence(root, identity, version, files);
  const checkpoint = {
    schema: 'opl_studio_signed_notarized_checkpoint.v1',
    status: 'signed_notarized',
    authority_owner: 'one-person-lab-app',
    app_executor_sha: identity.appRef,
    source: {
      repository: 'gaofeng21cn/opl-studio',
      commit_sha: identity.studioSha,
      tree_sha: identity.studioTree,
      tag: identity.studioTag,
      version,
    },
    files,
  };
  fs.writeFileSync(path.join(root, 'checkpoint.json'), `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  return checkpoint;
}

export function validateStudioReleaseCheckpoint(root: string, identity: Identity) {
  const version = validateIdentity(identity);
  const checkpoint = readJson(path.join(root, 'checkpoint.json')) as Record<string, any>;
  invariant(exactKeys(checkpoint, ['schema', 'status', 'authority_owner', 'app_executor_sha', 'source', 'files']), 'Studio checkpoint shape is invalid.');
  invariant(checkpoint.schema === 'opl_studio_signed_notarized_checkpoint.v1', 'Studio checkpoint schema is invalid.');
  invariant(checkpoint.status === 'signed_notarized' && checkpoint.authority_owner === 'one-person-lab-app', 'Studio checkpoint authority is invalid.');
  invariant(checkpoint.app_executor_sha === identity.appRef, 'Studio checkpoint App ref does not match.');
  invariant(exactKeys(checkpoint.source, ['repository', 'commit_sha', 'tree_sha', 'tag', 'version']), 'Studio checkpoint source shape is invalid.');
  invariant(checkpoint.source.repository === 'gaofeng21cn/opl-studio', 'Studio checkpoint repository is invalid.');
  invariant(checkpoint.source.commit_sha === identity.studioSha, 'Studio checkpoint commit does not match.');
  invariant(checkpoint.source.tree_sha === identity.studioTree, 'Studio checkpoint tree does not match.');
  invariant(checkpoint.source.tag === identity.studioTag && checkpoint.source.version === version, 'Studio checkpoint tag or version does not match.');
  const expected = expectedPaths(version);
  invariant(JSON.stringify(allFiles(root)) === JSON.stringify(expected), 'Studio checkpoint file set is not exact.');
  invariant(Array.isArray(checkpoint.files) && checkpoint.files.length === expected.length, 'Studio checkpoint file identities are incomplete.');
  const files = expected.map((entry) => fileIdentity(root, entry));
  const declared = checkpoint.files.map((entry: Record<string, unknown>) => {
    invariant(exactKeys(entry, ['path', 'size_bytes', 'sha256']), 'Studio checkpoint file identity shape is invalid.');
    invariant(typeof entry.path === 'string' && expected.includes(entry.path), 'Studio checkpoint file path is invalid.');
    invariant(Number.isSafeInteger(entry.size_bytes) && Number(entry.size_bytes) > 0, 'Studio checkpoint file size is invalid.');
    invariant(typeof entry.sha256 === 'string' && digestPattern.test(entry.sha256), 'Studio checkpoint file digest is invalid.');
    return { path: entry.path, size_bytes: entry.size_bytes, sha256: entry.sha256 };
  }).sort((left: CheckpointFile, right: CheckpointFile) => left.path.localeCompare(right.path));
  invariant(JSON.stringify(declared) === JSON.stringify(files), 'Studio checkpoint bytes do not match the manifest.');
  validateSupportingEvidence(root, identity, version, files);
  return checkpoint;
}

function qualificationReceipt(root: string, identity: Identity): Record<string, any> {
  const version = versionFromTag(identity.studioTag);
  const receiptPath = regularFile(root, 'prepublication-qualification.json');
  const receipt = readJson(receiptPath) as Record<string, any>;
  invariant(receipt.schema === 'opl_macos_desktop_distribution_qualification.v1', 'Studio qualification receipt schema is invalid.');
  invariant(receipt.candidateId === 'opl-studio', 'Studio qualification candidate is invalid.');
  invariant(receipt.version === version && receipt.buildVersion === version, 'Studio qualification version is invalid.');
  invariant(receipt.releaseReady === false, 'Studio prepublication qualification cannot claim public release readiness.');
  invariant(receipt.releaseBlocker === 'public_update_feed_qualification_required', 'Studio qualification must wait only for the public feed.');
  invariant(Array.isArray(receipt.releaseBlockers) && receipt.releaseBlockers.length === 1, 'Studio qualification blockers are invalid.');
  invariant(receipt.trust?.gatekeeperAccepted === true, 'Studio qualification requires Gatekeeper acceptance.');
  invariant(receipt.trust?.appStapled === true && receipt.trust?.dmgStapled === true, 'Studio qualification requires stapled App and DMG tickets.');
  return receipt;
}

export function sealStudioReleaseQualification(input: QualificationIdentity) {
  const checkpoint = validateStudioReleaseCheckpoint(input.checkpointRoot, input);
  const receipt = qualificationReceipt(input.qualificationRoot, input);
  const entries = allFiles(input.qualificationRoot);
  invariant(JSON.stringify(entries) === JSON.stringify(['prepublication-qualification.json']), 'Studio qualification input file set is not exact.');
  const receiptFile = fileIdentity(input.qualificationRoot, 'prepublication-qualification.json');
  const manifest = {
    schema: 'opl_studio_prepublication_qualification.v1',
    status: 'qualified',
    authority_owner: 'one-person-lab-app',
    app_executor_sha: input.appRef,
    source: checkpoint.source,
    checkpoint_manifest_sha256: sha256(path.join(input.checkpointRoot, 'checkpoint.json')),
    receipt: receiptFile,
    public_feed_pending: receipt.releaseBlocker,
  };
  fs.writeFileSync(path.join(input.qualificationRoot, 'qualification.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

export function validateStudioReleaseQualification(input: QualificationIdentity) {
  const checkpoint = validateStudioReleaseCheckpoint(input.checkpointRoot, input);
  const manifest = readJson(path.join(input.qualificationRoot, 'qualification.json')) as Record<string, any>;
  invariant(exactKeys(manifest, [
    'schema', 'status', 'authority_owner', 'app_executor_sha', 'source',
    'checkpoint_manifest_sha256', 'receipt', 'public_feed_pending',
  ]), 'Studio qualification manifest shape is invalid.');
  invariant(manifest.schema === 'opl_studio_prepublication_qualification.v1', 'Studio qualification manifest schema is invalid.');
  invariant(manifest.status === 'qualified' && manifest.authority_owner === 'one-person-lab-app', 'Studio qualification authority is invalid.');
  invariant(manifest.app_executor_sha === input.appRef, 'Studio qualification App ref does not match.');
  invariant(JSON.stringify(manifest.source) === JSON.stringify(checkpoint.source), 'Studio qualification source identity does not match checkpoint.');
  invariant(manifest.checkpoint_manifest_sha256 === sha256(path.join(input.checkpointRoot, 'checkpoint.json')), 'Studio qualification checkpoint digest does not match.');
  invariant(manifest.public_feed_pending === 'public_update_feed_qualification_required', 'Studio qualification public-feed state is invalid.');
  const entries = allFiles(input.qualificationRoot);
  invariant(JSON.stringify(entries) === JSON.stringify(['prepublication-qualification.json', 'qualification.json']), 'Studio qualification file set is not exact.');
  qualificationReceipt(input.qualificationRoot, input);
  invariant(exactKeys(manifest.receipt, ['path', 'size_bytes', 'sha256']), 'Studio qualification receipt identity shape is invalid.');
  invariant(JSON.stringify(manifest.receipt) === JSON.stringify(fileIdentity(input.qualificationRoot, 'prepublication-qualification.json')), 'Studio qualification receipt bytes do not match.');
  return manifest;
}

function runCli(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: 'string' },
      'app-ref': { type: 'string' },
      'studio-sha': { type: 'string' },
      'studio-tree': { type: 'string' },
      'studio-tag': { type: 'string' },
      'checkpoint-root': { type: 'string' },
      'qualification-root': { type: 'string' },
    },
  });
  invariant(positionals.length === 1 && ['seal', 'validate', 'seal-qualification', 'validate-qualification'].includes(positionals[0]), 'Usage: studio-release-checkpoint.ts <seal|validate|seal-qualification|validate-qualification> <options>');
  for (const option of ['app-ref', 'studio-sha', 'studio-tree', 'studio-tag'] as const) {
    invariant(values[option], `Missing required option: --${option}`);
  }
  const identity = {
    appRef: values['app-ref']!,
    studioSha: values['studio-sha']!,
    studioTree: values['studio-tree']!,
    studioTag: values['studio-tag']!,
  };
  let result;
  if (positionals[0] === 'seal' || positionals[0] === 'validate') {
    invariant(values.root, 'Missing required option: --root');
    const root = path.resolve(values.root);
    result = positionals[0] === 'seal'
      ? sealStudioReleaseCheckpoint(root, identity)
      : validateStudioReleaseCheckpoint(root, identity);
  } else {
    invariant(values['checkpoint-root'], 'Missing required option: --checkpoint-root');
    invariant(values['qualification-root'], 'Missing required option: --qualification-root');
    const qualificationIdentity = {
      ...identity,
      checkpointRoot: path.resolve(values['checkpoint-root']),
      qualificationRoot: path.resolve(values['qualification-root']),
    };
    result = positionals[0] === 'seal-qualification'
      ? sealStudioReleaseQualification(qualificationIdentity)
      : validateStudioReleaseQualification(qualificationIdentity);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
