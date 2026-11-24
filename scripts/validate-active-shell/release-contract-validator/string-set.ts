export function sameStringSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}
