import fs from 'node:fs';
import path from 'node:path';

import {
  listFullRuntimeProductionNodeModulePaths,
  shouldExcludeNodeToolchainPackagePath,
  shouldExcludeProductionNodeModulePath,
  shouldExcludeRuntimePath,
} from '../full-first-install-package.ts';

const ALL_DESCENDANTS = ['**/*', '**/.*', '**/.*/**/*'];

export function requirePath(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath || '(empty)'}`);
  }
  return filePath;
}

export function directorySizeBytes(root) {
  if (!fs.existsSync(root)) {
    return 0;
  }
  const resolvedRootStat = fs.statSync(root);
  if (resolvedRootStat.isFile()) {
    return resolvedRootStat.size;
  }
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory()) {
    return rootStat.size;
  }

  const symlinks = new Set();
  const entries = fs.globSync(ALL_DESCENDANTS, {
    cwd: root,
    withFileTypes: true,
    exclude(entry) {
      if (entry.isSymbolicLink()) {
        symlinks.add(path.join(entry.parentPath, entry.name));
        return true;
      }
      return false;
    },
  });
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      total += fs.lstatSync(path.join(entry.parentPath, entry.name)).size;
    }
  }
  for (const symlink of symlinks) total += fs.lstatSync(symlink).size;
  return total;
}

export function copyTreeFiltered(sourceRoot, targetRoot, runtimePrefix) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    dereference: true,
    force: true,
    errorOnExist: false,
    filter(sourcePath) {
      const relativePath = path.relative(sourceRoot, sourcePath);
      if (!relativePath) return true;
      const runtimeRelative = path.posix.join(runtimePrefix, relativePath.split(path.sep).join('/'));
      if (shouldExcludeRuntimePath(runtimeRelative)) return false;
      const stat = fs.lstatSync(sourcePath);
      return stat.isDirectory() || stat.isFile() || stat.isSymbolicLink();
    },
  });
  const directoryMode = 0o777 & ~process.umask();
  fs.chmodSync(targetRoot, directoryMode);
  for (const entry of fs.globSync(ALL_DESCENDANTS, { cwd: targetRoot, withFileTypes: true })) {
    if (entry.isDirectory()) {
      fs.chmodSync(path.join(entry.parentPath, entry.name), directoryMode);
    }
  }
}

export function copySingleFile(sourcePath, targetPath) {
  copyFileWithMode(sourcePath, targetPath);
}

function isInsidePath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function copyFileWithMode(sourcePath, targetPath, stat = fs.statSync(sourcePath)) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, stat.mode);
}

function copyDirectoryEntries(sourcePath, targetPath, copyEntry) {
  fs.mkdirSync(targetPath, { recursive: true });
  for (const entry of fs.readdirSync(sourcePath)) {
    copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry), entry);
  }
}

function copyPortableInternalSymlink(targetPath, sourceBase, targetBase, resolvedSourceTarget) {
  if (!isInsidePath(sourceBase, resolvedSourceTarget)) {
    return false;
  }

  const targetEquivalent = path.join(targetBase, path.relative(sourceBase, resolvedSourceTarget));
  const portableLinkTarget = path.relative(path.dirname(targetPath), targetEquivalent) || '.';
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.symlinkSync(portableLinkTarget, targetPath);
  return true;
}

export function copyPortableTree(sourceRoot, targetRoot) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  const sourceBase = path.resolve(sourceRoot);
  const targetBase = path.resolve(targetRoot);

  const copyEntry = (sourcePath, targetPath) => {
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirectoryEntries(sourcePath, targetPath, copyEntry);
      return;
    }

    if (stat.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(sourcePath);
      const resolvedSourceTarget = path.resolve(path.dirname(sourcePath), linkTarget);
      if (copyPortableInternalSymlink(targetPath, sourceBase, targetBase, resolvedSourceTarget)) {
        return;
      }

      const realStat = fs.statSync(resolvedSourceTarget);
      if (realStat.isDirectory()) {
        copyPortableTree(resolvedSourceTarget, targetPath);
        return;
      }
      copyFileWithMode(resolvedSourceTarget, targetPath, realStat);
      return;
    }

    if (stat.isFile()) {
      copyFileWithMode(sourcePath, targetPath, stat);
    }
  };

  copyEntry(sourceBase, targetBase);
}

export function assertNoExternalSymlinks(root, label) {
  const rootPath = path.resolve(root);
  const symlinks = new Set();
  const rootStat = fs.lstatSync(rootPath);
  if (rootStat.isSymbolicLink()) {
    symlinks.add(rootPath);
  } else if (rootStat.isDirectory()) {
    fs.globSync(ALL_DESCENDANTS, {
      cwd: rootPath,
      withFileTypes: true,
      exclude(entry) {
        if (entry.isSymbolicLink()) {
          symlinks.add(path.join(entry.parentPath, entry.name));
          return true;
        }
        return false;
      },
    });
  }
  const violations = [];
  for (const current of symlinks) {
    const linkTarget = fs.readlinkSync(current);
    const resolvedTarget = path.resolve(path.dirname(current), linkTarget);
    if (path.isAbsolute(linkTarget) || !isInsidePath(rootPath, resolvedTarget)) {
      violations.push(`${path.relative(rootPath, current)} -> ${linkTarget}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`${label} contains external symlink(s):\n${violations.map((entry) => `  - ${entry}`).join('\n')}`);
  }
}

