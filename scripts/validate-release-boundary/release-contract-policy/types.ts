export type ReleaseContract = Record<string, any>;

export function sameStringSet(actual: unknown, expected: string[]): boolean {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((entry) => actual.includes(entry))
  );
}

export function stringArrayIncludesAll(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && expected.every((entry) => actual.includes(entry));
}
