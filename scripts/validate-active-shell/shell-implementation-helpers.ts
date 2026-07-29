import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { commandMaxBuffer, assertFile } from './validation-config.ts';

export function readShellText(shellPaths, relativePath) {
  const filePath = path.join(shellPaths.shellRoot, relativePath);
  assertFile(filePath, `active shell implementation file ${relativePath}`);
  return readFileSync(filePath, 'utf8');
}

export function readShellJson(shellPaths, relativePath, label) {
  const text = readShellText(shellPaths, relativePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Active shell ${label} must be valid JSON: ${error.message}`);
  }
}

export function assertShellTextIncludes(shellPaths, relativePath, expected, label) {
  const text = readShellText(shellPaths, relativePath);
  if (!text.includes(expected)) {
    throw new Error(`Active shell ${label} must include ${expected} in ${relativePath}`);
  }
  return text;
}

export function assertTextIncludesAll(text, expectedValues, label) {
  for (const expected of expectedValues) {
    if (!text.includes(expected)) {
      throw new Error(`${label} must include ${expected}`);
    }
  }
}

export function assertTextIncludesOneOf(text, alternatives, label) {
  if (!alternatives.some((alternative) => alternative.every((expected) => text.includes(expected)))) {
    const expected = alternatives.map((alternative) => `[${alternative.join(', ')}]`).join(' or ');
    throw new Error(`${label} must include one of ${expected}`);
  }
}

export function assertTextExcludesAll(text, forbiddenValues, label) {
  for (const forbidden of forbiddenValues) {
    if (text.includes(forbidden)) {
      throw new Error(`${label} must not include ${forbidden}`);
    }
  }
}

export function assertTextDoesNotMatch(text, pattern, label) {
  if (pattern.test(text)) {
    throw new Error(label);
  }
}

export function assertShellTextIncludesAll(shellPaths, relativePath, expectedValues, label) {
  const text = readShellText(shellPaths, relativePath);
  assertTextIncludesAll(text, expectedValues, `${label} in ${relativePath}`);
  return text;
}

export function assertShellFileHash(shellPaths, relativePath, expectedHash, label) {
  const filePath = path.join(shellPaths.shellRoot, relativePath);
  assertFile(filePath, label);
  const result = spawnSync('shasum', ['-a', '256', filePath], {
    encoding: 'utf8',
    maxBuffer: commandMaxBuffer,
  });
  if (result.error) {
    throw new Error(`Failed to hash ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Failed to hash ${label}: ${result.stderr.trim()}`);
  }
  const actualHash = result.stdout.trim().split(/\s+/)[0];
  if (actualHash !== expectedHash) {
    throw new Error(`Active shell ${label} hash must be ${expectedHash}; got ${actualHash}`);
  }
}
