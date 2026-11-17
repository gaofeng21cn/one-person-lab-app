import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { assertStringArrayIncludes } from '../value-assertions.ts';

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function assertIncludesAll(actual, expected, label) {
  assertStringArrayIncludes(actual, expected, label);
}

export function assertDeepEqualJson(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
  }
}

function assertStringArrayExact(actual, expected, label) {
  assertDeepEqualJson(actual, expected, label);
  if (!Array.isArray(actual) || actual.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${label} must be a non-empty string array`);
  }
}

export function assertForbiddenCapabilityPolicy(actual, expected, label) {
  for (const field of ['exact', 'prefixes', 'contains']) {
    assertStringArrayExact(actual?.forbidden_mcp_matchers?.[field], expected.forbidden_mcp_matchers[field], `${label}.${field}`);
  }
  assertStringArrayExact(actual?.scrub_extra_keys, expected.scrub_extra_keys, `${label}.scrub_extra_keys`);
}
