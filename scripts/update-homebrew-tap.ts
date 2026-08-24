#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  assertReleaseVersionNotFuture,
  assertUpdaterVersionMatchesDisplay,
  resolveReleaseVersionIdentity,
} from './release-version.ts';

type Channel = 'stable' | 'nightly';
type PackageKind = 'app_standard' | 'app_full_first_install';

type Options = {
  channel: Channel;
  packageKind: PackageKind | null;
  version: string;
  updaterVersion: string;
  tapRoot: string;
  manifestUrl: string;
  checksumSha256: string;
  downloadUrl: string;
  targets: string[];
  write: boolean;
  summaryPath: string | null;
  remoteWriteMode: string;
  expectedCurrentCaskSha256: string | null;
  selfCheck: boolean;
};

type ResolvedOptions = Omit<Options, 'packageKind'> & {
  packageKind: PackageKind;
};

type TapUpdateTarget = {
  path: string;
  kind: 'formula' | 'cask';
  previous_exists: boolean;
  changed: boolean;
  same_candidate_version: boolean;
  current_display_version: string | null;
  current_updater_version: string | null;
  current_dmg_sha256: string | null;
  current_cask_sha256: string | null;
  expected_cask_sha256: string;
  content: string;
};

type TapCasDecision = 'idempotent' | 'write_once' | 'version_conflict';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTapRoot = path.join(appRoot, 'dist', 'homebrew-tap-plan');
const fullReleaseManifestName = 'opl-release-manifest.json';
const legacyFullReleaseManifestName = 'full-package-manifest.json';
const fullPayloadPattern = /One-Person-Lab-Full-[^"'\s]+-mac-arm64\.dmg|(?:opl-release-manifest|full-package-manifest)\.json/i;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const standardAppCaskTargets = new Set([
  'Casks/one-person-lab.rb',
  'Casks/one-person-lab-nightly.rb',
]);
const fullFirstInstallCaskTarget = 'Casks/one-person-lab-full.rb';
const caskConflictMap: Record<string, string[]> = {
  'one-person-lab': ['one-person-lab-full', 'one-person-lab-nightly'],
  'one-person-lab-nightly': ['one-person-lab', 'one-person-lab-full'],
  'one-person-lab-full': ['one-person-lab', 'one-person-lab-nightly'],
};

