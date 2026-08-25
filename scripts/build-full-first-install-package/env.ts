import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';

import {
  FULL_FIRST_INSTALL_OUTPUT_DIR,
  FULL_RELEASE_OUTPUT_DIR,
} from '../full-first-install-package.ts';
import { resolveActiveShellPaths } from '../app-shell-adapter.ts';
import { appRepoRoot, workspaceRoot } from './paths.ts';
import { resolveFullCarrierProfile } from './carrier-profile.ts';

function defaultRuntimeCacheDir() {
  if (process.env.OPL_FULL_RUNTIME_CACHE_DIR?.trim()) {
    return process.env.OPL_FULL_RUNTIME_CACHE_DIR;
  }
  return path.join(os.homedir(), 'Library', 'Caches', 'One Person Lab', 'full-runtime-layers');
}

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function firstEnvValue(names, fallback) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return fallback;
}

function defaultMainRef(name) {
  return envValue(name, 'main');
}

function defaultOutputDir() {
  return process.env.CI === 'true'
    ? path.join(appRepoRoot, FULL_RELEASE_OUTPUT_DIR)
    : FULL_FIRST_INSTALL_OUTPUT_DIR;
}

function executableOnPath(name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, name);
    try {
      if (fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch {
      // Continue to the next PATH entry.
    }
  }
  return null;
}

function defaultReleaseOptions() {
  return {
    version: process.env.OPL_RELEASE_VERSION || '26.5.1',
    updaterVersion: process.env.OPL_UPDATER_VERSION || process.env.OPL_RELEASE_VERSION || '26.5.1',
    outDir: defaultOutputDir(),
  };
}

function defaultWorkspaceRoots() {
  return {
    frameworkRoot: firstEnvValue(
      ['OPL_FRAMEWORK_ROOT', 'OPL_FULL_OPL_ROOT'],
      path.join(workspaceRoot, 'one-person-lab'),
    ),
    guiRoot: envValue('OPL_FULL_GUI_ROOT', resolveActiveShellPaths().shellRoot),
    masRoot: envValue('OPL_FULL_MAS_ROOT', path.join(workspaceRoot, 'med-autoscience')),
    masScholarSkillsRoot: envValue(
      'OPL_FULL_MAS_SCHOLAR_SKILLS_ROOT',
      path.join(workspaceRoot, 'mas-scholar-skills'),
    ),
    magRoot: envValue('OPL_FULL_MAG_ROOT', path.join(workspaceRoot, 'med-autogrant')),
    rcaRoot: envValue('OPL_FULL_RCA_ROOT', path.join(workspaceRoot, 'redcube-ai')),
    metaAgentRoot: envValue('OPL_FULL_META_AGENT_ROOT', path.join(workspaceRoot, 'opl-meta-agent')),
    bookforgeRoot: envValue('OPL_FULL_BOOKFORGE_ROOT', path.join(workspaceRoot, 'opl-bookforge')),
    oplFlowRoot: envValue('OPL_FULL_OPL_FLOW_ROOT', path.join(workspaceRoot, 'opl-flow')),
    officeCliRoot: envValue('OPL_FULL_OFFICECLI_ROOT', path.join(workspaceRoot, 'OfficeCLI')),
    mineruRoot: envValue('OPL_FULL_MINERU_ROOT', path.join(workspaceRoot, 'MinerU-Ecosystem')),
    mineruDocumentExtractorRoot: envValue(
      'OPL_FULL_MINERU_DOCUMENT_EXTRACTOR_ROOT',
      path.join(appRepoRoot, 'assets', 'companion-skills', 'mineru-document-extractor'),
    ),
  };
}

