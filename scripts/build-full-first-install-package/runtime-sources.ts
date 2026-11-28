import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveActiveShellPaths } from '../app-shell-adapter.ts';

import { requirePath } from './filesystem.ts';
import { findExecutable } from './process.ts';
import { assertFullRuntimeSourcePortable } from './precompression.ts';

function existingFile(candidate) {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

function firstExistingFile(candidates) {
  return candidates.filter(Boolean).find((candidate) => existingFile(candidate));
}

function findCompanionBinary(input) {
  const candidates = [
    input.explicitBin,
    input.envBin,
    findExecutable(input.name) || '',
    path.join(os.homedir(), '.local', 'bin', input.name),
  ];
  const found = firstExistingFile(candidates);
  if (!found) {
    throw new Error(`${input.name} binary not found. Install ${input.name} or pass ${input.flagName} / set ${input.envName}.`);
  }
  return found;
}

function findOfficeCliBinary(explicitBin) {
  return findCompanionBinary({
    name: 'officecli',
    explicitBin,
    envBin: process.env.OPL_OFFICECLI_BIN || '',
    flagName: '--officecli-bin',
    envName: 'OPL_FULL_OFFICECLI_BIN',
  });
}

function findMineruOpenApiBinary(explicitBin) {
  return findCompanionBinary({
    name: 'mineru-open-api',
    explicitBin,
    envBin: process.env.OPL_MINERU_OPEN_API_BIN || '',
    flagName: '--mineru-open-api-bin',
    envName: 'OPL_FULL_MINERU_OPEN_API_BIN',
  });
}

function requireNodeToolchainFile(nodeBinDir, name) {
  const filePath = path.join(nodeBinDir, name);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Node toolchain file not found: ${filePath}`);
  }
  return filePath;
}

function requireNodeToolchainDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`Node toolchain directory not found: ${directoryPath}`);
  }
  return directoryPath;
}

export function findNodeToolchain(explicitNodeBin, guiRoot) {
  const candidates = [
    explicitNodeBin,
    process.execPath,
  ];
  const found = firstExistingFile(candidates);
  if (!found) {
    throw new Error('Node binary not found. Pass --node-bin or set OPL_FULL_NODE_BIN.');
  }
  const shell = resolveActiveShellPaths({ shellRoot: guiRoot });
  const relativeManifest = shell.contract.shell_contract.paths.desktop_release_carrier_manifest;
  if (typeof relativeManifest !== 'string') throw new Error('Selected carrier has no desktop release manifest.');
  const carrier = JSON.parse(fs.readFileSync(path.join(shell.shellRoot, relativeManifest), 'utf8'));
  const adapter = carrier.node_host_runtime;
  if (typeof adapter !== 'string' || path.isAbsolute(adapter) || adapter.split(/[\\/]/).some(part => !part || part === '..' || part === '.')) {
    throw new Error('Selected carrier must declare its Node Host runtime admission adapter.');
  }
  const { resolveHostNode } = createRequire(import.meta.url)(path.join(shell.shellRoot, adapter));
  const admitted = resolveHostNode({ nodeExecutable: found });
  const nodeBin = admitted.command;
  const nodeBinDir = path.dirname(nodeBin);
  assertFullRuntimeSourcePortable(path.dirname(path.dirname(fs.realpathSync(nodeBin))), 'Full Node toolchain');
  const npmBin = requireNodeToolchainFile(nodeBinDir, 'npm');
  const npxBin = requireNodeToolchainFile(nodeBinDir, 'npx');
  // Homebrew's unversioned Node links npm outside its Cellar prefix. Resolve
  // the sibling launchers rather than assuming a lib directory beside Node.
  const npmRoot = path.dirname(path.dirname(fs.realpathSync(npmBin)));
  const npxRoot = path.dirname(path.dirname(fs.realpathSync(npxBin)));
  const packageRoot = fs.existsSync(path.join(npmRoot, 'package.json'))
    ? npmRoot
    : path.join(path.dirname(nodeBinDir), 'lib', 'node_modules', 'npm');
  if (npmRoot !== npxRoot) {
    throw new Error('Node toolchain npm and npx must resolve to the same package.');
  }
  return {
    nodeBin,
    npmBin,
    npxBin,
    npmRoot: fs.realpathSync(requireNodeToolchainDirectory(packageRoot)),
  };
}

export function findBunBinary(explicitBunBin) {
  const candidates = [
    explicitBunBin,
    findExecutable('bun') || '',
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
  ];
  const found = firstExistingFile(candidates);
  if (!found) {
    throw new Error('Bun binary not found. Pass --bun-bin or set OPL_FULL_BUN_BIN.');
  }
  return found;
}

function findPythonRoot(explicitPythonRoot) {
  if (explicitPythonRoot) {
    return requirePath(explicitPythonRoot, 'Python root');
  }

  const uvPythonRoot = path.join(os.homedir(), '.local', 'share', 'uv', 'python');
  const candidates = fs.existsSync(uvPythonRoot)
    ? fs.readdirSync(uvPythonRoot)
        .filter((entry) => /^cpython-3\.12\..*-macos-aarch64-none$/.test(entry))
        .sort()
        .reverse()
        .map((entry) => path.join(uvPythonRoot, entry))
    : [];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'bin', 'python3')));
  if (!found) {
    throw new Error('uv-managed Python 3.12 arm64 root not found. Pass --python-root or set OPL_FULL_PYTHON_ROOT.');
  }
  return found;
}

export function resolveRuntimeSources(options, selectedFlowCliIds) {
  if (!Array.isArray(selectedFlowCliIds)) {
    throw new Error('Full runtime source resolution requires the Framework-generated Flow CLI selection.');
  }
  const selected = new Set(selectedFlowCliIds);
  const unsupported = [...selected].filter((id) => id !== 'officecli' && id !== 'mineru-open-api');
  if (unsupported.length > 0) {
    throw new Error(`Full runtime has no source adapter for selected Flow CLI: ${unsupported.join(', ')}.`);
  }
  const nodeToolchain = findNodeToolchain(options.nodeBin, options.guiRoot);
  const bunBin = options.includeBunRuntime ? findBunBinary(options.bunBin) : null;
  const pythonRoot = findPythonRoot(options.pythonRoot);
  const uvBin = requirePath(options.uvBin, 'uv binary');
  const officeCliBin = selected.has('officecli') ? findOfficeCliBinary(options.officeCliBin) : null;
  const mineruOpenApiBin = selected.has('mineru-open-api')
    ? findMineruOpenApiBinary(options.mineruOpenApiBin)
    : null;

  return {
    nodeToolchain,
    bunBin,
    pythonRoot,
    uvBin,
    officeCliBin,
    mineruOpenApiBin,
    mineruRepoRoot: fs.existsSync(path.join(options.mineruRoot, '.git')) ? options.mineruRoot : null,
  };
}
