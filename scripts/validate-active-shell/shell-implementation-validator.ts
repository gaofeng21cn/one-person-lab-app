import { validateStudioImplementation } from './studio-implementation-validator.ts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  readShellJson,
  readShellText,
} from './shell-implementation-helpers.ts';
import { root as appRoot } from './validation-config.ts';
import {
  validateShellBrandingAssets,
  validateShellVisibleBranding,
} from './shell-branding-validator.ts';
import { validateFirstRunImplementation } from './shell-first-run-validator.ts';
import { validateShellOrdinaryExperienceImplementation } from './shell-ordinary-experience-validator.ts';
import { validateShellSettingsAndTeamImplementation } from './shell-settings-and-team-validator.ts';
import { validateShellSubstrateImplementation } from './shell-substrate-validator.ts';
import { validateStandardUpdaterImplementation } from './shell-standard-updater-validator.ts';

const visualSourceContractPath = 'contracts/app-gui-visual-source-cohort.json';

function readVisualSourceContract(): Record<string, any> {
  return JSON.parse(readFileSync(path.join(appRoot, visualSourceContractPath), 'utf8'));
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function normalizedRelativePath(filePath: string, root: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(normalizedRelativePath(entryPath, root));
    }
  };
  visit(root);
  return files.sort();
}