function defaultToolchainOptions() {
  return {
    nodeBin: envValue('OPL_FULL_NODE_BIN', ''),
    bunBin: envValue('OPL_FULL_BUN_BIN', ''),
    uvBin: envValue(
      'OPL_FULL_UV_BIN',
      executableOnPath('uv') || path.join(os.homedir(), '.local', 'bin', 'uv'),
    ),
    temporalCliBin: envValue('OPL_FULL_TEMPORAL_CLI_BIN', ''),
    temporalCliArchive: envValue('OPL_FULL_TEMPORAL_CLI_ARCHIVE', ''),
    pythonRoot: envValue('OPL_FULL_PYTHON_ROOT', ''),
    officeCliBin: envValue('OPL_FULL_OFFICECLI_BIN', ''),
    mineruOpenApiBin: envValue('OPL_FULL_MINERU_OPEN_API_BIN', ''),
  };
}

function defaultRuntimeOptions() {
  return {
    skipGuiBuild: false,
    appOnly: false,
    warmRuntimeCacheOnly: false,
    splitRuntime: process.env.OPL_FULL_SPLIT_RUNTIME === '1',
    reuseGuiViteOutput: process.env.OPL_FULL_REUSE_GUI_VITE_OUTPUT === '1',
    includeBunRuntime: process.env.OPL_FULL_INCLUDE_BUN_RUNTIME === '1',
    runtimeCacheDir: defaultRuntimeCacheDir(),
    runtimeCacheMode: process.env.OPL_FULL_RUNTIME_CACHE_MODE || 'readwrite',
    printRuntimeCacheKeys: false,
  };
}

function defaultRuntimeRefs() {
  return {
    frameworkRef: firstEnvValue(['OPL_FULL_FRAMEWORK_REF', 'OPL_FRAMEWORK_REF'], null),
    masRef: defaultMainRef('OPL_FULL_MAS_REF'),
    masScholarSkillsRef: defaultMainRef('OPL_FULL_MAS_SCHOLAR_SKILLS_REF'),
    magRef: defaultMainRef('OPL_FULL_MAG_REF'),
    rcaRef: defaultMainRef('OPL_FULL_RCA_REF'),
    metaAgentRef: defaultMainRef('OPL_FULL_META_AGENT_REF'),
    bookforgeRef: defaultMainRef('OPL_FULL_BOOKFORGE_REF'),
    oplFlowRef: defaultMainRef('OPL_FULL_OPL_FLOW_REF'),
    officeCliRef: envValue('OPL_FULL_OFFICECLI_REF', 'latest-stable'),
    mineruRef: defaultMainRef('OPL_FULL_MINERU_REF'),
  };
}

function defaultOptions() {
  return {
    ...defaultReleaseOptions(),
    ...defaultWorkspaceRoots(),
    ...defaultToolchainOptions(),
    ...defaultRuntimeOptions(),
    ...defaultRuntimeRefs(),
    carrierId: process.env.OPL_FULL_CARRIER_ID?.trim() || resolveFullCarrierProfile().carrierId,
  };
}

const booleanOptionSetters = {
  'skip-gui-build': (parsed) => { parsed.skipGuiBuild = true; },
  'app-only': (parsed) => { parsed.appOnly = true; },
  'warm-runtime-cache-only': (parsed) => { parsed.warmRuntimeCacheOnly = true; },
  'split-runtime': (parsed) => { parsed.splitRuntime = true; },
  'reuse-gui-vite-output': (parsed) => { parsed.reuseGuiViteOutput = true; },
  'print-runtime-cache-keys': (parsed) => { parsed.printRuntimeCacheKeys = true; },
  'include-bun-runtime': (parsed) => { parsed.includeBunRuntime = true; },
};

