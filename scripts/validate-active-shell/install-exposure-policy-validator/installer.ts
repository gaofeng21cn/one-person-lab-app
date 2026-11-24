import { assertIncludesAll } from '../assertions.ts';
import { expectedFirstRunProgressModel } from './first-run.ts';
function validateInstallerSurfaces(policy) {
  const installerSurfaces = new Map((policy.installer_surfaces ?? []).map((entry) => [entry.surface, entry]));
  const reconcileRef = 'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation';
  for (const entry of installerSurfaces.values()) {
    if (typeof entry.app_runtime_carrier !== 'boolean') {
      throw new Error(`Install exposure surface ${entry.surface} must classify whether it launches an App runtime carrier`);
    }
    if (entry.app_runtime_carrier && entry.post_launch_reconcile_ref !== reconcileRef) {
      throw new Error(`Install exposure App runtime surface ${entry.surface} must use carrier-neutral Framework reconciliation`);
    }
    if (!entry.app_runtime_carrier && entry.post_launch_reconcile_ref) {
      throw new Error(`Install exposure non-App surface ${entry.surface} must not declare App carrier reconciliation`);
    }
  }
  for (const surface of ['app_first_run', 'full_first_install_dmg', 'standard_dmg', 'one_shot_cli_installer', 'docker_webui']) {
    const entry = installerSurfaces.get(surface);
    if (!entry) {
      throw new Error(`Install exposure policy missing installer surface ${surface}`);
    }
    if (entry.progress_source !== expectedFirstRunProgressModel.source_command) {
      throw new Error(`Install exposure surface ${surface} must use ${expectedFirstRunProgressModel.source_command}`);
    }
  }
  if (installerSurfaces.get('app_first_run')?.exposure_policy !== 'hide_skill_plugin_packaging_mechanics_by_default') {
    throw new Error('App first-run install exposure must hide skill/plugin packaging mechanics by default');
  }
  const directMacos = installerSurfaces.get('stable_local_authorized_macos_install');
  if (
    directMacos?.entrypoint !== 'install.sh --stable-macos-install --yes'
    || directMacos?.release_quality_source !== 'exact_component_manifest'
    || directMacos?.latest_pointer_is_quality_independent !== true
    || directMacos?.non_stable_disclosure_before_target_mutation !== true
    || JSON.stringify(directMacos?.compatibility_entrypoints) !== JSON.stringify([])
    || JSON.stringify(directMacos?.retired_entrypoints) !== JSON.stringify(['install-stable.sh'])
    || Object.hasOwn(directMacos ?? {}, 'stable_release_path')
  ) {
    throw new Error('Direct macOS install exposure must bind the exact component manifest without treating Latest as Stable.');
  }
  if (
    policy.distribution_install_model?.installer_convergence?.stable_macos_helper?.artifact_integrity
      ?.legacy_component_manifest_policy !==
    'allow_only_published_non_prerelease_pre_v3_manifest_with_quality_unasserted_disclosure'
  ) {
    throw new Error('Direct macOS install exposure must disclose its bounded legacy component-manifest policy.');
  }
  const forbiddenDependencyFields = [
    'capability_target_closure',
    'capability_source',
    'capability_projection',
    'resolution_policy',
    'optional_payload_policy',
    'missing_optional_payload_blocks_install_or_readiness',
  ];
  for (const surface of installerSurfaces.values()) {
    if (forbiddenDependencyFields.some((field) => field in surface)) {
      throw new Error('App installer surfaces must not own Package dependency or payload policy');
    }
  }
  const dockerWebui = installerSurfaces.get('docker_webui');
  if (dockerWebui?.entrypoint !== 'Docker/WebUI one-click installer') {
    throw new Error('Docker/WebUI install exposure must make the one-click installer the entrypoint');
  }
  if (dockerWebui.exposure_policy !== 'one_click_installer_is_beginner_default_with_manual_docker_as_advanced_troubleshooting_path') {
    throw new Error('Docker/WebUI install exposure must keep manual Docker commands as the advanced troubleshooting path');
  }
  if (dockerWebui.installer_model?.primary_user_path !== 'one_click_installer') {
    throw new Error('Docker/WebUI install exposure must declare one-click installer as the primary user path');
  }
  if (dockerWebui.installer_model?.linux_macos_shell_script !== 'install-docker-webui.sh') {
    throw new Error('Docker/WebUI install exposure must declare the Linux/macOS shell installer script artifact');
  }
  if (dockerWebui.installer_model?.windows_powershell_script !== 'install-docker-webui.ps1') {
    throw new Error('Docker/WebUI install exposure must declare the Windows PowerShell installer script artifact');
  }
  const dockerInstallerAssets = dockerWebui.installer_model?.installer_release_assets;
  if (
    dockerWebui.installer_model?.public_bootstrap_entrypoint !== 'opl-install.sh --container-webui' ||
    dockerWebui.installer_model?.development_bootstrap_entrypoint !==
      'reviewed_source_checkout_install.sh --container-webui' ||
    dockerWebui.installer_model?.installer_release_selector !==
      'github_latest_pointer_resolved_to_exact_release_record' ||
    dockerInstallerAssets?.linux_macos !==
      'exact_release_record_asset_url_for_install-docker-webui.sh' ||
    dockerInstallerAssets?.windows !==
      'exact_release_record_asset_url_for_install-docker-webui.ps1' ||
    dockerInstallerAssets?.same_name_size_digest_readback_required !== true ||
    dockerInstallerAssets?.attestation_payload_membership !== false
  ) {
    throw new Error('Docker/WebUI installer artifacts must resolve one exact GitHub Release before acquisition');
  }
  const acquisition = dockerWebui.installer_model?.acquisition_integrity;
  if (
    JSON.stringify(acquisition?.required_identity) !== JSON.stringify([
      'repository',
      'exact_release_tag',
      'asset_name',
      'exact_release_asset_url',
      'size_bytes',
      'sha256',
    ]) ||
    acquisition?.verified_cache !==
      'reuse_only_after_recomputing_cached_size_and_sha256_against_the_saved_exact_release_identity' ||
    acquisition?.metadata_or_network_outage !==
      'use_valid_verified_cache_or_block_only_this_new_acquisition' ||
    acquisition?.explicit_identity_mismatch !==
      'reject_new_bytes_preserve_prior_verified_cache_and_installed_webui' ||
    JSON.stringify(acquisition?.unverified_fallbacks) !== JSON.stringify([
      'mutable_main',
      'unverified_releases_latest_download',
      'different_or_historical_release_tag',
    ]) ||
    acquisition?.optional_attestation_outage !==
      'does_not_block_bytes_that_pass_required_exact_release_name_size_sha256_checks'
  ) {
    throw new Error('Docker/WebUI acquisition must preserve verified-cache fail-open semantics without unverified fallback');
  }
  if (
    !dockerWebui.installer_model?.linux_macos_online_command?.includes('./opl-install.sh --container-webui') ||
    dockerWebui.installer_model?.linux_macos_online_command?.includes('| bash')
  ) {
    throw new Error('Docker/WebUI install exposure must route public Linux/macOS acquisition through verified opl-install.sh');
  }
  if (
    dockerWebui.installer_model?.windows_online_command !==
      'resolve the GitHub Latest pointer to one exact Release record, verify or reuse cached install-docker-webui.ps1 by exact tag/name/url/size/SHA-256, then run with -EnableAutoUpdate -Yes'
  ) {
    throw new Error('Docker/WebUI install exposure must declare exact Release-bound Windows acquisition');
  }
  if (dockerWebui.installer_model?.windows_prerequisite_mode !== 'explicit_install_prerequisites_switch_requires_administrator') {
    throw new Error('Docker/WebUI install exposure must keep Windows Docker/WSL2 installation behind an explicit administrator prerequisite switch');
  }
  if (
    dockerWebui.installer_model?.default_image_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:stable' ||
    dockerWebui.installer_model?.explicit_preview_alias_ref !==
      'ghcr.io/gaofeng21cn/one-person-lab-webui:latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.linux_macos !==
      'install-docker-webui.sh --tag latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.windows !==
      'install-docker-webui.ps1 -Tag latest' ||
    dockerWebui.installer_model?.explicit_preview_entrypoints?.automatic_updates_allowed !== false
  ) {
    throw new Error('Docker/WebUI install exposure must default to Stable and keep Latest as explicit Preview opt-in');
  }
  const hostAutoUpdate = dockerWebui.installer_model?.host_auto_update;
  if (
    hostAutoUpdate?.scope !== 'optional_current_user_host_scheduler' ||
    hostAutoUpdate?.entrypoints?.linux_macos_enable !== 'install-docker-webui.sh --enable-auto-update' ||
    hostAutoUpdate?.entrypoints?.linux_macos_disable !== 'install-docker-webui.sh --disable-auto-update' ||
    hostAutoUpdate?.entrypoints?.linux_macos_status !== 'install-docker-webui.sh --auto-update-status' ||
    hostAutoUpdate?.entrypoints?.windows_enable !== 'install-docker-webui.ps1 -EnableAutoUpdate' ||
    hostAutoUpdate?.entrypoints?.windows_disable !== 'install-docker-webui.ps1 -DisableAutoUpdate' ||
    hostAutoUpdate?.entrypoints?.windows_status !== 'install-docker-webui.ps1 -AutoUpdateStatus' ||
    hostAutoUpdate?.platform_schedulers?.windows?.mechanism !== 'user_scoped_windows_scheduled_task' ||
    hostAutoUpdate?.platform_schedulers?.windows?.id !== 'One Person Lab WebUI Stable Update' ||
    hostAutoUpdate?.platform_schedulers?.windows?.legacy_id_migrated_on_enable !==
      'One Person Lab WebUI Latest Update' ||
    hostAutoUpdate?.platform_schedulers?.windows?.execution_context !==
      'limited_current_user_run_only_when_logged_on' ||
    hostAutoUpdate?.platform_schedulers?.macos?.mechanism !== 'current_user_launch_agent' ||
    hostAutoUpdate?.platform_schedulers?.macos?.id !== 'cn.onepersonlab.webui-update' ||
    hostAutoUpdate?.platform_schedulers?.linux_personal?.mechanism !== 'systemd_user_timer' ||
    hostAutoUpdate?.platform_schedulers?.linux_personal?.id !==
      'one-person-lab-webui-update.timer' ||
    hostAutoUpdate?.platform_schedulers?.linux_server?.default_enabled !== false ||
    hostAutoUpdate?.platform_schedulers?.linux_server?.installer_must_not_create_system_scheduler !==
      true ||
    hostAutoUpdate?.channel_policy !==
      'default_stable_only_preview_or_custom_image_tag_or_digest_requires_manual_update' ||
    hostAutoUpdate?.follows_ref !== 'ghcr.io/gaofeng21cn/one-person-lab-webui:stable' ||
    hostAutoUpdate?.result_schema !== 'opl_webui_host_auto_update_result.v1' ||
    hostAutoUpdate?.config_schema !== 'opl_webui_host_auto_update_config.v1' ||
    !String(hostAutoUpdate?.reviewed_runner_policy ?? '').includes(
      'never_downloads_or_executes_mutable_main_branch_installer_code',
    ) ||
    !String(hostAutoUpdate?.failure_semantics ?? '').includes(
      'restore_the_previous_image_digest',
    ) ||
    !String(hostAutoUpdate?.security_boundary ?? '').includes('without_Docker_socket_mount')
  ) {
    throw new Error('Docker/WebUI automatic updates must preserve the shared stable-only host scheduler contract');
  }
  assertIncludesAll(
    hostAutoUpdate?.shared_status_fields,
    ['scheduler', 'enabled', 'runner', 'channel', 'daily_time', 'result', 'status', 'phase', 'rollback', 'completed_at'],
    'Docker/WebUI shared host auto-update status fields',
  );
  if (dockerWebui.installer_model?.compose_file !== 'compose.yaml') {
    throw new Error('Docker/WebUI install exposure must declare compose.yaml as the one-click installer compose artifact');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.persistent_host_dirs,
    ['OnePersonLab/data', 'OnePersonLab/projects'],
    'Docker/WebUI persistent host dirs',
  );
  if (dockerWebui.installer_model?.container_mounts?.data !== '/data') {
    throw new Error('Docker/WebUI install exposure must map host data dir to /data');
  }
  if (dockerWebui.installer_model?.container_mounts?.projects !== '/projects') {
    throw new Error('Docker/WebUI install exposure must map host projects dir to /projects');
  }
  if (dockerWebui.installer_model?.api_key_policy !== 'never_pass_api_key_on_cli_or_environment_for_beginner_path') {
    throw new Error('Docker/WebUI install exposure must forbid API keys in beginner CLI/env installer inputs');
  }
  if (dockerWebui.installer_model?.api_key_entry_surface !== 'browser_webui_first_run_access_panel_or_settings_gateway') {
    throw new Error('Docker/WebUI install exposure must make WebUI the first API key entry surface');
  }
  if (
    dockerWebui.installer_model?.gateway_account_credential_policy !==
      'never_pass_gateway_account_credentials_to_installer_cli_or_environment_for_beginner_path' ||
    dockerWebui.installer_model?.gateway_account_entry_surface !==
      'browser_webui_first_run_or_settings_gateway_via_existing_runtime_provider'
  ) {
    throw new Error(
      'Docker/WebUI install exposure must keep Gateway account credentials out of installer inputs and reuse the browser runtime provider',
    );
  }
  const cloudDeployment = dockerWebui.installer_model?.cloud_deployment_model;
  if (cloudDeployment?.template_dir !== 'deploy/docker-webui/cloud') {
    throw new Error('Docker/WebUI cloud deployment must declare the deploy/docker-webui/cloud template directory');
  }
  if (cloudDeployment?.installer_entrypoint !== 'install-docker-webui.sh --cloud-template') {
    throw new Error('Docker/WebUI cloud deployment must be generated through the explicit --cloud-template entrypoint');
  }
  assertIncludesAll(
    cloudDeployment?.compose_files,
    ['compose.yaml', 'compose.gateway-key.yaml'],
    'Docker/WebUI cloud compose files',
  );
  if (
    cloudDeployment?.webui_auth?.default_username !== 'opl' ||
    cloudDeployment?.webui_auth?.required_password_secret !== 'OPL_WEBUI_PASSWORD_FILE' ||
    cloudDeployment?.webui_auth?.auth_mode_env !== 'OPL_WEBUI_AUTH_MODE=password' ||
    !String(cloudDeployment?.webui_auth?.auto_login ?? '').includes('disabled')
  ) {
    throw new Error('Docker/WebUI cloud deployment must require password auth and disable auto-login');
  }
  if (
    cloudDeployment?.gateway_api_key?.optional_secret !== 'OPL_GATEWAY_API_KEY_FILE' ||
    cloudDeployment?.gateway_api_key?.does_not_replace_webui_password !== true ||
    !String(cloudDeployment?.gateway_api_key?.transport ?? '').includes('stdin_only')
  ) {
    throw new Error('Docker/WebUI cloud deployment must keep Gateway API key optional, stdin-only, and separate from WebUI password');
  }
  assertIncludesAll(
    cloudDeployment?.fail_closed_rules,
    [
      'cloud_or_password_mode_requires_OPL_WEBUI_PASSWORD_FILE_or_OPL_WEBUI_PASSWORD',
      'gateway_api_key_secret_without_webui_password_secret_must_refuse_start',
      'secret_files_must_be_readable_and_non_empty',
      'configured_password_and_gateway_key_must_not_be_logged_or_written_to_diagnostics',
    ],
    'Docker/WebUI cloud fail-closed rules',
  );
  if (
    dockerWebui.installer_model?.runtime_proxy_smoke?.mode !== 'webui_proxy_configure_codex' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.endpoint !== '/api/opl-runtime/configure-codex' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.command !== 'opl system configure-codex --api-key-stdin --json' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.secret_transport !== 'stdin_only' ||
    dockerWebui.installer_model?.runtime_proxy_smoke?.key_material_recorded !== false
  ) {
    throw new Error('Docker/WebUI runtime proxy smoke must validate configure-codex stdin transport without key material');
  }
  const ordinaryUserStatus = dockerWebui.installer_model?.ordinary_user_status;
  if (ordinaryUserStatus?.path_id !== 'ordinary_docker_webui_user_path') {
    throw new Error('Docker/WebUI ordinary user status must use the ordinary Docker/WebUI user path id');
  }
  if (ordinaryUserStatus?.priority !== 'ordinary_user_path_before_evidence_bundle_language') {
    throw new Error('Docker/WebUI ordinary user status must prioritize ordinary user path language');
  }
  assertIncludesAll(
    ordinaryUserStatus?.display_order,
    ['one_click_install', 'browser_webui', 'access_key_settings', 'runtime_proxy', 'startup_recovery', 'data_preservation', 'host_update'],
    'Docker/WebUI ordinary user status rows',
  );
  if (ordinaryUserStatus?.settings_entry !== 'Settings -> Account & Access') {
    throw new Error('Docker/WebUI ordinary user status must route Gateway account and API Key changes through Settings -> Account & Access');
  }
  if (
    !String(ordinaryUserStatus?.rows?.access_key_settings ?? '').includes('Sign in to OPL Gateway') ||
    !String(ordinaryUserStatus?.rows?.access_key_settings ?? '').includes('API Key') ||
    !String(ordinaryUserStatus?.rows?.runtime_proxy ?? '').includes('reuse the existing OPL runtime provider')
  ) {
    throw new Error('Docker/WebUI ordinary user status must describe account-first model access on the shared runtime provider');
  }
  if (
    !String(ordinaryUserStatus?.image_seed_selection ?? '').includes('Default stable image') ||
    !String(ordinaryUserStatus?.image_seed_selection ?? '').includes('--tag latest is explicit Preview opt-in')
  ) {
    throw new Error('Docker/WebUI ordinary user status must declare the default WebUI full seed image path');
  }
  assertIncludesAll(
    ordinaryUserStatus?.must_prefer_over,
    ['release_evidence_bundle', 'operator_evidence_bundle', 'preflight_gate_summary'],
    'Docker/WebUI ordinary user status language precedence',
  );
  assertIncludesAll(
    ordinaryUserStatus?.must_not_claim,
    ['desktop_release_ready', 'real_install_ready', 'clean_windows_vm_pass_without_clean_windows_evidence', 'release_ready'],
    'Docker/WebUI ordinary user status false-ready boundary',
  );
  if (dockerWebui.installer_model?.startup_doctor?.validator !== 'scripts/validate-docker-webui-diagnostics.ts') {
    throw new Error('Docker/WebUI startup diagnostics must use validate-docker-webui-diagnostics.ts');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.startup_doctor?.required_files,
    [
      'metadata.txt',
      'diagnostics-manifest.json',
      'compose.yaml',
      'docker-version.txt',
      'docker-compose-version.txt',
      'docker-compose-ps.txt',
      'docker-compose-logs.txt',
      'docker-image.txt',
      'http-probe.txt',
      'directories.txt',
      'data-preservation.txt',
    ],
    'Docker/WebUI startup diagnostics required files',
  );
  assertIncludesAll(
    dockerWebui.installer_model?.ordinary_user_progress?.must_not_claim,
    ['release readiness', 'clean VM pass', 'domain readiness', 'production readiness'],
    'Docker/WebUI ordinary user progress false-ready boundary',
  );
  assertIncludesAll(
    dockerWebui.installer_model?.ordinary_user_progress?.status_surfaces,
    [
      'HTTP health readback',
      'api_key_flow_evidence',
      'data-preservation verdict',
      'compose volume mapping readback',
      'image digest readback',
      'remote image digest readback',
      'image currentness status readback',
      'OPL maintenance status after WebUI opens',
    ],
    'Docker/WebUI ordinary user progress status surfaces',
  );
  if (dockerWebui.installer_model?.manual_docker_fallback !== 'advanced_troubleshooting_path_only') {
    throw new Error('Docker/WebUI install exposure must keep manual Docker as an advanced fallback only');
  }
  assertIncludesAll(
    dockerWebui.installer_model?.manual_fallback_forms,
    ['docker run', 'docker compose'],
    'Docker/WebUI manual fallback forms',
  );
  if (dockerWebui?.runtime_distribution_model?.container_role !== 'preheated_webui_runtime_image') {
    throw new Error('Docker/WebUI install exposure must declare the preheated WebUI runtime image model');
  }
  if (dockerWebui.runtime_distribution_model?.persistent_data_dir !== '/data') {
    throw new Error('Docker/WebUI install exposure must keep /data as the persistent data directory');
  }
  if (dockerWebui.runtime_distribution_model?.persistent_projects_dir !== '/projects') {
    throw new Error('Docker/WebUI install exposure must keep /projects as the persistent projects directory');
  }
  if (dockerWebui.runtime_distribution_model?.default_profile !== 'webui_full') {
    throw new Error('Docker/WebUI install exposure must make webui_full the beginner default profile');
  }
  if (
    dockerWebui.runtime_distribution_model?.stable_channel_policy !==
      'stable_is_the_default_full_image_and_latest_is_explicit_preview_opt_in'
  ) {
    throw new Error('Docker/WebUI install exposure must keep Stable as the full-image default and Latest as explicit Preview opt-in');
  }
  if (dockerWebui.runtime_distribution_model?.required_image_manifest !== '/opt/opl/image-manifest.json') {
    throw new Error('Docker/WebUI install exposure must require the canonical /opt/opl image manifest');
  }
  if (dockerWebui.runtime_distribution_model?.required_seed_metadata !== '/opt/opl/seed/metadata.json') {
    throw new Error('Docker/WebUI install exposure must require the canonical /opt/opl seed metadata');
  }
  assertIncludesAll(
    dockerWebui.runtime_distribution_model?.required_full_seed_components,
    ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'],
    'Docker/WebUI full seed components',
  );
  for (const surface of ['opl system startup-maintenance --json', 'opl update status --json']) {
    if (!dockerWebui.runtime_distribution_model?.status_surfaces?.includes(surface)) {
      throw new Error(`Docker/WebUI install exposure must include status surface ${surface}`);
    }
  }
  if (
    dockerWebui.runtime_distribution_model?.image_update_model?.currentness_status_model !==
      'local_image_digest_and_optional_remote_image_digest_compare_only' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.currentness_claim_policy !==
      'remote digest comparison is status-only; it does not prove release readiness, the live stable channel, or that a host update was applied'
  ) {
    throw new Error('Docker/WebUI image currentness must remain status-only and separate from release-ready or applied-update proof');
  }
  if (
    dockerWebui.runtime_distribution_model?.image_update_model?.host_auto_update_contract_ref !==
      'installer_surfaces[surface=docker_webui].installer_model.host_auto_update' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.linux_server_auto_update_default !==
      'disabled_until_administrator_explicitly_configures_a_system_scheduler' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.automatic_channel_policy !==
      'default_stable_only_preview_or_custom_image_tag_or_digest_requires_manual_update' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.scheduled_code_policy !==
      'locally_preserved_reviewed_runner_only_no_mutable_main_branch_download_or_execution' ||
    dockerWebui.runtime_distribution_model?.image_update_model?.health_failure_recovery !==
      'restore_previous_image_digest_and_recreate_with_pull_disabled'
  ) {
    throw new Error('Docker/WebUI image automatic updates must reuse the shared host auto-update contract');
  }
  assertIncludesAll(
    dockerWebui.runtime_distribution_model?.image_update_model?.host_auto_update_platforms,
    ['windows_task_scheduler', 'macos_launch_agent', 'linux_systemd_user_timer'],
    'Docker/WebUI host auto-update platforms',
  );
  validateDockerWebuiSmokeGateContract(dockerWebui.smoke_gate_contract);
}