function exactJson(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Validate the real Shell checkout's DSH source receipt and bytes. */
export function validateShellDshVisualSource(
  shellPaths: { shellRoot: string },
  visualSourceContract = readVisualSourceContract(),
): void {
  const upstream = visualSourceContract.upstream ?? {};
  const shellAdoption = visualSourceContract.shell_adoption ?? {};
  const manifestRelativePath = String(shellAdoption.required_source_manifest ?? '');
  const licenseRelativePath = String(shellAdoption.required_license_notice ?? '');
  if (!manifestRelativePath || !licenseRelativePath) {
    throw new Error('App DSH visual source contract must declare the Shell manifest and LICENSE paths');
  }

  const manifestPath = path.resolve(shellPaths.shellRoot, manifestRelativePath);
  const shellRoot = path.resolve(shellPaths.shellRoot);
  if (!isWithin(shellRoot, manifestPath)) {
    throw new Error('Active shell DSH visual source manifest must stay inside the Shell checkout');
  }
  const manifest = readShellJson(shellPaths, manifestRelativePath, 'DSH visual source manifest');
  const manifestUpstream = manifest.upstream ?? {};
  if (
    manifest.schema_version !== 1 ||
    manifest.schema !== 'opl_aionui_dsh_visual_source_manifest.v1' ||
    manifestUpstream.repository !== upstream.repository ||
    manifestUpstream.commit !== upstream.commit ||
    manifestUpstream.license !== upstream.license
  ) {
    throw new Error('Active shell DSH visual source manifest must bind the App-pinned repository, commit, and MIT license');
  }

  const sourcePolicy = manifest.source_policy ?? {};
  const allowedNormalizations = Array.isArray(shellAdoption.allowed_vendor_normalizations)
    ? shellAdoption.allowed_vendor_normalizations
    : [];
  if (
    sourcePolicy.app_contract !== visualSourceContractPath ||
    sourcePolicy.reuse_mode !== shellAdoption.reuse_mode ||
    sourcePolicy.vendored_files_byte_identical !== false ||
    !exactJson(sourcePolicy.import_path_normalizations, []) ||
    !exactJson(sourcePolicy.toolchain_compatibility_normalizations, allowedNormalizations) ||
    sourcePolicy.runtime_authority_imported !== false
  ) {
    throw new Error('Active shell DSH visual source manifest must preserve the bounded adapter-only source policy and declared normalizations');
  }

  const vendorRoot = path.dirname(manifestPath);
  const manifestInVendorRoot = normalizedRelativePath(manifestPath, vendorRoot);
  const vendoredFiles = Array.isArray(manifest.vendored_files) ? manifest.vendored_files : [];
  const expectedRuntimePaths = Array.isArray(visualSourceContract.runtime_vendored_source_paths)
    ? visualSourceContract.runtime_vendored_source_paths
    : [];
  const expectedPaths = [String(upstream.license_source_path ?? 'LICENSE'), ...expectedRuntimePaths];
  const actualPaths = vendoredFiles.map((entry) => String(entry?.path ?? ''));
  if (!exactJson(actualPaths, expectedPaths) || new Set(actualPaths).size !== actualPaths.length) {
    throw new Error('Active shell DSH visual source manifest must list exactly the pinned LICENSE and runtime source paths');
  }

  const excluded = Array.isArray(visualSourceContract.excluded_source_and_runtime)
    ? visualSourceContract.excluded_source_and_runtime.filter((entry) => typeof entry === 'string')
    : [];
  if (
    actualPaths.some((sourcePath) =>
      excluded.some((excludedPath) => sourcePath === excludedPath || sourcePath.startsWith(`${excludedPath}/`)),
    )
  ) {
    throw new Error('Active shell DSH visual source manifest must not vendor excluded runtime, session, or host paths');
  }

  const licensePath = path.resolve(shellPaths.shellRoot, licenseRelativePath);
  if (!isWithin(vendorRoot, licensePath) || normalizedRelativePath(licensePath, vendorRoot) !== String(upstream.license_source_path ?? 'LICENSE')) {
    throw new Error('Active shell DSH LICENSE must be the pinned root license notice beside the vendored source');
  }
  if (!statSync(licensePath).isFile()) {
    throw new Error('Active shell DSH LICENSE notice must be a regular file');
  }

  for (const entry of vendoredFiles) {
    const relativePath = String(entry?.path ?? '');
    const filePath = path.resolve(vendorRoot, relativePath);
    if (!isWithin(vendorRoot, filePath) || !statSync(filePath).isFile()) {
      throw new Error(`Active shell DSH manifest entry ${relativePath} must resolve to a vendored file`);
    }
    const actualHash = sha256File(filePath);
    if (entry.sha256 !== actualHash || !/^[a-f0-9]{64}$/.test(String(entry.sha256))) {
      throw new Error(`Active shell DSH manifest entry ${relativePath} must match its SHA-256 (${entry.sha256 ?? '<missing>'} != ${actualHash})`);
    }
    const normalization = allowedNormalizations.find((candidate) => candidate?.path === relativePath);
    if (normalization) {
      if (
        entry.normalization !== normalization.kind ||
        !/^[a-f0-9]{64}$/.test(String(entry.upstream_sha256 ?? ''))
      ) {
        throw new Error(`Active shell DSH normalized entry ${relativePath} must declare its normalization and upstream SHA-256`);
      }
    } else if (entry.normalization !== undefined || entry.upstream_sha256 !== undefined) {
      throw new Error(`Active shell DSH entry ${relativePath} contains an undeclared normalization`);
    }
  }

  const expectedVendorFiles = [...expectedPaths, manifestInVendorRoot].sort();
  const actualVendorFiles = listFiles(vendorRoot);
  if (!exactJson(actualVendorFiles, expectedVendorFiles)) {
    throw new Error('Active shell DSH vendor directory must contain only the manifest, LICENSE, and declared source files');
  }

  const expectedReferenceFiles = [
    ...(Array.isArray(visualSourceContract.adapter_reference_source_paths)
      ? visualSourceContract.adapter_reference_source_paths.map((sourcePath) => ({ path: sourcePath, status: 'adapter_reference_only' }))
      : []),
    ...(Array.isArray(visualSourceContract.deferred_reference_source_paths)
      ? visualSourceContract.deferred_reference_source_paths.map((sourcePath) => ({ path: sourcePath, status: 'deferred' }))
      : []),
  ];
  const actualReferenceFiles = Array.isArray(manifest.reference_files)
    ? manifest.reference_files.map((entry) => ({ path: entry?.path, status: entry?.status }))
    : [];
  if (!exactJson(actualReferenceFiles, expectedReferenceFiles)) {
    throw new Error('Active shell DSH visual source manifest must preserve the App reference/deferred source inventory');
  }
}

export function resolveShellDshVisualSourceMode(
  shellPaths: { shellRoot: string },
  visualSourceContract = readVisualSourceContract(),
): boolean {
  const manifestRelativePath = String(
    visualSourceContract.shell_adoption?.required_source_manifest ?? '',
  );
  const manifestPresent = manifestRelativePath.length > 0
    && existsSync(path.resolve(shellPaths.shellRoot, manifestRelativePath));
  const implementationClaimed = visualSourceContract.evidence_boundary?.shell_source_implemented === true;

  if (!manifestPresent) {
    if (implementationClaimed) {
      validateShellDshVisualSource(shellPaths, visualSourceContract);
    }
    return false;
  }

  validateShellDshVisualSource(shellPaths, visualSourceContract);
  return true;
}

export function validateShellVisualTokenBindings({
  layout,
  productBaseline,
  unoConfig,
}: {
  layout: string;
  productBaseline: string;
  unoConfig: string;
}, dshVisualSourceImplemented = true): void {
  const expectedTokenBindings = dshVisualSourceImplemented
    ? [
        '--opl-sidebar-bg: var(--dsw-specific-sidebar-fill);',
        '--opl-main-bg: var(--dsw-alias-bg-base);',
        '--text-primary: var(--dsw-alias-label-primary);',
        '--opl-focus-ring: var(--dsw-alias-state-business-primary);',
      ]
    : [
        '--opl-sidebar-bg: #fcfcfc;',
        '--opl-sidebar-bg: #1b1c1e;',
        '--text-primary: var(--color-text-1);',
      ];
  for (const expected of expectedTokenBindings) {
    if (!productBaseline.includes(expected)) {
      throw new Error(`Active shell OPL product visual baseline must include ${expected}`);
    }
  }
  const railBlock = productBaseline.match(/\.layout-sider\.arco-layout-sider\s*\{([^}]*)\}/)?.[1] ?? '';
  if (!railBlock.includes('background: var(--opl-sidebar-bg);')) {
    throw new Error('Active shell navigation rail must consume --opl-sidebar-bg directly');
  }
  const bodyBlock = productBaseline.match(/body\s*\{([^}]*)\}/)?.[1] ?? '';
  if (!bodyBlock.includes('color: var(--text-primary);')) {
    throw new Error('Active shell body text must consume the --text-primary semantic bridge');
  }
  for (const expected of [
    "'t-primary': 'var(--text-primary)'",
    "'t-tertiary': 'var(--color-text-3)'",
  ]) {
    if (!unoConfig.includes(expected)) {
      throw new Error(`Active shell Uno semantic text colors must include ${expected}`);
    }
  }
  const siderStart = layout.indexOf('<ArcoLayout.Sider');
  const siderEnd = layout.indexOf('<ArcoLayout.Header', siderStart);
  const siderDeclaration = siderStart >= 0 && siderEnd > siderStart ? layout.slice(siderStart, siderEnd) : '';
  if (/(?:^|[\s'"`])!?bg-(?:\[[^\]]+\]|[^\s'"`}]+)/m.test(siderDeclaration)) {
    throw new Error('Active shell Layout navigation rail must not override --opl-sidebar-bg with a background utility');
  }
  if (!siderDeclaration.includes("className={classNames('layout-sider', {")) {
    throw new Error('Active shell Layout navigation rail must keep layout-sider as its unstyled structural class');
  }
}

export function validateActiveShellImplementation(shellPaths) {
  if (shellPaths.contract.active_shell === 'opl-studio') {
    validateStudioImplementation(shellPaths);
    return;
  }
  if (shellPaths.contract.shell_contract?.implementation_validation === 'contract_paths_only') {
    return;
  }

  const visualSourceContract = readVisualSourceContract();
  const dshVisualSourceImplemented = resolveShellDshVisualSourceMode(
    shellPaths,
    visualSourceContract,
  );

  const i18nConfig = JSON.parse(
    readShellText(shellPaths, 'packages/desktop/src/common/config/i18n-config.json'),
  );
  const supportedLanguages = Array.isArray(i18nConfig.supportedLanguages)
    ? i18nConfig.supportedLanguages.filter((language) => typeof language === 'string')
    : [];
  const requiresLocale = (language) => supportedLanguages.includes(language);

  validateShellVisibleBranding(shellPaths, requiresLocale, dshVisualSourceImplemented);

  validateShellSubstrateImplementation(shellPaths, requiresLocale);
  validateStandardUpdaterImplementation(shellPaths);
  validateFirstRunImplementation(shellPaths);
  validateShellOrdinaryExperienceImplementation(shellPaths, dshVisualSourceImplemented);
  validateShellSettingsAndTeamImplementation(shellPaths, dshVisualSourceImplemented);

  const builtinThemes = readShellText(shellPaths, 'packages/desktop/src/renderer/theme/builtinThemes.ts');
  for (const forbidden of ['CODEX_THEME_ID', 'opl-codex.css?raw', "'Codex'"]) {
    if (builtinThemes.includes(forbidden)) {
      throw new Error(`Active shell must not expose the retired Codex theme preset marker ${forbidden}`);
    }
  }
  const themeIndex = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/styles/themes/index.css',
  );
  if (!themeIndex.includes("@import './opl-product-baseline.css'")) {
    throw new Error('Active shell theme index must load the always-on OPL product visual baseline.');
  }
  const productBaseline = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/styles/themes/opl-product-baseline.css',
  );
  const layout = readShellText(shellPaths, 'packages/desktop/src/renderer/components/layout/Layout.tsx');
  const unoConfig = readShellText(shellPaths, 'uno.config.ts');
  validateShellVisualTokenBindings(
    { layout, productBaseline, unoConfig },
    dshVisualSourceImplemented,
  );
  for (const expected of ['--opl-sidebar-bg', '--opl-main-bg', '--opl-focus-ring']) {
    if (!productBaseline.includes(expected)) {
      throw new Error(`Active shell OPL product visual baseline must include ${expected}`);
    }
  }
  for (const forbidden of ['!important', 'url(', 'data:image']) {
    if (productBaseline.includes(forbidden)) {
      throw new Error(`Active shell OPL product visual baseline must not include brittle marker ${forbidden}`);
    }
  }

  const about = readShellText(
    shellPaths,
    'packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx',
  );
  for (const expected of [
    'useOplAppState',
    'guiVersion',
    'frameworkRevision',
    'resolveUpdaterReleaseChannel',
    "useOplAppState('fast', { autoLoad: false })",
  ]) {
    if (!about.includes(expected)) {
      throw new Error(`Active shell About page must implement ${expected}`);
    }
  }
  if (/AionUI version|Aion UI version/.test(about)) {
    throw new Error('Active shell About page must not present AionUI as the App version.');
  }

  validateShellBrandingAssets(shellPaths);
}
