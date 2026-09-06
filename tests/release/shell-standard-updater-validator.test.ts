import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCarrierNeutralManagedUpdateSources } from '../../scripts/validate-active-shell/shell-standard-updater-validator.ts';

function validSources() {
  return {
    autoUpdaterService: `
      getUpdateChannel(platform = process.platform, arch = process.arch)
      platform === 'win32' && arch === 'arm64'
      recordAutoUpdateInstallNotAppliedIfNeeded
      recordAutoUpdateQuitAndInstall
      recordAutoUpdateStatus
      resolveLocalAuthorizedMacosUpdatePlan
      launchLocalAuthorizedMacosInstaller(plan)
      params?.file_path
      autoUpdater.quitAndInstall(true, true)
    `,
    autoUpdateDiagnostics: `
      'quit-and-install'
      'install-not-applied'
      current_version_lower_than_downloaded_after_quit_and_install
      semver.gte(normalizedCurrent, normalizedTarget)
    `,
    mainEntry: `
      import { createAutoUpdaterBootstrap } from './process/startup/runtime/autoUpdaterBootstrap';
      const initializeAutoUpdaterForRuntime = createAutoUpdaterBootstrap();
      void initializeAutoUpdaterForRuntime();
    `,
    autoUpdaterBootstrap: `
      autoUpdater.initialize(statusBroadcast);
      deps.schedule(() => {
        const channel = await deps.loadUpdateChannel();
        const decision = await deps.resolveUpdateCheck(channel);
        const target =
          decision.updateAvailable && decision.latest
            ? {
                repo: 'gaofeng21cn/one-person-lab-app',
                tagName: decision.latest.tagName,
                updaterVersion: decision.latest.updaterVersion,
              }
            : null;
        await autoUpdater.checkForUpdatesAndNotify(target);
      });
    `,
    managedUpdateMaintenance: `
      if (!componentId || componentId !== input.componentId || componentId !== 'opl_base')
      trigger: 'app_carrier_changed' | 'app_startup_after_core_ready' | 'daily_background_maintenance'
      let result = await invokeRead('check')
      planResult = await invokeRead('plan')
      autoApply?.eligible && autoApply.appBackgroundSafe && autoApply.commandRef
      if (componentId === 'opl_app')
      applyResult = await ipcBridge.oplRuntime.applyUpdatePlan.invoke()
      lastFailure = resultErrorMessage(applyResult)
      if (!lastFailure && applyResult)
      result = await invokeRead('status')
      lastFailure = resultErrorMessage(result)
      ...(lastFailure ? {} : { lastReconciledCarrierCheckpoint: currentCarrierCheckpoint() })
      lastAttemptedCarrierCheckpoint !== currentCarrierCheckpoint()
      window.addEventListener('online', resumeWhenDue)
      document.addEventListener('visibilitychange', resumeWhenDue)
    `,
    rendererMain: `
      import { startManagedUpdateMaintenanceScheduler } from './services/managedUpdateMaintenance'
      if (!ready || !configReady) return;
      return startManagedUpdateMaintenanceScheduler();
    `,
    runtimeBridge: 'carrier-neutral Framework bridge',
  };
}

test('standard updater gate accepts carrier-neutral managed lifecycle ownership', () => {
  assert.doesNotThrow(() => validateCarrierNeutralManagedUpdateSources(validSources()));
});

test('standard updater gate rejects a disconnected runtime bootstrap', () => {
  const sources = validSources();
  sources.mainEntry = sources.mainEntry.replace('void initializeAutoUpdaterForRuntime();', '');
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /App binary updater startup must include void initializeAutoUpdaterForRuntime\(\);/,
  );
});

test('standard updater gate rejects a bootstrap that skips initialization', () => {
  const sources = validSources();
  sources.autoUpdaterBootstrap = sources.autoUpdaterBootstrap.replace(
    'autoUpdater.initialize(statusBroadcast);',
    '',
  );
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /App binary updater bootstrap must include autoUpdater\.initialize\(statusBroadcast\);/,
  );
});

test('standard updater gate rejects a bootstrap without the channel-bound immutable target', () => {
  const sources = validSources();
  sources.autoUpdaterBootstrap = sources.autoUpdaterBootstrap.replace(
    'tagName: decision.latest.tagName,',
    '',
  );
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /App binary updater bootstrap must include tagName: decision\.latest\.tagName,/,
  );
});

test('standard updater gate rejects the retired package user-apply component set', () => {
  const sources = validSources();
  sources.managedUpdateMaintenance += `
    const USER_APPLY_COMPONENT_IDS = new Set<ManagedUpdateComponentId>(['opl_base', 'opl_packages'])
  `;
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /managed update user mutation boundary must not include USER_APPLY_COMPONENT_IDS/,
  );
});

test('standard updater gate rejects an opl_packages user mutation request', () => {
  const sources = validSources();
  sources.managedUpdateMaintenance += " componentId: 'opl_packages'";
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /managed update user mutation boundary must not include componentId: 'opl_packages'/,
  );
});

test('standard updater gate rejects the retired OPL Flow special-case reconcile path', () => {
  const sources = validSources();
  sources.runtimeBridge += ' runOplFlowPostAppUpdateReconcile';
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /must not include runOplFlowPostAppUpdateReconcile/,
  );
});

test('standard updater gate rejects checkpoint persistence before terminal success', () => {
  const sources = validSources();
  sources.managedUpdateMaintenance = sources.managedUpdateMaintenance.replace(
    '...(lastFailure ? {} : { lastReconciledCarrierCheckpoint: currentCarrierCheckpoint() })',
    'lastReconciledCarrierCheckpoint: currentCarrierCheckpoint()',
  );
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /carrier-neutral managed update scheduler must include/,
  );
});

test('standard updater gate rejects apply without terminal status readback', () => {
  const sources = validSources();
  sources.managedUpdateMaintenance = sources.managedUpdateMaintenance.replace(
    "result = await invokeRead('status')",
    '',
  );
  assert.throws(
    () => validateCarrierNeutralManagedUpdateSources(sources),
    /carrier-neutral managed update scheduler must include/,
  );
});