export function copyPathContents(sourceRoot, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  if (!fs.existsSync(sourceRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(sourceRoot)) {
    copyPortableTree(path.join(sourceRoot, entry), path.join(targetRoot, entry));
  }
}

export function copyExecutableOrSymlinkTarget(sourceRoot, relativePath, targetRoot) {
  const sourcePath = path.join(sourceRoot, ...relativePath.split('/'));
  const targetPath = path.join(targetRoot, ...relativePath.split('/'));
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    const resolved = fs.realpathSync(sourcePath);
    const realStat = fs.statSync(resolved);
    copyFileWithMode(resolved, targetPath, realStat);
    return;
  }
  copySingleFile(sourcePath, targetPath);
}

export function copyNodeRuntimePayload(nodeRoot, targetRoot, npmRoot = path.join(nodeRoot, 'lib', 'node_modules', 'npm')) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  for (const relativePath of ['bin/node', 'bin/npm', 'bin/npx']) {
    const sourcePath = path.join(nodeRoot, relativePath);
    if (relativePath !== 'bin/node' && fs.lstatSync(sourcePath).isSymbolicLink()) {
      const resolved = fs.realpathSync(sourcePath);
      const packageRelative = path.relative(fs.realpathSync(npmRoot), resolved);
      if (isInsidePath(fs.realpathSync(npmRoot), resolved)) {
        const targetPath = path.join(targetRoot, relativePath);
        const packageTarget = path.join(targetRoot, 'lib', 'node_modules', 'npm', packageRelative);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.symlinkSync(path.relative(path.dirname(targetPath), packageTarget), targetPath);
        continue;
      }
    }
    copyExecutableOrSymlinkTarget(nodeRoot, relativePath, targetRoot);
  }
  // Homebrew and the official macOS Node builds keep the Node shared library
  // beside the toolchain's npm tree. The node executable refers to it through
  // @rpath, so the packaged runtime must carry the matching dylib alongside
  // the copied toolchain instead of relying on the build machine's Cellar.
  const nodeLibraryRoot = path.join(nodeRoot, 'lib');
  if (fs.existsSync(nodeLibraryRoot)) {
    for (const entry of fs.readdirSync(nodeLibraryRoot)) {
      if (!/^libnode[^/]*\.dylib$/.test(entry)) continue;
      const sourcePath = path.join(nodeLibraryRoot, entry);
      if (!fs.statSync(sourcePath).isFile()) continue;
      copySingleFile(sourcePath, path.join(targetRoot, 'lib', entry));
    }
  }
  for (const packageName of ['npm', 'corepack']) {
    const sourcePath = packageName === 'npm' ? npmRoot : path.join(nodeRoot, 'lib', 'node_modules', packageName);
    if (!fs.existsSync(sourcePath)) {
      if (packageName === 'corepack') continue;
      throw new Error(`Node runtime package missing: lib/node_modules/${packageName}`);
    }
    copyNodeToolchainPackage(sourcePath, path.join(targetRoot, 'lib', 'node_modules', packageName));
  }
  assertNoExternalSymlinks(targetRoot, 'Full first-install Node runtime');
}

function copyNodeToolchainPackage(sourceRoot, targetRoot) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  const sourceBase = path.resolve(sourceRoot);
  const targetBase = path.resolve(targetRoot);

  const copyEntry = (sourcePath, targetPath, relativePath) => {
    if (relativePath && shouldExcludeNodeToolchainPackagePath(relativePath)) {
      return;
    }
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirectoryEntries(sourcePath, targetPath, (childSourcePath, childTargetPath, entry) => {
        copyEntry(childSourcePath, childTargetPath, path.posix.join(relativePath, entry));
      });
      return;
    }

    if (stat.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(sourcePath);
      const resolvedSourceTarget = path.resolve(path.dirname(sourcePath), linkTarget);
      if (copyPortableInternalSymlink(targetPath, sourceBase, targetBase, resolvedSourceTarget)) {
        return;
      }

      const realStat = fs.statSync(resolvedSourceTarget);
      if (realStat.isDirectory()) {
        copyDirectoryEntries(resolvedSourceTarget, targetPath, (childSourcePath, childTargetPath, entry) => {
          copyEntry(childSourcePath, childTargetPath, path.posix.join(relativePath, entry));
        });
        return;
      }
      copyFileWithMode(resolvedSourceTarget, targetPath, realStat);
      return;
    }

    if (stat.isFile()) {
      copyFileWithMode(sourcePath, targetPath, stat);
    }
  };

  copyEntry(sourceBase, targetRoot, '');
}

export function copyProductionNodeModules(sourceRoot, targetRoot) {
  const lockPath = path.join(sourceRoot, 'package-lock.json');
  const nodeModulesRoot = path.join(sourceRoot, 'node_modules');
  if (!fs.existsSync(lockPath) || !fs.existsSync(nodeModulesRoot)) {
    return;
  }
  const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  for (const relativePath of listFullRuntimeProductionNodeModulePaths(packageLock)) {
    const sourcePath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(targetRoot, relativePath);
    copyProductionNodeModule(sourcePath, targetPath);
  }
}

function copyProductionNodeModule(sourceRoot, targetRoot) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  const sourceBase = path.resolve(sourceRoot);

  const copyEntry = (sourcePath, targetPath) => {
    const relativePath = path.relative(sourceBase, sourcePath).split(path.sep).join('/');
    if (relativePath && shouldExcludeProductionNodeModulePath(relativePath)) {
      return;
    }
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirectoryEntries(sourcePath, targetPath, copyEntry);
      return;
    }
    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(sourcePath);
      const realStat = fs.statSync(realPath);
      if (realStat.isDirectory()) {
        copyDirectoryEntries(realPath, targetPath, copyEntry);
        return;
      }
      if (realStat.isFile()) {
        copyFileWithMode(realPath, targetPath, realStat);
      }
      return;
    }
    if (stat.isFile()) {
      copyFileWithMode(sourcePath, targetPath, stat);
    }
  };

  copyEntry(sourceBase, targetRoot);
}
