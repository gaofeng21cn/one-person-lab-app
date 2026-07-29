import {
  assertShellTextIncludes,
  assertShellTextIncludesAll,
  assertTextDoesNotMatch,
  assertTextExcludesAll,
  assertTextIncludesAll,
  readShellText,
} from './shell-implementation-helpers.ts';
import path from 'node:path';
import { assertFile } from './validation-config.ts';

const runtimeBridgeExpected = [
  "args: ['app', 'state', '--profile', profile, '--json']",
  "args: ['runtime', 'app-operator-drilldown', '--json']",
  "args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json']",
  "['app', 'action', 'execute', '--action', assertActionId(request.actionId)]",
];

const firstRunLocaleExpected = ['"firstRun"', 'One Person Lab', 'Codex'];
const firstRunLocaleForbidden = [
  '"title": "Prepare One Person Lab"',
  '"wizardTitle": "Prepare One Person Lab"',
  'Checking the essentials',
  'Ready to start',
  'Codex API 配置',
  'Codex API Key',
  'Codex API Configuration',
  'Needs setup',
];

const updateLocaleForbidden = [
  'GitHub API request failed',
  'GitHub API response was not a release list',
  'Update check returned no result',
];

const runtimeSettingsExpected = [
  "useOplAppState('fast')",
  'executeManagedUpdateRead',
  'executeManagedUpdateMutation',
  'runSettingsControlPlaneAction',
  'maintenanceHubItems',
  "data-testid='opl-maintenance-hub'",
  'settings.uiOptimization.maintenance.summaryTitle',
  'settings.oplEnvironmentPage.maintenanceHub.description',
  "data-testid='settings-maintenance-daily-actions'",
  "data-testid='settings-maintenance-managed-dependencies'",
  "data-testid='settings-maintenance-inline-updates'",
  "data-testid='settings-maintenance-diagnostics-action'",
  "data-testid='settings-maintenance-technical-details'",
  'open={diagnosticsVisible}',
  "className='opl-settings-details opl-settings-surface--diagnostic'",
];

const runtimeSettingsViewModelExpected = [
  'const maintenanceHubItems',
  "key: 'appUpdates'",
  "key: 'runtimeEnvironment'",
  "key: 'capabilitySurfaceSync'",
  "key: 'localServicesRepair'",
  'settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title',
  'settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.title',
  'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment',
  'settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.title',
  'settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks',
  'settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.title',
];

const trayStartupExpected = [
  'export async function initializeTrayForDesktopMode',
  'deps.createOrUpdateTray()',
  'deps.destroyTray()',
  'deps.setCloseToTrayEnabled(false)',
];

const trayIconExpected = [
  "platform === 'darwin' ? 'trayTemplate.png' : 'app.png'",
  "path.join(resourcesPath, 'opl-branding', iconFilename)",
  'path.join(resourcesPath, iconFilename)',
  'icon.setTemplateImage(true)',
  'if (icon.isEmpty())',
];

const trayPackagingExpected = [
  'from: resources/opl-branding',
  'to: opl-branding',
];

const desktopMainExpected = [
  'initializeTrayForDesktopMode',
  'readCloseToTray: readCloseToTraySetting',
  'createOrUpdateTray',
  'destroyTray',
];

const closeToTraySettingExpected = [
  "const CLOSE_TO_TRAY_CONFIG_KEY = 'system.closeToTray'",
  'await ProcessConfig.get(CLOSE_TO_TRAY_CONFIG_KEY)',
  'await ProcessConfig.set(CLOSE_TO_TRAY_CONFIG_KEY, enabled)',
];

function validateAppStateHook(shellPaths) {
  const appStateHook = assertShellTextIncludes(
    shellPaths,
    'packages/desktop/src/renderer/hooks/system/useOplAppState.ts',
    'ipcBridge.oplRuntime.getAppState.invoke({ profile })',
    'OPL App state hook',
  );
  assertTextIncludesAll(
    appStateHook,
    [
      "const GATEWAY_ACCOUNT_CACHE_KEY = 'opl.gatewayAccount.projection.v1'",
      "const APP_STATE_CACHE_UPDATED_EVENT = 'opl:app-state-cache-updated'",
      "const DERIVED_BOOTSTRAP_PROVENANCE = 'derived_bootstrap' as const",
      'GATEWAY_ACCOUNT_CACHE_TOP_LEVEL_FIELDS',
      'GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS',
      'sanitizeGatewayAccountForCache',
      'readCachedGatewayAccount',
      'cacheGatewayAccountProjection',
      'withoutGatewayAccountProjection',
      'notifyOplAppStateCacheUpdated',
      'window.addEventListener(APP_STATE_CACHE_UPDATED_EVENT, handleCacheUpdate)',
      'hasGatewayAccountProjection',
      'gatewayAccount.capabilities = {',
      'account_login_supported: false',
      'gatewayAccount.actions = {',
      'use_for_model_access: null',
      'setPayload(loadedPayload)',
      "setProvenance('live')",
      'payload: withoutGatewayAccountProjection(sanitizedPayload)',
      'provenance: DERIVED_BOOTSTRAP_PROVENANCE',
    ],
    'Active shell display-only Gateway bootstrap cache and live snapshot authority',
  );
  assertTextExcludesAll(appStateHook, ['shell.runOplCommand', 'application.systemInfo'], 'Active shell OPL App state hook');
  assertTextExcludesAll(
    appStateHook,
    ['stripGatewayAccountFromAppState', 'mergeCachedGatewayAccount'],
    'Active shell Gateway account cache must stay display-only and never merge into a live snapshot',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'tests/unit/opl-runtime/useOplAppStateCache.dom.test.tsx',
    [
      'renders the cached connected account before the background refresh resolves',
      'reuses the account cached by a prior page visit while the next refresh is pending',
      'updates an already-mounted consumer when another page persists the connected account',
      'requires a fresh read before a new consumer receives live authority',
      'does not splice the dedicated account cache into a live payload that omits the Gateway field',
      'replaces the cached account only after a live read confirms disconnection',
    ],
    'Active shell Gateway bootstrap cache and live authority behavior tests',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/settings/sections/AccessSettings.tsx',
    [
      "useOplAppState('fast', { requireLive: surface === 'gateway' })",
      "const gatewayMutationAuthority = appStateQuery.provenance === 'live' && gatewayAccount !== null",
      'if (!gatewayMutationAuthority) return',
      'gatewayFormVisible && gatewayMutationAuthority',
    ],
    'Active shell Gateway mutation waits for fresh live authority',
  );
}

