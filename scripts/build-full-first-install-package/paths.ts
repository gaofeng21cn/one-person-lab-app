import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const workspaceRoot = path.dirname(appRepoRoot);
export const MACOS_ARM64_TEMPORAL_CORE_BRIDGE_TARGET = 'aarch64-apple-darwin';
export const MACOS_NATIVE_CODE_EXTENSIONS = new Set(['.dylib', '.node', '.so']);
export const MACOS_TRUSTED_EXECUTABLE_PATTERNS = [
  /^runtime\/current\/bin\/officecli$/,
  /^runtime\/current\/bin\/mineru-open-api$/,
  /^runtime\/current\/bin\/bun$/,
  /^runtime\/current\/node\/bin\/node$/,
  /^runtime\/current\/uv\/bin\/uv$/,
  /^runtime\/current\/vendor\/temporal\/cli\/temporal$/,
  /^runtime\/current\/python\/[^/]+\/bin\/python(?:3(?:\.\d+)?)?$/,
];