const valueOptionSetters = {
  version: (parsed, value) => { parsed.version = value; },
  'updater-version': (parsed, value) => { parsed.updaterVersion = value; },
  'out-dir': (parsed, value) => { parsed.outDir = path.resolve(value); },
  'framework-root': (parsed, value) => { parsed.frameworkRoot = path.resolve(value); },
  'opl-root': (parsed, value) => { parsed.frameworkRoot = path.resolve(value); },
  'gui-root': (parsed, value) => { parsed.guiRoot = path.resolve(value); },
  'mas-root': (parsed, value) => { parsed.masRoot = path.resolve(value); },
  'mas-scholar-skills-root': (parsed, value) => {
    parsed.masScholarSkillsRoot = path.resolve(value);
  },
  'mas-scholar-skills-ref': (parsed, value) => { parsed.masScholarSkillsRef = value; },
  'mag-root': (parsed, value) => { parsed.magRoot = path.resolve(value); },
  'rca-root': (parsed, value) => { parsed.rcaRoot = path.resolve(value); },
  'meta-agent-root': (parsed, value) => { parsed.metaAgentRoot = path.resolve(value); },
  'bookforge-root': (parsed, value) => { parsed.bookforgeRoot = path.resolve(value); },
  'opl-flow-root': (parsed, value) => { parsed.oplFlowRoot = path.resolve(value); },
  'node-bin': (parsed, value) => { parsed.nodeBin = path.resolve(value); },
  'bun-bin': (parsed, value) => { parsed.bunBin = path.resolve(value); },
  'uv-bin': (parsed, value) => { parsed.uvBin = path.resolve(value); },
  'temporal-cli-bin': (parsed, value) => { parsed.temporalCliBin = path.resolve(value); },
  'temporal-cli-archive': (parsed, value) => { parsed.temporalCliArchive = path.resolve(value); },
  'python-root': (parsed, value) => { parsed.pythonRoot = path.resolve(value); },
  'officecli-bin': (parsed, value) => { parsed.officeCliBin = path.resolve(value); },
  'officecli-root': (parsed, value) => { parsed.officeCliRoot = path.resolve(value); },
  'mineru-open-api-bin': (parsed, value) => { parsed.mineruOpenApiBin = path.resolve(value); },
  'mineru-root': (parsed, value) => { parsed.mineruRoot = path.resolve(value); },
  'mineru-document-extractor-root': (parsed, value) => {
    parsed.mineruDocumentExtractorRoot = path.resolve(value);
  },
  'runtime-cache-dir': (parsed, value) => { parsed.runtimeCacheDir = path.resolve(value); },
  'runtime-cache-mode': (parsed, value) => { parsed.runtimeCacheMode = value; },
  'carrier-id': (parsed, value) => { parsed.carrierId = value; },
};

const nodeOptionConfig = Object.fromEntries([
  ...Object.keys(booleanOptionSetters).map((name) => [name, { type: 'boolean' }]),
  ...Object.keys(valueOptionSetters).map((name) => [name, { type: 'string' }]),
]);

function rawArgument(token) {
  return token.inlineValue ? `${token.rawName}=${token.value ?? ''}` : token.rawName;
}

function parseOptionTokens(argv) {
  return parseNodeArgs({
    args: argv,
    options: nodeOptionConfig,
    allowPositionals: true,
    strict: false,
    tokens: true,
  }).tokens;
}

function requireValueToken(token) {
  if (token.inlineValue) {
    throw new Error(`Unknown argument: ${rawArgument(token)}`);
  }
  if (!token.value || token.value.startsWith('--')) {
    throw new Error(`Missing value for ${token.rawName}`);
  }
  return token.value;
}

export function parseArgs(argv) {
  const parsed = defaultOptions();

  for (const token of parseOptionTokens(argv)) {
    if (token.kind === 'positional') {
      throw new Error(`Unknown argument: ${token.value}`);
    }

    const applyBoolean = booleanOptionSetters[token.name];
    if (applyBoolean) {
      if (token.inlineValue) {
        throw new Error(`Unknown argument: ${rawArgument(token)}`);
      }
      applyBoolean(parsed);
      continue;
    }

    const applyValue = valueOptionSetters[token.name];
    if (!applyValue) {
      throw new Error(`Unknown argument: ${rawArgument(token)}`);
    }
    applyValue(parsed, requireValueToken(token));
  }

  if (!['readwrite', 'readonly', 'off'].includes(parsed.runtimeCacheMode)) {
    throw new Error(`Unsupported runtime cache mode: ${parsed.runtimeCacheMode}`);
  }
  if (parsed.appOnly && parsed.warmRuntimeCacheOnly) {
    throw new Error('--app-only and --warm-runtime-cache-only are mutually exclusive');
  }

  return parsed;
}
