import fs from 'node:fs';
import path from 'node:path';

import type { ContractConformanceStatus, JsonRecord } from './contract.ts';

export function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}
export function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

export function sameStrings(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(stringArray(actual)) === JSON.stringify(expected);
}

export function conformanceStatus(matches: boolean): ContractConformanceStatus {
  return matches ? 'aligned_contract' : 'current_contract_deviation';
}

export function readJson(root: string, relativePath: string, issues: Set<string>): JsonRecord {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    issues.add(`missing ${relativePath}`);
    return {};
  }
  try {
    return record(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    issues.add(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}
