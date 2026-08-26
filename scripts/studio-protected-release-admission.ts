#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readAppShellAdapterContract } from './app-shell-adapter.ts';
import {
  resolveDesktopReleaseCarrier,
  type DesktopReleaseCarrier,
} from './desktop-release-carrier.ts';

type GitIdentity = {
  commitSha: string;
  treeSha: string;
};

type PlannerInput = {
  app: GitIdentity;
  studio: GitIdentity;
  frameworkRef: string;
  requestedTag: string;
  carrier: DesktopReleaseCarrier;
};

const shaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertGitIdentity(label: string, identity: GitIdentity): void {
  invariant(shaPattern.test(identity.commitSha), `${label} commit must be an exact lowercase 40-character SHA.`);
  invariant(shaPattern.test(identity.treeSha), `${label} tree must be an exact lowercase 40-character SHA.`);
}

export function buildStudioProtectedReleaseAdmission(input: PlannerInput) {
  assertGitIdentity('App', input.app);
  assertGitIdentity('Studio', input.studio);
  invariant(shaPattern.test(input.frameworkRef), 'Framework ref must be an exact lowercase 40-character SHA.');

  const packageVersion = input.carrier.packageVersion;
  invariant(input.carrier.carrierId === 'opl-studio', 'Protected Studio admission requires the opl-studio carrier.');
  invariant(input.carrier.ownerRepo === 'gaofeng21cn/opl-studio', 'Studio carrier owner must remain gaofeng21cn/opl-studio.');
  invariant(input.carrier.releaseRole === 'candidate_preview', 'Studio must remain a candidate preview carrier before adoption.');
  invariant(input.carrier.releaseRepository === 'gaofeng21cn/opl-studio', 'Studio must use its dedicated release repository.');
  invariant(input.carrier.bundleId === 'cn.onepersonlab.opl.studio.preview', 'Studio preview must use the One Person Lab bundle namespace.');
  invariant(
    input.carrier.commands.qualify_prepublication ===
      'node scripts/desktop/macos-distribution.mjs --require-release-trust',
    'Studio prepublication qualification must require local release trust.',
  );
  invariant(
    input.carrier.commands.qualify_public_release ===
      'node scripts/desktop/macos-distribution.mjs --require-release-trust --require-public-feed',
    'Studio public release qualification must require release trust and the public feed.',
  );
  invariant(versionPattern.test(packageVersion), 'Studio package version must be numeric SemVer.');
  invariant(input.requestedTag === `v${packageVersion}`, 'Protected Studio tag must equal package version.');
  const stageOrder = input.carrier.stageOrder;

  return {
    schema: 'opl_studio_protected_release_admission.v2',
    status: 'source_admitted_pending_protected_execution',
    authority: {
      owner: 'one-person-lab-app',
      workflow: '.github/workflows/release-stable.yml',
      entry_selector: 'studio_carrier_admission',
      framework_operation: null,
      framework_ref: input.frameworkRef,
      environment: 'release-stable',
      framework_release_operation_created: false,
      second_release_owner_created: false,
    },
    app_executor: {
      commit_sha: input.app.commitSha,
      tree_sha: input.app.treeSha,
    },
    source: {
      repository: 'gaofeng21cn/opl-studio',
      commit_sha: input.studio.commitSha,
      tree_sha: input.studio.treeSha,
      package_version: packageVersion,
      tag: input.requestedTag,
      version_identity: 'package_bundle_feed_tag_exact_numeric_semver',
      app_id: input.carrier.bundleId,
      product_name: input.carrier.productName,
      artifact_name_template: input.carrier.artifactNameTemplate,
      macos_targets: input.carrier.macos.targets,
      update_feed: 'https://github.com/gaofeng21cn/opl-studio/releases/download/<exact-tag>/',
    },
    framework_bootstrap: {
      framework_ref: input.frameworkRef,
      installer_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${input.frameworkRef}/install.sh`,
      archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${input.frameworkRef}.tar.gz`,
      resource_path: 'resources/opl-framework-bootstrap/opl-install.sh',
      manifest_path: 'resources/opl-framework-bootstrap/manifest.json',
      install_source_mode: 'archive',
    },
    admitted_plan: {
      carrier: 'electron_desktop',
      stage_order: stageOrder,
      build_command: `${input.carrier.commands.install} && ${input.carrier.commands.build_macos}`,
      notarizer: 'one-person-lab-app/scripts/notarize-macos-dmg.ts',
      prepublication_qualification: input.carrier.commands.qualify_prepublication,
      publication_target: 'gaofeng21cn/opl-studio GitHub Releases exact tag',
      public_readback_command: input.carrier.commands.qualify_public_release,
    },
    protected_execution: {
      workflow: '.github/workflows/_release-studio.yml',
      starts_after_this_admission_in_the_same_stable_run: true,
      version_must_be_strictly_newer_than_public_numeric_releases: true,
      github_latest_pointer_required: true,
      prerelease: false,
      published_assets: [
        'macos_arm64_dmg',
        'macos_arm64_updater_zip',
        'macos_arm64_updater_zip_blockmap',
        'latest-mac.yml',
        'latest-arm64-mac.yml',
      ],
    },
    gates: {
      exact_source_identity: 'passed',
      dedicated_release_namespace: 'passed',
      hardened_runtime_and_artifact_shape: 'passed',
      release_qualification_contract: 'passed',
      notarization_status_required: 'Accepted',
      stapler_validate_required: true,
      anonymous_public_byte_readback_required: true,
      any_failed_stage_blocks_later_stages: true,
    },
    secret_custody: {
      owner: 'one-person-lab-app release-stable protected environment',
      values_read_or_copied_by_admission: false,
      studio_repository_secret_copy_allowed: false,
      execution_must_verify_capabilities_before_first_external_mutation: [
        'developer_id_signing',
        'apple_notarization',
        'github_release_write_gaofeng21cn_opl-studio',
      ],
    },
    active_shell_unchanged: true,
    active_release_carrier: false,
    release_ready: false,
    public_mutation_authorized: false,
    external_mutation_attempted: false,
    remaining_protected_action: {
      authority: 'release-stable environment reviewer plus explicit user approval',
      exact_source_required: {
        repository: 'gaofeng21cn/opl-studio',
        commit_sha: input.studio.commitSha,
        tree_sha: input.studio.treeSha,
        tag: input.requestedTag,
      },
      framework_ref: input.frameworkRef,
      required_sequence: stageOrder.slice(1),
      admission_receipt_is_publication_authority: false,
    },
  };
}

