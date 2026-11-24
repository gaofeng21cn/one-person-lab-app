function assertRetiredReleaseControlPlaneAbsent(releaseChannel) {
  const forbiddenKeys = new Set([
    'stable_release_state_machine',
    'cohort_prepare',
    'release_operator',
    'release_monitor',
    'gate_reuse',
    'publish_resume',
    'post_owner_receipt_fast_path',
    'broker_authority_gate',
    'promotion_saga',
    'attempt_ledger',
    'signed_mutation_authority',
  ]);
  const forbiddenWorkflowValues = new Set([
    '.github/workflows/desktop-release.yml',
    '.github/workflows/desktop-release-promote.yml',
    '.github/workflows/desktop-release-full-addon.yml',
  ]);

  const visit = (value, path = 'release_channel') => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = `${path}.${key}`;
      if (forbiddenKeys.has(key)) {
        throw new Error(`Retired release control-plane field remains live at ${entryPath}`);
      }
      if (typeof entry === 'string' && forbiddenWorkflowValues.has(entry)) {
        throw new Error(`Retired release writer workflow remains live at ${entryPath}`);
      }
      if (entry === 'release_operator_plan') {
        throw new Error(`Retired release operator admission remains live at ${entryPath}`);
      }
      visit(entry, entryPath);
    }
  };

  visit(releaseChannel);
}

export { assertRetiredReleaseControlPlaneAbsent };
