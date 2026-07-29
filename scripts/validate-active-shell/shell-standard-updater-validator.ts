import {
  assertTextExcludesAll,
  assertTextIncludesAll,
  readShellText,
} from './shell-implementation-helpers.ts';

const retiredOplFlowReconcileSymbols = [
  'claimAutoUpdateOplFlowReconcileIfNeeded',
  'recordAutoUpdateOplFlowReconcileResult',
  'buildOplFlowPostAppUpdateReconcileCommand',
  'runOplFlowPostAppUpdateReconcile',
  'runPostAppUpdateDependencyReconcileIfNeeded',
];

export function validateCarrierNeutralManagedUpdateSources(sources) {
  const { autoUpdaterService, autoUpdateDiagnostics, mainEntry, managedUpdateMaintenance, rendererMain } = sources;

  assertTextIncludesAll(
    autoUpdaterService,
    [
      'recordAutoUpdateInstallNotAppliedIfNeeded',
      'recordAutoUpdateQuitAndInstall',
      'recordAutoUpdateStatus',
      'resolveLocalAuthorizedMacosUpdatePlan',
      'launchLocalAuthorizedMacosInstaller(plan)',
      'params?.file_path',
      'autoUpdater.quitAndInstall(true, true)',
    ],
    'Active shell standard App binary updater',
  );
  assertTextIncludesAll(
    autoUpdateDiagnostics,
    [
      "'quit-and-install'",
      "'install-not-applied'",
      'current_version_lower_than_downloaded_after_quit_and_install',
      'semver.gte(normalizedCurrent, normalizedTarget)',
    ],
    'Active shell App binary updater diagnostics',
  );
  assertTextIncludesAll(
    mainEntry,
    ['autoUpdater.initialize(statusBroadcast);'],
    'Active shell App binary updater startup',
  );

  assertTextIncludesAll(
    managedUpdateMaintenance,
    [
      "componentId !== 'opl_base'",
      "trigger: 'app_carrier_changed' | 'app_startup_after_core_ready' | 'daily_background_maintenance'",
      "let result = await invokeRead('check')",
      "planResult = await invokeRead('plan')",
      'autoApply?.eligible && autoApply.appBackgroundSafe && autoApply.commandRef',
      'if (componentId === \'opl_app\')',
      'applyResult = await ipcBridge.oplRuntime.applyUpdatePlan.invoke()',
      'lastFailure = resultErrorMessage(applyResult)',
      'if (!lastFailure && applyResult)',
      "result = await invokeRead('status')",
      'lastFailure = resultErrorMessage(result)',
      '...(lastFailure ? {} : { lastReconciledCarrierCheckpoint: currentCarrierCheckpoint() })',
      'snapshot.lastReconciledCarrierCheckpoint === currentCarrierCheckpoint()',
      "? 'app_startup_after_core_ready'",
      ": 'app_carrier_changed'",
    ],
    'Active shell carrier-neutral managed update scheduler',
  );
  assertTextExcludesAll(
    managedUpdateMaintenance,
    ['USER_APPLY_COMPONENT_IDS', "componentId: 'opl_packages'"],
    'Active shell managed update user mutation boundary',
  );
  assertTextIncludesAll(
    rendererMain,
    [
      "import { startManagedUpdateMaintenanceScheduler } from './services/managedUpdateMaintenance'",
      'if (!ready || !configReady) return;',
      'return startManagedUpdateMaintenanceScheduler();',
    ],
    'Active shell managed update startup after core readiness',
  );

  for (const [label, text] of Object.entries(sources)) {
    assertTextExcludesAll(text, retiredOplFlowReconcileSymbols, `Active shell ${label}`);
  }
}

export function validateStandardUpdaterImplementation(shellPaths) {
  validateCarrierNeutralManagedUpdateSources({
    autoUpdaterService: readShellText(
      shellPaths,
      'packages/desktop/src/process/services/autoUpdaterService.ts',
    ),
    autoUpdateDiagnostics: readShellText(
      shellPaths,
      'packages/desktop/src/process/services/autoUpdateDiagnostics.ts',
    ),
    mainEntry: readShellText(
      shellPaths,
      'packages/desktop/src/process/startup/runtime/autoUpdaterBootstrap.ts',
    ),
    managedUpdateMaintenance: readShellText(
      shellPaths,
      'packages/desktop/src/renderer/services/managedUpdateMaintenance.ts',
    ),
    rendererMain: readShellText(shellPaths, 'packages/desktop/src/renderer/main.tsx'),
    runtimeBridge: readShellText(shellPaths, 'packages/desktop/src/process/bridge/oplRuntimeBridge.ts'),
  });

  const localAuthorizedUpdater = readShellText(
    shellPaths,
    'packages/desktop/src/process/services/localAuthorizedMacosUpdater.ts',
  );
  assertTextIncludesAll(
    localAuthorizedUpdater,
    [
      'local-authorized-updater',
      'local-authorized-updater-diagnostics.json',
      'unzip -q "$update_zip_path"',
      'find "$staging_root" -maxdepth 3 -type d -name "One Person Lab.app"',
      'ditto "$source_app" "$app_path"',
      'xattr -dr com.apple.quarantine "$app_path"',
      'write_diagnostics "installed"',
      'open "$app_path"',
    ],
    'Active shell macOS updater recovery',
  );
}
