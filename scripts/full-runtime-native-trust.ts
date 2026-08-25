function requiredFullRuntimeNativeTrustPaths(manifest: any): string[] {
  const temporalBinaryPath = manifest?.components?.temporal_cli?.binary_path;
  return [
    'runtime/current/node/bin/node',
    ...(typeof temporalBinaryPath === 'string' && temporalBinaryPath
      ? [temporalBinaryPath]
      : []),
  ];
}

function productionSignatureKind(entry: any): string {
  if (typeof entry?.signature_kind === 'string') {
    return entry.signature_kind;
  }
  if (entry?.signature === 'adhoc') {
    return 'adhoc';
  }
  return typeof entry?.signature === 'string'
    && entry.signature.startsWith('Developer ID Application:')
    ? 'developer_id_application'
    : entry?.signature ? 'other' : 'missing';
}

export function assertFullRuntimeNativeTrustObject(
  trust: any,
  manifest: any,
  options: {
    missingMessage?: string;
    requireProductionTrust?: boolean;
    expectedTeamIdentifier?: string;
  } = {},
): void {
  if (!trust || typeof trust !== 'object' || Array.isArray(trust)) {
    throw new Error(options.missingMessage ?? 'full-runtime-native-trust.json must record Full runtime native executable diagnostics.');
  }
  if (trust?.schema !== 'opl_full_runtime_native_trust.v1' || !['passed', 'local_authorized_unsigned', 'not_distributable', 'failed'].includes(trust?.status)) {
    throw new Error('full-runtime-native-trust.json must record Full runtime native executable diagnostics.');
  }
  const executables = Array.isArray(trust.executables) ? trust.executables : [];
  if (executables.length === 0 || trust.executable_count !== executables.length) {
    throw new Error('full-runtime-native-trust.json must list the checked native executables.');
  }
  for (const required of requiredFullRuntimeNativeTrustPaths(manifest)) {
    if (!executables.some((entry) => entry?.relative_path === required)) {
      throw new Error(`full-runtime-native-trust.json is missing ${required}.`);
    }
  }
  for (const entry of executables) {
    if (
      !['passed', 'failed_allowed_unsigned'].includes(entry?.codesign_status) ||
      !['passed', 'not_required', 'deferred_until_notarized_app', 'failed_allowed_unsigned'].includes(entry?.spctl_status) ||
      entry?.quarantine_status !== 'absent'
    ) {
      throw new Error(`Full runtime native executable is not locally authorized: ${entry?.relative_path || '(unknown)'}.`);
    }
  }
  if (options.requireProductionTrust) {
    if (!/^[A-Z0-9]{10}$/.test(options.expectedTeamIdentifier ?? '')) {
      throw new Error('Production Full runtime native trust requires an exact Apple Team ID.');
    }
    if (trust.status !== 'passed') {
      throw new Error(`Production Full runtime native trust must pass; got ${trust.status}.`);
    }
    for (const entry of executables) {
      if (
        entry?.codesign_status !== 'passed'
        || !['passed', 'not_required'].includes(entry?.spctl_status)
        || entry?.team_identifier !== options.expectedTeamIdentifier
        || !entry?.signature
        || entry.signature === 'adhoc'
        || productionSignatureKind(entry) !== 'developer_id_application'
        || entry?.trusted_timestamp !== true
        || entry?.hardened_runtime !== true
      ) {
        throw new Error(
          `Production Full runtime native executable does not match Team ID ${options.expectedTeamIdentifier}: `
          + `${entry?.relative_path || '(unknown)'}.`,
        );
      }
    }
  }
}