function gitIdentity(root: string): GitIdentity {
  const read = (revision: string) => {
    const result = spawnSync('git', ['rev-parse', revision], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      throw new Error(`Unable to read Git identity under ${root}: ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  };
  return { commitSha: read('HEAD'), treeSha: read('HEAD^{tree}') };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function runCli(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      'app-root': { type: 'string' },
      'studio-root': { type: 'string' },
      'studio-sha': { type: 'string' },
      'studio-tree': { type: 'string' },
      'studio-tag': { type: 'string' },
      'framework-ref': { type: 'string' },
      output: { type: 'string' },
    },
  });
  invariant(positionals.length === 1 && positionals[0] === 'plan', 'Usage: studio-protected-release-admission.ts plan <options>');
  for (const option of ['app-root', 'studio-root', 'studio-sha', 'studio-tree', 'studio-tag', 'framework-ref', 'output'] as const) {
    invariant(values[option], `Missing required option: --${option}`);
  }

  const appRoot = path.resolve(values['app-root']!);
  const studioRoot = path.resolve(values['studio-root']!);
  const app = gitIdentity(appRoot);
  const studio = gitIdentity(studioRoot);
  invariant(studio.commitSha === values['studio-sha'], 'Studio commit does not match protected request.');
  invariant(studio.treeSha === values['studio-tree'], 'Studio tree does not match protected request.');

  const studioAdapter = readAppShellAdapterContract(
    path.join(appRoot, 'contracts', 'shell-adapters', 'opl-studio.json'),
  );
  const carrier = resolveDesktopReleaseCarrier({ contract: studioAdapter, shellRoot: studioRoot });
  const receipt = buildStudioProtectedReleaseAdmission({
    app,
    studio,
    frameworkRef: values['framework-ref']!,
    requestedTag: values['studio-tag']!,
    carrier,
  });
  writeJsonAtomic(path.resolve(values.output!), receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
