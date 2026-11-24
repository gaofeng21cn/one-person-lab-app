// Canonical Homebrew App Cask renderer.
// Single source of truth: one-person-lab-app/scripts/homebrew-cask-renderer.mjs
// Downstream mirror: homebrew-one-person-lab/scripts/homebrew-cask-renderer.mjs

export const DEFAULT_APP_REPO = 'gaofeng21cn/one-person-lab-app';

export const CASK_CONFLICT_MAP = Object.freeze({
  'one-person-lab': ['one-person-lab-full', 'one-person-lab-nightly'],
  'one-person-lab-nightly': ['one-person-lab', 'one-person-lab-full'],
  'one-person-lab-full': ['one-person-lab', 'one-person-lab-nightly'],
});

export function renderHomebrewVersion({ version, updaterVersion = version }) {
  const resolvedUpdater = updaterVersion || version;
  return resolvedUpdater === version ? resolvedUpdater : `${resolvedUpdater},${version}`;
}

export function renderHomebrewDownloadUrl({
  version,
  updaterVersion = version,
  downloadUrl = null,
  packageKind = 'app_standard',
  dmgAssetName = null,
  appRepo = DEFAULT_APP_REPO,
}) {
  const resolvedUpdater = updaterVersion || version;
  const usesCsvVersion = resolvedUpdater !== version;
  if (downloadUrl) {
    if (!usesCsvVersion) return downloadUrl;
    if (!downloadUrl.includes(version)) {
      throw new Error('Homebrew download URL must include display_version when updater_version differs.');
    }
    return downloadUrl.replaceAll(version, '#{version.csv.second}');
  }
  const isFull = packageKind === 'app_full_first_install';
  const versionToken = usesCsvVersion ? '#{version.csv.second}' : '#{version}';
  const expectedPrefix = isFull ? 'One-Person-Lab-Full' : 'One-Person-Lab';
  const expectedDmgAssetName = `${expectedPrefix}-${version}-mac-arm64.dmg`;
  const renderedDmgAssetName = !dmgAssetName || dmgAssetName === expectedDmgAssetName
    ? `${expectedPrefix}-${versionToken}-mac-arm64.dmg`
    : dmgAssetName;
  return `https://github.com/${appRepo}/releases/download/v${versionToken}/${renderedDmgAssetName}`;
}

export function renderHomebrewBoundaryBlock({
  channel,
  packageKind = 'app_standard',
  version,
  updaterVersion = version,
  manifestUrl,
  checksumSha256,
  dependsOnOplFormula = packageKind !== 'app_full_first_install',
}) {
  const fullFirstInstall = packageKind === 'app_full_first_install';
  const normalizedChannel = fullFirstInstall ? 'stable' : channel;
  const resolvedUpdater = updaterVersion || version;
  const formulaRequired = fullFirstInstall ? false : Boolean(dependsOnOplFormula);
  return [
    '# OPL_HOMEBREW_BOUNDARY_START',
    `# channel: ${normalizedChannel}`,
    `# package_kind: ${packageKind}`,
    `# version: ${version}`,
    `# display_version: ${version}`,
    `# updater_version: ${resolvedUpdater}`,
    `# manifest: ${manifestUrl}`,
    `# checksum: sha256:${checksumSha256}`,
    '# downstream_mirror_only: true',
    '# release_truth_authority: app_release',
    '# failure_feedback_owner: app_release_operator',
    `# full_first_install_allowed: ${fullFirstInstall ? 'true' : 'false'}`,
    '# stable_promotion_from_nightly_allowed: false',
    '# publishes_or_pushes_remote: false',
    `# cohort: ${fullFirstInstall ? 'full_first_install_homebrew_distribution' : 'standard_desktop_homebrew_distribution'}`,
    `# standard_updater_visible: ${fullFirstInstall ? 'false' : 'true'}`,
    `# bundled_full_runtime_payload_allowed: ${fullFirstInstall ? 'true' : 'false'}`,
    `# formula_dependency_required: ${formulaRequired ? 'true' : 'false'}`,
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
    '# must_not_define_release_currentness: true',
    '# must_not_write_user_codex_state: true',
    '# must_not_define_agent_semantics: true',
    '# OPL_HOMEBREW_BOUNDARY_END',
  ].join('\n');
}

export function renderAppHomebrewCask({
  token = null,
  channel,
  packageKind = 'app_standard',
  version,
  updaterVersion = version,
  checksumSha256,
  manifestUrl,
  downloadUrl = null,
  dmgAssetName = null,
  dependsOnOplFormula = packageKind !== 'app_full_first_install',
  appRepo = DEFAULT_APP_REPO,
}) {
  const fullFirstInstall = packageKind === 'app_full_first_install';
  const normalizedChannel = fullFirstInstall ? 'stable' : channel;
  const resolvedToken = token
    || (normalizedChannel === 'nightly'
      ? 'one-person-lab-nightly'
      : fullFirstInstall
        ? 'one-person-lab-full'
        : 'one-person-lab');
  const conflicts = CASK_CONFLICT_MAP[resolvedToken] ?? [];
  const includeFormula = !fullFirstInstall && Boolean(dependsOnOplFormula);
  const boundary = renderHomebrewBoundaryBlock({
    channel: normalizedChannel,
    packageKind,
    version,
    updaterVersion,
    manifestUrl,
    checksumSha256,
    dependsOnOplFormula: includeFormula,
  });
  return [
    `cask "${resolvedToken}" do`,
    `  version "${renderHomebrewVersion({ version, updaterVersion })}"`,
    `  sha256 "${checksumSha256}"`,
    '',
    `  url "${renderHomebrewDownloadUrl({
      version,
      updaterVersion,
      downloadUrl,
      packageKind,
      dmgAssetName,
      appRepo,
    })}"`,
    `  name "${fullFirstInstall ? 'One Person Lab Full' : 'One Person Lab'}"`,
    `  desc "${fullFirstInstall ? 'Complete first-install package for One Person Lab' : 'AI-first desktop research and agent orchestration app'}"`,
    `  homepage "https://github.com/${appRepo}"`,
    '',
    '  livecheck do',
    `    skip "${normalizedChannel === 'nightly'
      ? 'Nightly casks track prerelease cohorts through App release automation'
      : 'Stable casks pair display tags with monotonic updater versions'}"`,
    '  end',
    '',
    ...(fullFirstInstall ? [] : ['  auto_updates true']),
    ...(conflicts.length > 0
      ? [
          `  conflicts_with cask: ${conflicts.length === 1
            ? `"${conflicts[0]}"`
            : `[${conflicts.map((conflict) => `"${conflict}"`).join(', ')}]`}`,
        ]
      : []),
    '  depends_on arch: :arm64',
    ...(includeFormula ? ['  depends_on formula: "opl"'] : []),
    '  depends_on macos: :ventura',
    '',
    `  ${boundary.split('\n').join('\n  ')}`,
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
