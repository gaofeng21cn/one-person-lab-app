type PolicyFields = Record<string, unknown>;
type JsonRecord = Record<string, any>;

function matchesFields(actual: PolicyFields | null | undefined, expected: PolicyFields): boolean {
  return Object.entries(expected).every(([field, value]) => actual?.[field] === value);
}

export function matchesHomebrewTapFollowerPolicy(tapUpdate: JsonRecord | null | undefined): boolean {
  const stableFollowups = '.github/workflows/release-stable-post-success-followups.yml';
  const standardOperation = 'reconcile_homebrew_standard';
  const standardMode = 'post_publication_digest_bound_cas_follower';
  const singleAttemptMode = 'post_publication_digest_bound_single_attempt_follower';
  const unknownResultPolicy = 'fail_closed_no_retry_rerun_or_redispatch';

  return (
    matchesFields(tapUpdate, {
      default_workflow: stableFollowups,
      default_operation: standardOperation,
      stable_release_workflow_write_mode: 'post_publication_non_blocking_follower',
    })
    && matchesFields(tapUpdate?.nightly, {
      mode: singleAttemptMode,
      workflow: '.github/workflows/release-nightly-followups.yml',
      operation: 'reconcile_homebrew',
      environment: 'release-nightly',
      target: 'Casks/one-person-lab-nightly.rb',
      may_update_stable: false,
      mutation_allowed: true,
      stable_cask_must_remain_exact: true,
      unknown_or_conflicting_result: unknownResultPolicy,
    })
    && matchesFields(tapUpdate?.nightly?.credential, {
      kind: 'repository_scoped_write_deploy_key',
      repository: 'gaofeng21cn/homebrew-one-person-lab',
      secret: 'release-nightly.OPL_HOMEBREW_TAP_DEPLOY_KEY',
      stable_environment_credentials_reused: false,
    })
    && matchesFields(tapUpdate?.stable, {
      mode: standardMode,
      publication_mode: standardMode,
      workflow: stableFollowups,
      operation: standardOperation,
      environment: 'release-stable',
      target: 'Casks/one-person-lab.rb',
      source_completed_stage: 'standard_public_and_latest_activated',
      mutation_allowed: true,
      core_release_or_latest_blocking: false,
      same_tag_replacement_allowed: true,
      new_release_version_required_for_changed_bytes: false,
      exact_current_cask_sha256_cas_required: true,
      fresh_cas_rerun_allowed: true,
      may_consume_nightly_directly: false,
    })
    && matchesFields(tapUpdate?.full, {
      mode: singleAttemptMode,
      workflow: stableFollowups,
      operation: 'reconcile_homebrew_full',
      environment: 'release-stable',
      target: 'Casks/one-person-lab-full.rb',
      homebrew_publish_allowed: true,
      mutation_allowed: true,
      source_completed_stage: 'full_qualified',
      homebrew_clean_vm_gate_required: false,
      framework_carrier: 'full_dmg_embedded_opl_base',
      formula_dependency_required: false,
      promotion_status: 'approved_pending_first_protected_follower_readback',
      unknown_or_conflicting_result: unknownResultPolicy,
    })
  );
}