function parseArgs(argv: string[]): Options {
  const { values, tokens } = parseNodeArgs({
    args: argv,
    options: {
      'self-check': { type: 'boolean' },
      write: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      channel: { type: 'string' },
      'package-kind': { type: 'string' },
      version: { type: 'string' },
      'updater-version': { type: 'string' },
      'tap-root': { type: 'string' },
      formula: { type: 'string', multiple: true },
      cask: { type: 'string', multiple: true },
      'manifest-url': { type: 'string' },
      'checksum-sha256': { type: 'string' },
      'download-url': { type: 'string' },
      'summary-path': { type: 'string' },
      'remote-write-mode': { type: 'string' },
      'expected-current-cask-sha256': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const parsed: Options = {
    channel: 'stable',
    packageKind: null,
    version: '',
    updaterVersion: '',
    tapRoot: defaultTapRoot,
    manifestUrl: '',
    checksumSha256: '',
    downloadUrl: '',
    targets: [],
    write: false,
    summaryPath: null,
    remoteWriteMode: 'none',
    expectedCurrentCaskSha256: null,
    selfCheck: false,
  };

  if (values.channel !== undefined) {
    if (values.channel !== 'stable' && values.channel !== 'nightly') {
      throw new Error('--channel must be stable or nightly.');
    }
    parsed.channel = values.channel;
  }
  if (values['package-kind'] !== undefined) {
    if (values['package-kind'] !== 'app_standard' && values['package-kind'] !== 'app_full_first_install') {
      throw new Error('--package-kind must be app_standard or app_full_first_install. Homebrew tap updates are App cask-only; OPL Packages are Framework-managed.');
    }
    parsed.packageKind = values['package-kind'];
  }
  if (values.version !== undefined) parsed.version = values.version;
  if (values['updater-version'] !== undefined) parsed.updaterVersion = values['updater-version'];
  if (values['tap-root'] !== undefined) parsed.tapRoot = path.resolve(values['tap-root']);
  if (values['manifest-url'] !== undefined) parsed.manifestUrl = values['manifest-url'];
  if (values['checksum-sha256'] !== undefined) parsed.checksumSha256 = values['checksum-sha256'];
  if (values['download-url'] !== undefined) parsed.downloadUrl = values['download-url'];
  if (values['summary-path'] !== undefined) parsed.summaryPath = path.resolve(values['summary-path']);
  if (values['remote-write-mode'] !== undefined) parsed.remoteWriteMode = values['remote-write-mode'];
  if (values['expected-current-cask-sha256'] !== undefined) {
    parsed.expectedCurrentCaskSha256 = values['expected-current-cask-sha256'];
  }
  parsed.selfCheck = values['self-check'] === true;
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (token.name === 'write') parsed.write = true;
    if (token.name === 'dry-run') parsed.write = false;
    if ((token.name === 'formula' || token.name === 'cask') && token.value !== undefined) {
      parsed.targets.push(token.value);
    }
  }

  return parsed;
}

function classifyTarget(targetPath: string): 'formula' | 'cask' {
  return targetPath.startsWith('Formula/') ? 'formula' : 'cask';
}

function sha256(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function boundaryValue(content: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`^\\s*#\\s*${escaped}:\\s*(\\S+)\\s*$`, 'm'))?.[1] ?? null;
}

function rubyValue(content: string, name: 'version' | 'sha256'): string | null {
  return content.match(new RegExp(`^\\s*${name}\\s+["']([^"']+)["']`, 'm'))?.[1] ?? null;
}

function normalizeOptionalSha256(value: string | null): string | null {
  if (value === null || value === 'absent') return value;
  const normalized = value.startsWith('sha256:') ? value : `sha256:${value}`;
  if (!/^sha256:[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error('--expected-current-cask-sha256 must be absent or an exact SHA-256 digest.');
  }
  return normalized.toLowerCase();
}

function assertNoFullPayloadReference(label: string, value: string): void {
  if (fullPayloadPattern.test(value)) {
    throw new Error(`${label} must not reference Full first-install payloads.`);
  }
}

function assertFullPayloadReference(label: string, value: string): void {
  if (!fullPayloadPattern.test(value)) {
    throw new Error(`${label} must reference Full first-install payloads for app_full_first_install.`);
  }
}

function assertRelativeTapTarget(targetPath: string): void {
  if (path.isAbsolute(targetPath) || targetPath.split(/[\\/]/).includes('..')) {
    throw new Error(`Homebrew tap target must be a relative path inside the tap checkout: ${targetPath}`);
  }
  if (!/^(Formula|Casks)\//.test(targetPath)) {
    throw new Error(`Homebrew tap target must live under Formula/ or Casks/: ${targetPath}`);
  }
}

function inferPackageKind(options: Options): PackageKind {
  if (options.packageKind) return options.packageKind;
  return 'app_standard';
}

function validateOptions(options: Options): ResolvedOptions {
  if (options.selfCheck) {
    return { ...options, packageKind: options.packageKind ?? 'app_standard' };
  }
  if (!options.version) throw new Error('Missing required --version.');
  if (!options.updaterVersion) throw new Error('Missing required --updater-version.');
  if (!options.manifestUrl) throw new Error('Missing required --manifest-url.');
  if (!options.downloadUrl) throw new Error('Missing required --download-url.');
  if (!sha256Pattern.test(options.checksumSha256)) {
    throw new Error('--checksum-sha256 must be a 64-character SHA-256 digest.');
  }
  if (options.targets.length === 0) {
    throw new Error('Pass at least one --formula or --cask target.');
  }
  if (!['none', 'inspect_only', 'direct_commit'].includes(options.remoteWriteMode)) {
    throw new Error('--remote-write-mode must be none, inspect_only, or direct_commit.');
  }
  const expectedCurrentCaskSha256 = normalizeOptionalSha256(options.expectedCurrentCaskSha256);
  if (options.write && options.remoteWriteMode === 'direct_commit' && expectedCurrentCaskSha256 === null) {
    throw new Error('Direct-commit writes require exact --expected-current-cask-sha256 (or absent) for CAS.');
  }

  const packageKind = inferPackageKind(options);

  try {
    assertReleaseVersionNotFuture(options.channel, options.version);
  } catch {
    if (options.channel === 'nightly') {
      throw new Error('Nightly Homebrew tap updates must use YY.M.D-nightly or YY.M.D-nightly.r1 through .r9.');
    }
    throw new Error('Stable Homebrew tap updates must use YY.M.D or YY.M.D-r1 through r9.');
  }
  assertUpdaterVersionMatchesDisplay(options.channel, options.version, options.updaterVersion);
  if (packageKind === 'app_full_first_install' && options.channel !== 'stable') {
    throw new Error('Full first-install Homebrew cask updates must stay on the stable channel.');
  }

  if (packageKind === 'app_full_first_install') {
    assertFullPayloadReference('download URL', options.downloadUrl);
    if (path.basename(new URL(options.manifestUrl).pathname) !== fullReleaseManifestName) {
      throw new Error(`Full first-install Homebrew cask updates must reference ${fullReleaseManifestName}.`);
    }
  } else {
    assertNoFullPayloadReference('manifest URL', options.manifestUrl);
    assertNoFullPayloadReference('download URL', options.downloadUrl);
  }

  for (const targetPath of options.targets) {
    assertRelativeTapTarget(targetPath);
    const isNightlyTarget = /nightly/i.test(path.basename(targetPath));
    if (classifyTarget(targetPath) !== 'cask') {
      throw new Error('Homebrew tap updates are App cask-only; OPL Packages are Framework-managed, not Homebrew formulae.');
    }
    if (packageKind === 'app_full_first_install') {
      if (targetPath !== fullFirstInstallCaskTarget) {
        throw new Error('Full first-install Homebrew cask updates may only update Casks/one-person-lab-full.rb.');
      }
      continue;
    }
    assertNoFullPayloadReference('Homebrew tap target', targetPath);
    if (!standardAppCaskTargets.has(targetPath)) {
      throw new Error('Homebrew tap updates are App cask-only; OPL Packages are Framework-managed, not Homebrew formulae.');
    }
    if (options.channel === 'nightly' && !isNightlyTarget) {
      throw new Error('Nightly Homebrew tap updates may only update the Nightly App cask target.');
    }
    if (options.channel === 'stable' && isNightlyTarget) {
      throw new Error('Stable Homebrew tap updates must not update the Nightly App cask target.');
    }
  }

  return { ...options, packageKind, expectedCurrentCaskSha256 };
}

function boundaryBlock(options: ResolvedOptions): string {
  const fullFirstInstall = options.packageKind === 'app_full_first_install';
  const lines = [
    '# OPL_HOMEBREW_BOUNDARY_START',
    `# channel: ${options.channel}`,
    `# package_kind: ${options.packageKind}`,
    `# version: ${options.version}`,
    `# display_version: ${options.version}`,
    `# updater_version: ${options.updaterVersion}`,
    `# manifest: ${options.manifestUrl}`,
    `# checksum: sha256:${options.checksumSha256}`,
    `# full_first_install_allowed: ${fullFirstInstall ? 'true' : 'false'}`,
    '# stable_promotion_from_nightly_allowed: false',
    '# publishes_or_pushes_remote: false',
  ];
  lines.push(
    `# cohort: ${fullFirstInstall ? 'full_first_install_homebrew_distribution' : 'standard_desktop_homebrew_distribution'}`,
    `# standard_updater_visible: ${fullFirstInstall ? 'false' : 'true'}`,
    `# bundled_full_runtime_payload_allowed: ${fullFirstInstall ? 'true' : 'false'}`,
    `# formula_dependency_required: ${fullFirstInstall ? 'false' : 'true'}`,
    `# framework_carrier: ${fullFirstInstall ? 'full_dmg_embedded_opl_base' : 'homebrew_formula_opl'}`,
    '# active_framework_count_target: 1',
    '# homebrew_allowed_software_objects: opl_base,opl_app',
    '# opl_packages_lifecycle_owned_by_homebrew: false',
    '# opl_packages_lifecycle_owner: one-person-lab',
    '# opl_packages_lifecycle_command: opl packages',
    '# package_specific_formula_allowed: false',
    '# package_specific_cask_allowed: false',
    '# forbidden_package_formulae: mas,mag,rca,oma,obf,mas-scholar-skills,opl-flow',
    '# forbidden_package_casks: mas,mag,rca,oma,obf,mas-scholar-skills,opl-flow',
    '# must_not_write_user_codex_state: true',
    '# must_not_define_agent_semantics: true',
  );
  lines.push('# OPL_HOMEBREW_BOUNDARY_END');
  return lines.join('\n');
}

function renderHomebrewVersion(options: ResolvedOptions): string {
  return options.updaterVersion === options.version
    ? options.updaterVersion
    : `${options.updaterVersion},${options.version}`;
}

function renderHomebrewDownloadUrl(targetPath: string, options: ResolvedOptions): string {
  void targetPath;
  if (options.updaterVersion === options.version) return options.downloadUrl;
  if (!options.downloadUrl.includes(options.version)) {
    throw new Error('Homebrew download URL must include display_version when updater_version differs.');
  }
  return options.downloadUrl.replaceAll(options.version, '#{version.csv.second}');
}

function skeletonContent(targetPath: string, options: ResolvedOptions): string {
  const token = path.basename(targetPath, '.rb');
  const fullFirstInstall = options.packageKind === 'app_full_first_install';
  const conflicts = caskConflictMap[token] ?? [];
  if (classifyTarget(targetPath) === 'formula') {
    throw new Error('Homebrew tap updates are App cask-only; OPL Packages are Framework-managed, not Homebrew formulae.');
  }
  return [
    `cask "${token}" do`,
    `  version "${renderHomebrewVersion(options)}"`,
    `  sha256 "${options.checksumSha256}"`,
    '',
    `  url "${renderHomebrewDownloadUrl(targetPath, options)}"`,
    `  name "${fullFirstInstall ? 'One Person Lab Full' : 'One Person Lab'}"`,
    `  desc "${fullFirstInstall ? 'Complete first-install package for One Person Lab' : 'AI-first desktop research and agent orchestration app'}"`,
    '  homepage "https://github.com/gaofeng21cn/one-person-lab-app"',
    '',
    '  livecheck do',
    `    skip "${options.channel === 'nightly'
      ? 'Nightly casks track prerelease cohorts through App release automation'
      : 'The immutable Release Bundle maps display tags to monotonic machine versions'}"`,
    '  end',
    '',
    ...(conflicts.length > 0
      ? [
          `  conflicts_with cask: ${conflicts.length === 1
            ? `"${conflicts[0]}"`
            : `[${conflicts.map((conflict) => `"${conflict}"`).join(', ')}]`}`,
        ]
      : []),
    ...(fullFirstInstall ? [] : ['  depends_on formula: "opl"']),
    '  depends_on macos: :monterey',
    '  depends_on arch: :arm64',
    '',
    `  ${boundaryBlock(options).split('\n').join('\n  ')}`,
    '',
    '  app "One Person Lab.app"',
    ...(fullFirstInstall
      ? [
          '',
          '  caveats <<~EOS',
          '    This cask installs the complete first-install package. After launch,',
          '    One Person Lab manages runtime, Packages, and Agent exposure through',
          '    the App/CLI; Full assets stay outside standard updater metadata.',
          '  EOS',
        ]
      : []),
    'end',
    '',
  ].join('\n');
}

function reconcileFormulaDependency(content: string, options: ResolvedOptions): string {
  const formulaDependency = /^[ \t]*depends_on formula: ["'](?:gaofeng21cn\/one-person-lab\/)?opl["'][ \t]*\n?/gm;
  if (options.packageKind === 'app_full_first_install') {
    return content.replace(formulaDependency, '');
  }
  if (formulaDependency.test(content)) {
    return content;
  }
  const macosDependency = /^([ \t]*depends_on macos:)/m;
  if (macosDependency.test(content)) {
    return content.replace(macosDependency, '  depends_on formula: "opl"\n$1');
  }
  return content.replace(/\nend\s*\n?$/, '\n  depends_on formula: "opl"\nend\n');
}

function updateContent(content: string, targetPath: string, options: ResolvedOptions): string {
  void content;
  let next = skeletonContent(targetPath, options);
  next = next.replace(/(version\s+)["'][^"']+["']/, `$1"${renderHomebrewVersion(options)}"`);
  next = next.replace(/(sha256\s+)["'][^"']+["']/, `$1"${options.checksumSha256}"`);
  next = next.replace(/(url\s+)["'][^"']+["']/, `$1"${renderHomebrewDownloadUrl(targetPath, options)}"`);
  next = reconcileFormulaDependency(next, options);
  if (!next.endsWith('\n')) next += '\n';
  return next;
}

function validateUpdatedContent(target: TapUpdateTarget, options: ResolvedOptions): void {
  const homebrewVersion = renderHomebrewVersion(options);
  if (!target.content.includes(`version "${homebrewVersion}"`)) {
    throw new Error(`${target.path} must use updater_version first for Homebrew ordering.`);
  }
  for (const identityLine of [
    `display_version: ${options.version}`,
    `updater_version: ${options.updaterVersion}`,
  ]) {
    if (!target.content.includes(identityLine)) {
      throw new Error(`${target.path} must bind both display and updater versions.`);
    }
  }
  if (options.packageKind === 'app_full_first_install') {
    assertFullPayloadReference('Homebrew tap content', target.content);
  } else {
    assertNoFullPayloadReference('Homebrew tap content', target.content);
  }
  if (target.kind !== 'cask') {
    throw new Error(`${target.path} must be an App cask target.`);
  }
  const hasFormulaDependency = /depends_on formula: ["'](?:gaofeng21cn\/one-person-lab\/)?opl["']/.test(target.content);
  if (options.packageKind === 'app_full_first_install' && hasFormulaDependency) {
    throw new Error(`${target.path} must use the Full DMG embedded Base and must not install the opl formula carrier.`);
  }
  if (options.packageKind === 'app_standard' && !hasFormulaDependency) {
    throw new Error(`${target.path} must install the Framework-owned opl formula carrier.`);
  }
  if (!target.content.includes(options.manifestUrl)) {
    throw new Error(`${target.path} must reference the release manifest URL.`);
  }
  const expectedDownloadUrl = renderHomebrewDownloadUrl(target.path, options);
  if (!target.content.includes(expectedDownloadUrl)) {
    throw new Error(`${target.path} must reference the release download URL.`);
  }
  if (!target.content.includes(options.checksumSha256)) {
    throw new Error(`${target.path} must reference the SHA-256 checksum.`);
  }
  if (!target.content.includes('stable_promotion_from_nightly_allowed: false')) {
    throw new Error(`${target.path} must declare that stable promotion is not automatic from nightly.`);
  }
  if (options.packageKind === 'app_full_first_install') {
    for (const required of [
      'package_kind: app_full_first_install',
      'full_first_install_allowed: true',
      'standard_updater_visible: false',
      'cohort: full_first_install_homebrew_distribution',
      'bundled_full_runtime_payload_allowed: true',
      'formula_dependency_required: false',
      'framework_carrier: full_dmg_embedded_opl_base',
      'active_framework_count_target: 1',
    ]) {
      if (!target.content.includes(required)) {
        throw new Error(`${target.path} must declare Full first-install cask boundaries.`);
      }
    }
  } else {
    for (const required of [
      'full_first_install_allowed: false',
      'formula_dependency_required: true',
      'framework_carrier: homebrew_formula_opl',
      'active_framework_count_target: 1',
    ]) {
      if (!target.content.includes(required)) {
        throw new Error(`${target.path} must declare Standard Homebrew Framework carrier boundaries.`);
      }
    }
  }
  const token = path.basename(target.path, '.rb');
  for (const conflictingCask of caskConflictMap[token] ?? []) {
    if (!target.content.includes(`"${conflictingCask}"`)) {
      throw new Error(`${target.path} must declare Homebrew cask conflict with ${conflictingCask}.`);
    }
  }
  for (const required of [
    'homebrew_allowed_software_objects: opl_base,opl_app',
    'opl_packages_lifecycle_owned_by_homebrew: false',
    'opl_packages_lifecycle_owner: one-person-lab',
    'opl_packages_lifecycle_command: opl packages',
    'package_specific_formula_allowed: false',
    'package_specific_cask_allowed: false',
    'forbidden_package_formulae: mas,mag,rca,oma,obf,mas-scholar-skills,opl-flow',
    'forbidden_package_casks: mas,mag,rca,oma,obf,mas-scholar-skills,opl-flow',
    'must_not_write_user_codex_state: true',
    'must_not_define_agent_semantics: true',
  ]) {
    if (!target.content.includes(required)) {
      throw new Error(`${target.path} must declare Framework-managed OPL Packages boundaries.`);
    }
  }
}

function buildPlan(inputOptions: Options): {
  schema: 'opl_homebrew_tap_cas_plan.v1';
  channel: Channel;
  package_kind: PackageKind;
  version: string;
  display_version: string;
  updater_version: string;
  dry_run: boolean;
  manifest_url: string;
  checksum_sha256: string;
  download_url: string;
  targets: Array<Omit<TapUpdateTarget, 'content'>>;
  cas: {
    decision: TapCasDecision;
    reason: string;
    expected_current_cask_sha256: string | null;
    write_performed: boolean;
  };
  policy: Record<string, boolean | number | string>;
} {
  const options = validateOptions(inputOptions);
  const targets = options.targets.map((targetPath): TapUpdateTarget => {
    const absolutePath = path.join(options.tapRoot, targetPath);
    const previousExists = fs.existsSync(absolutePath);
    const previous = previousExists ? fs.readFileSync(absolutePath, 'utf8') : '';
    const content = updateContent(previous, targetPath, options);
    const currentDisplayVersion = boundaryValue(previous, 'display_version');
    const currentUpdaterVersion = boundaryValue(previous, 'updater_version') ?? rubyValue(previous, 'version');
    const target = {
      path: targetPath,
      kind: classifyTarget(targetPath),
      previous_exists: previousExists,
      changed: previous !== content,
      same_candidate_version: currentDisplayVersion === options.version || currentUpdaterVersion === options.updaterVersion,
      current_display_version: currentDisplayVersion,
      current_updater_version: currentUpdaterVersion,
      current_dmg_sha256: rubyValue(previous, 'sha256')
        ? `sha256:${rubyValue(previous, 'sha256')}`
        : null,
      current_cask_sha256: previousExists ? sha256(previous) : null,
      expected_cask_sha256: sha256(content),
      content,
    };
    validateUpdatedContent(target, options);
    return target;
  });

  const sameVersionChanged = targets.some((target) => target.changed && target.same_candidate_version);
  const decision: TapCasDecision = sameVersionChanged && options.channel === 'nightly'
    ? 'version_conflict'
    : targets.some((target) => target.changed)
      ? 'write_once'
      : 'idempotent';
  const reason = decision === 'version_conflict'
    ? 'nightly_candidate_version_conflicts_with_existing_bytes_require_new_revision'
    : decision === 'write_once'
      ? sameVersionChanged
        ? 'stable_same_tag_replacement_requires_exact_current_cask_cas'
        : 'different_or_missing_version_requires_one_write'
      : 'exact_candidate_bytes_already_present';

  if (options.write) {
    if (decision === 'version_conflict') {
      throw new Error('Nightly Homebrew candidate version already exists with different Cask or DMG bytes; allocate a Nightly revision.');
    }
    if (options.expectedCurrentCaskSha256 !== null) {
      if (targets.length !== 1) {
        throw new Error('--expected-current-cask-sha256 requires exactly one Cask target.');
      }
      const actual = targets[0]?.current_cask_sha256 ?? 'absent';
      if (actual !== options.expectedCurrentCaskSha256) {
        throw new Error(`Homebrew Cask CAS mismatch: expected ${options.expectedCurrentCaskSha256}, found ${actual}.`);
      }
    }
    for (const target of targets.filter((candidate) => candidate.changed)) {
      const absolutePath = path.join(options.tapRoot, target.path);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, target.content, 'utf8');
    }
  }

  return {
    schema: 'opl_homebrew_tap_cas_plan.v1',
    channel: options.channel,
    package_kind: options.packageKind,
    version: options.version,
    display_version: options.version,
    updater_version: options.updaterVersion,
    dry_run: !options.write,
    manifest_url: options.manifestUrl,
    checksum_sha256: options.checksumSha256,
    download_url: options.downloadUrl,
    targets: targets.map(({ content: _content, ...target }) => target),
    cas: {
      decision,
      reason,
      expected_current_cask_sha256: options.expectedCurrentCaskSha256,
      write_performed: options.write && decision === 'write_once',
    },
    policy: {
      cohort: options.packageKind === 'app_full_first_install'
        ? 'full_first_install_homebrew_distribution'
        : 'standard_desktop_homebrew_distribution',
      manifest_required: true,
      checksum_required: true,
      nightly_targets_only_for_nightly: true,
      stable_promotion_from_nightly_allowed: false,
      full_first_install_allowed: options.packageKind === 'app_full_first_install',
      standard_updater_visible: options.packageKind !== 'app_full_first_install',
      full_cask_install_surface: options.packageKind === 'app_full_first_install',
      bundled_full_runtime_payload_allowed: options.packageKind === 'app_full_first_install',
      formula_dependency_required: options.packageKind !== 'app_full_first_install',
      framework_carrier: options.packageKind === 'app_full_first_install'
        ? 'full_dmg_embedded_opl_base'
        : 'homebrew_formula_opl',
      active_framework_count_target: 1,
      homebrew_allowed_software_objects: 'opl_base,opl_app',
      opl_packages_lifecycle_owned_by_homebrew: false,
      opl_packages_lifecycle_owner: 'one-person-lab',
      opl_packages_lifecycle_command: 'opl packages',
      package_specific_formula_allowed: false,
      package_specific_cask_allowed: false,
      must_not_write_user_codex_state: true,
      must_not_define_agent_semantics: true,
      publishes_or_pushes_remote: options.remoteWriteMode === 'direct_commit',
      remote_write_mode: options.remoteWriteMode,
    },
  };
}

function runSelfCheck(): void {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-tap-'));
  const digest = 'a'.repeat(64);
  const stablePlan = buildPlan({
    channel: 'stable',
    packageKind: 'app_standard',
    version: '26.6.4',
    updaterVersion: resolveReleaseVersionIdentity('stable', '26.6.4').updaterVersion,
    tapRoot: tempRoot,
    manifestUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/latest-arm64-mac.yml',
    checksumSha256: digest,
    downloadUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/One-Person-Lab-26.6.4-mac-arm64.dmg',
    targets: ['Casks/one-person-lab.rb'],
    write: true,
    summaryPath: null,
    remoteWriteMode: 'none',
    expectedCurrentCaskSha256: null,
    selfCheck: false,
  });
  if (stablePlan.dry_run || !stablePlan.policy.manifest_required || !stablePlan.policy.checksum_required) {
    throw new Error('Homebrew stable self-check did not produce the required manifest/checksum policy.');
  }
  const stableCask = fs.readFileSync(path.join(tempRoot, 'Casks/one-person-lab.rb'), 'utf8');
  if (
    !stableCask.includes('depends_on formula: "opl"')
    || stablePlan.policy.formula_dependency_required !== true
    || stablePlan.policy.framework_carrier !== 'homebrew_formula_opl'
    || stablePlan.policy.active_framework_count_target !== 1
  ) {
    throw new Error('Homebrew Standard self-check did not retain the opl Formula as its single Base carrier.');
  }

  const fullPlan = buildPlan({
    channel: 'stable',
    packageKind: 'app_full_first_install',
    version: '26.6.4',
    updaterVersion: resolveReleaseVersionIdentity('stable', '26.6.4').updaterVersion,
    tapRoot: tempRoot,
    manifestUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/${fullReleaseManifestName}`,
    checksumSha256: digest,
    downloadUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/One-Person-Lab-Full-26.6.4-mac-arm64.dmg',
    targets: ['Casks/one-person-lab-full.rb'],
    write: true,
    summaryPath: null,
    remoteWriteMode: 'none',
    expectedCurrentCaskSha256: null,
    selfCheck: false,
  });
  if (!fullPlan.policy.full_first_install_allowed || fullPlan.policy.standard_updater_visible) {
    throw new Error('Homebrew Full self-check did not keep Full cask outside standard updater visibility.');
  }
  const fullCask = fs.readFileSync(path.join(tempRoot, 'Casks/one-person-lab-full.rb'), 'utf8');
  if (
    fullCask.includes('depends_on formula: "opl"')
    || fullPlan.policy.formula_dependency_required !== false
    || fullPlan.policy.framework_carrier !== 'full_dmg_embedded_opl_base'
    || fullPlan.policy.active_framework_count_target !== 1
  ) {
    throw new Error('Homebrew Full self-check did not use the embedded Base as its single Framework carrier.');
  }

  const nightlyVersion = '26.6.4-nightly.r1';
  const nightlyPlan = buildPlan({
    channel: 'nightly',
    packageKind: 'app_standard',
    version: nightlyVersion,
    updaterVersion: resolveReleaseVersionIdentity('nightly', nightlyVersion).updaterVersion,
    tapRoot: tempRoot,
    manifestUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${nightlyVersion}/opl-app-component-manifest.json`,
    checksumSha256: digest,
    downloadUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${nightlyVersion}/One-Person-Lab-${nightlyVersion}-mac-arm64.dmg`,
    targets: ['Casks/one-person-lab-nightly.rb'],
    write: true,
    summaryPath: null,
    remoteWriteMode: 'none',
    expectedCurrentCaskSha256: null,
    selfCheck: false,
  });
  if (
    nightlyPlan.channel !== 'nightly'
    || nightlyPlan.package_kind !== 'app_standard'
    || nightlyPlan.policy.full_first_install_allowed !== false
    || nightlyPlan.policy.standard_updater_visible !== true
  ) {
    throw new Error('Homebrew Nightly self-check did not remain a Standard-only App cask.');
  }

  let rejectedPackageBundleKind = false;
  try {
    parseArgs(['--package-kind', 'package_bundle']);
  } catch (error) {
    rejectedPackageBundleKind = String(error).includes('App cask-only');
  }
  if (!rejectedPackageBundleKind) {
    throw new Error('Homebrew self-check did not reject Package-bundle kind.');
  }

  for (const blocked of [
    {
      channel: 'stable' as Channel,
      packageKind: 'app_standard' as PackageKind,
      version: '26.6.4-nightly.r1',
      targets: ['Casks/one-person-lab.rb'],
      message: 'Stable Homebrew tap updates must use YY.M.D',
    },
    {
      channel: 'stable' as Channel,
      packageKind: 'app_standard' as PackageKind,
      version: '026.06.04',
      targets: ['Casks/one-person-lab.rb'],
      message: 'Stable Homebrew tap updates must use YY.M.D',
    },
    {
      channel: 'stable' as Channel,
      packageKind: 'app_standard' as PackageKind,
      version: '26.6.4',
      targets: ['Formula/mag.rb'],
      message: 'App cask-only',
    },
    {
      channel: 'stable' as Channel,
      packageKind: 'app_standard' as PackageKind,
      version: '26.6.4',
      manifestUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/opl-release-manifest.json',
      downloadUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/One-Person-Lab-26.6.4-mac-arm64.dmg',
      targets: ['Casks/one-person-lab.rb'],
      message: 'Full first-install payloads',
    },
    {
      channel: 'stable' as Channel,
      packageKind: 'app_full_first_install' as PackageKind,
      version: '26.6.4',
      manifestUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/${legacyFullReleaseManifestName}`,
      targets: ['Casks/one-person-lab-full.rb'],
      message: fullReleaseManifestName,
    },
    {
      channel: 'nightly' as Channel,
      packageKind: 'app_full_first_install' as PackageKind,
      version: '26.6.4-nightly.r1',
      targets: ['Casks/one-person-lab-full.rb'],
      message: 'Full first-install Homebrew cask updates must stay on the stable channel',
    },
    {
      channel: 'stable' as Channel,
      packageKind: 'app_full_first_install' as PackageKind,
      version: '26.6.4',
      targets: ['Casks/one-person-lab.rb'],
      message: 'Full first-install Homebrew cask updates may only update Casks/one-person-lab-full.rb',
    },
  ]) {
    let failed = false;
    try {
      buildPlan({
        channel: blocked.channel,
        packageKind: blocked.packageKind,
        version: blocked.version,
        updaterVersion: blocked.version,
        tapRoot: tempRoot,
        manifestUrl: blocked.manifestUrl ?? (blocked.packageKind === 'app_full_first_install'
          ? `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/${fullReleaseManifestName}`
          : 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/latest-arm64-mac.yml'),
        checksumSha256: digest,
        downloadUrl: blocked.packageKind === 'app_full_first_install'
          ? 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/One-Person-Lab-Full-26.6.4-mac-arm64.dmg'
          : blocked.downloadUrl ?? 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.6.4/One-Person-Lab-26.6.4-mac-arm64.dmg',
        targets: blocked.targets,
        write: false,
        summaryPath: null,
        remoteWriteMode: 'none',
        expectedCurrentCaskSha256: null,
        selfCheck: false,
      });
    } catch (error) {
      failed = String(error).includes(blocked.message);
    }
    if (!failed) {
      throw new Error(`Homebrew self-check expected rejection containing: ${blocked.message}`);
    }
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfCheck) {
    runSelfCheck();
    console.log('PASS: Homebrew tap boundary validates Standard Formula and Full embedded-Base carriers, App cask-only manifest/checksum references, Full cask isolation, Framework-owned OPL Packages, and cohort separation.');
    return;
  }

  const plan = buildPlan(options);
  const output = `${JSON.stringify(plan, null, 2)}\n`;
  if (options.summaryPath) {
    fs.mkdirSync(path.dirname(options.summaryPath), { recursive: true });
    fs.writeFileSync(options.summaryPath, output, 'utf8');
  }
  process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