function validateRuntimeBridgeSurface(shellPaths) {
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/bridge/oplRuntimeBridge.ts',
    runtimeBridgeExpected,
    'Active shell runtime bridge canonical surface',
  );
}

function enabledLocales(requiresLocale) {
  return ['zh-CN', ...(requiresLocale('zh-TW') ? ['zh-TW'] : [])];
}

function validateFirstRunLocale(shellPaths, locale) {
  const text = readShellText(shellPaths, `packages/desktop/src/renderer/services/i18n/locales/${locale}/settings.json`);
  assertTextIncludesAll(text, firstRunLocaleExpected, `Active shell ${locale} first-run locale`);
  const settingsLocale = JSON.parse(text);
  const firstRunSetupText = `${JSON.stringify(settingsLocale.firstRun ?? {})}\n${JSON.stringify(settingsLocale.oplFirstLaunch ?? {})}`;
  assertTextExcludesAll(firstRunSetupText, firstRunLocaleForbidden, `Active shell ${locale} first-run locale English fallback`);
}

function validateUpdateLocale(shellPaths, locale) {
  const text = readShellText(shellPaths, `packages/desktop/src/renderer/services/i18n/locales/${locale}/update.json`);
  assertTextIncludesAll(text, ['GitHub API'], `Active shell ${locale} update locale GitHub API error context`);
  assertTextExcludesAll(text, updateLocaleForbidden, `Active shell ${locale} update locale English update fallback`);
}

function validateShellLocalizedRuntimeText(shellPaths, requiresLocale) {
  for (const locale of enabledLocales(requiresLocale)) {
    validateFirstRunLocale(shellPaths, locale);
    validateUpdateLocale(shellPaths, locale);
  }
}

export function validateRuntimeSettings(shellPaths) {
  const runtimeSettings = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx',
    runtimeSettingsExpected,
    'Active shell Runtime settings',
  );
  assertTextDoesNotMatch(
    runtimeSettings,
    /med[-_ ]?deep[-_ ]?scientist|module_id['"]?\s*:\s*['"]mds['"]/i,
    'Active shell Runtime settings must not default-display Med Deep Scientist/MDS.',
  );
  assertTextExcludesAll(
    runtimeSettings,
    ["data-testid='settings-maintenance-management-details'", 'visible={diagnosticsVisible}', '<RuntimeReadinessGrid'],
    'Active shell Maintenance must not retain a second large management modal',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/renderer/pages/settings/RuntimeSettings/runtimeSettingsViewModel.tsx',
    runtimeSettingsViewModelExpected,
    'Active shell Runtime settings maintenance hub view model',
  );
}

function validateTrayStartup(shellPaths) {
  const trayStartup = assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/startup/runtime/trayStartup.ts',
    trayStartupExpected,
    'Active shell desktop tray startup App-owned tray policy',
  );
  assertTextExcludesAll(
    trayStartup,
    ['if (deps.getCloseToTrayEnabled())', 'if (getCloseToTrayEnabled())'],
    'Active shell desktop tray visibility close-to-tray gate',
  );
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/index.ts', desktopMainExpected, 'Active shell desktop startup App-owned tray policy');
  assertShellTextIncludesAll(shellPaths, 'packages/desktop/src/process/utils/closeToTraySetting.ts', closeToTraySettingExpected, 'Active shell close-to-tray settings bridge App-owned tray preference key');
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/src/process/utils/tray.ts',
    trayIconExpected,
    'Active shell macOS tray template image policy',
  );
  assertShellTextIncludesAll(
    shellPaths,
    'packages/desktop/electron-builder.yml',
    trayPackagingExpected,
    'Active shell tray image packaging',
  );
  for (const filename of ['trayTemplate.png', 'trayTemplate@2x.png']) {
    assertFile(
      path.join(shellPaths.shellRoot, 'resources', 'opl-branding', filename),
      `active shell macOS tray asset ${filename}`,
    );
  }
}

export function validateShellSubstrateImplementation(shellPaths, requiresLocale) {
  validateAppStateHook(shellPaths);
  validateRuntimeBridgeSurface(shellPaths);
  validateShellLocalizedRuntimeText(shellPaths, requiresLocale);
  validateRuntimeSettings(shellPaths);
  validateTrayStartup(shellPaths);
}
