import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fileSha256 as readFileSha256 } from '../release-file-helpers.ts';
import {
  listFullRuntimeProductionNodeModulePaths,
  shouldExcludeProductionNodeModulePath,
  shouldExcludeRuntimePath,
} from '../full-first-install-package.ts';

export function existingFileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return readFileSha256(filePath);
}

export function directoryFingerprint(root, runtimePrefix) {
  if (!fs.existsSync(root)) {
    return null;
  }
  return treeFingerprint(root, (relative) => shouldExcludeRuntimePath(path.posix.join(runtimePrefix, relative)));
}

function treeFingerprint(root, shouldExcludeRelativePath) {
  const hash = crypto.createHash('sha256');
  const stack = [['', root]];
  while (stack.length > 0) {
    const [relative, current] = stack.pop();
    const normalizedRelative = relative.split(path.sep).join('/');
    if (normalizedRelative && shouldExcludeRelativePath(normalizedRelative)) {
      continue;
    }
    const stat = fs.lstatSync(current);
    hash.update(relative);
    hash.update(stat.isDirectory() ? 'dir' : stat.isSymbolicLink() ? 'symlink' : 'file');
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort().reverse()) {
        stack.push([path.join(relative, entry), path.join(current, entry)]);
      }
    } else if (stat.isSymbolicLink()) {
      hash.update(fs.readlinkSync(current));
    } else if (stat.isFile()) {
      hash.update(fs.readFileSync(current));
    }
  }
  return hash.digest('hex');
}

export function productionNodeModulesFingerprint(sourceRoot) {
  const lockPath = path.join(sourceRoot, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const productionPaths = listFullRuntimeProductionNodeModulePaths(packageLock);
  const hash = crypto.createHash('sha256');
  for (const relativePath of productionPaths) {
    const absolutePath = path.join(sourceRoot, relativePath);
    hash.update(relativePath);
    hash.update(fs.existsSync(absolutePath) ? productionNodeModuleFingerprint(absolutePath) : 'missing');
  }
  return hash.digest('hex');
}

function productionNodeModuleFingerprint(root) {
  return treeFingerprint(root, shouldExcludeProductionNodeModulePath);
}

export function packageJsonVersion(packagePath) {
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}