function validateDockerWebuiSmokeGateContract(contract) {
  if (contract?.status !== 'required_manual_or_workflow_gate_not_live_evidence') {
    throw new Error('Docker/WebUI smoke gate contract must not claim live evidence from docs/contracts alone');
  }
  if (contract.release_readiness_policy !== 'must_not_claim_release_ready_until_required_smoke_gates_have_fresh_artifacts_or_typed_blockers') {
    throw new Error('Docker/WebUI smoke gate contract must block release-ready claims until required smoke evidence or typed blockers exist');
  }
  if (contract.workflow_artifact !== 'docker-webui-smoke-gate-contract.json') {
    throw new Error('Docker/WebUI smoke gate contract must declare the workflow contract artifact');
  }
  if (
    contract.workflow_import?.live_release_import !== 'none' ||
    contract.workflow_import?.authority !== 'standalone_diagnostic_only_non_authoritative_for_stable_mutation'
  ) {
    throw new Error('Docker/WebUI smoke evidence must not import retired desktop release authority');
  }
  if (contract.workflow_import?.manual_producer_workflow !== '.github/workflows/docker-webui-clean-vm.yml') {
    throw new Error('Docker/WebUI clean VM gates must declare the unified standalone manual producer workflow');
  }
  if (contract.workflow_import?.manual_producer_platform_input !== 'platform') {
    throw new Error('Docker/WebUI clean VM producer must select the platform through one typed input');
  }
  if (
    contract.workflow_import?.manual_producer_platforms?.linux !== 'clean_linux_vm'
    || contract.workflow_import?.manual_producer_platforms?.windows !== 'clean_windows_vm'
  ) {
    throw new Error('Docker/WebUI clean VM producer must preserve the Linux and Windows evidence gates');
  }
  assertIncludesAll(
    contract.diagnostic_bundle_artifacts,
    [
      'compose.yaml',
      'docker ps',
      'docker logs',
      'image_digest_readback',
      'remote_image_digest_readback_optional',
      'image_currentness_status_readback',
      'compose_volume_mapping_readback',
      'http_health_readback',
      'api_key_flow_evidence',
      'auth_user_readback',
      'data_preservation_inventory',
      'install_manifest_readback',
      'projects_mount_readback',
    ],
    'Docker/WebUI smoke diagnostic bundle artifacts',
  );
  assertIncludesAll(
    contract.health_check_surfaces,
    [
      'http://localhost:3000/',
      'http://localhost:3000/manifest.webmanifest',
      'http://localhost:3000/api/auth/user',
      'OnePersonLab/data/opl/state/install-manifest.json',
      'OnePersonLab/projects',
    ],
    'Docker/WebUI smoke health check surfaces',
  );
  const gateById = new Map([
    ...(contract.required_gates ?? []),
    ...(contract.optional_gates ?? []),
    ...(contract.diagnostic_gates ?? []),
  ].map((gate) => [gate.id, gate]));
  for (const gateId of ['clean_linux_vm', 'clean_windows_vm', 'existing_docker', 'existing_old_onepersonlab_data_dir']) {
    const gate = gateById.get(gateId);
    if (!gate) {
      throw new Error(`Docker/WebUI smoke gate contract missing required gate ${gateId}`);
    }
    if (!String(gate.execution_mode ?? '').includes('smoke')) {
      throw new Error(`Docker/WebUI smoke gate ${gateId} must declare a smoke execution mode`);
    }
    assertIncludesAll(
      gate.required_evidence,
      [
        'compose_yaml',
        'image_digest_readback',
        'compose_volume_mapping_readback',
        'container_logs',
        'http_health_readback',
        'api_key_flow_evidence',
        'data_preservation_inventory',
        'install_manifest_readback',
      ],
      `Docker/WebUI smoke gate ${gateId} evidence`,
    );
  }
  if (gateById.get('clean_linux_vm')?.entrypoint !== 'install-docker-webui.sh --yes') {
    throw new Error('Docker/WebUI clean Linux VM gate must use the shell one-click installer');
  }
  if (gateById.get('clean_linux_vm')?.execution_mode !== 'desktop_release_same_job_ubuntu_clean_vm_smoke_or_manual_vm_smoke') {
    throw new Error('Docker/WebUI clean Linux VM gate must default to the desktop release same-job Ubuntu smoke');
  }
  if (!Array.isArray(contract.required_gates) || contract.required_gates.map((gate) => gate.id).join(',') !== 'clean_linux_vm') {
    throw new Error('Docker/WebUI release-blocking smoke gates must only require clean_linux_vm');
  }
  if (!Array.isArray(contract.optional_gates) || !contract.optional_gates.some((gate) => gate.id === 'clean_windows_vm')) {
    throw new Error('Docker/WebUI clean Windows VM gate must be optional diagnostic evidence');
  }
  if (gateById.get('clean_windows_vm')?.entrypoint !== 'install-docker-webui.ps1 -Yes') {
    throw new Error('Docker/WebUI clean Windows VM gate must use the PowerShell one-click installer');
  }
  if (gateById.get('clean_windows_vm')?.execution_mode !== 'self_hosted_clean_windows_runner_or_manual_vm_smoke') {
    throw new Error('Docker/WebUI clean Windows VM gate must use a self-hosted clean Windows runner or manual VM smoke');
  }
  if (gateById.get('existing_docker')?.docker_state !== 'existing_docker_must_be_reused_not_reinstalled') {
    throw new Error('Docker/WebUI existing Docker gate must require reusing existing Docker');
  }
  if (gateById.get('existing_old_onepersonlab_data_dir')?.data_state !== 'existing_OnePersonLab_data_dir_must_be_preserved_or_migrated_without_delete') {
    throw new Error('Docker/WebUI old data dir gate must require preserve-or-migrate behavior');
  }
  if (
    contract.false_ready_boundary?.docs_or_contract_only_can_claim_release_ready !== false ||
    contract.false_ready_boundary?.local_container_smoke_can_replace_clean_vm_smoke !== false ||
    contract.false_ready_boundary?.remote_digest_match_can_claim_release_ready !== false ||
    contract.false_ready_boundary?.image_digest_readback_can_claim_live_currentness !== false ||
    contract.false_ready_boundary?.missing_gate_must_be_typed_blocker !== true
  ) {
    throw new Error('Docker/WebUI smoke gate false-ready boundary must forbid release-ready claims without fresh gate evidence');
  }
}
export { validateInstallerSurfaces };
