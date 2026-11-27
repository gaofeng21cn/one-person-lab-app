import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export interface FullFrameworkIdentity {
  api_version: '2.0';
  version: string;
  official_root_package_ids: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function positive(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function isFullFrameworkIdentity(value: unknown): value is FullFrameworkIdentity {
  const identity = record(value);
  const roots = identity.official_root_package_ids;
  return identity.api_version === '2.0' && typeof identity.version === 'string' && identity.version.trim().length > 0
    && Array.isArray(roots) && roots.length > 0 && new Set(roots).size === roots.length
    && roots.every((id) => typeof id === 'string' && id.trim().length > 0);
}

export function validateFullFrameworkDaemonProof(
  value: unknown, identity: FullFrameworkIdentity, frameworkSha: string | null, manifestDigest: string | null,
): string[] {
  if (!isFullFrameworkIdentity(identity)) return ['Invalid frozen Full Framework identity'];
  const proof = record(value);
  if (proof.schema !== 'opl_framework_daemon_proof.v1' || proof.status !== 'passed'
      || proof.network_mode !== 'offline' || proof.api_version !== identity.api_version || proof.version !== identity.version
      || !frameworkSha || proof.framework_sha !== frameworkSha
      || !manifestDigest || proof.full_package_manifest_sha256 !== manifestDigest) {
    return ['Full Framework daemon proof does not match the frozen Full build'];
  }
  const before = record(proof.before_restart);
  const after = record(proof.after_restart);
  const errors: string[] = [];
  if (!positive(before.pid) || !positive(after.pid) || before.pid === after.pid) {
    errors.push('Full Framework daemon restart requires two distinct process IDs');
  }
  if (!positive(before.sqlite_schema_version) || after.sqlite_schema_version !== before.sqlite_schema_version
      || typeof before.database_path !== 'string' || !path.isAbsolute(before.database_path)
      || path.basename(before.database_path) !== 'opl.db' || before.database_path !== after.database_path
      || typeof before.database_file_identity !== 'string' || !/^\d+:\d+$/.test(before.database_file_identity)
      || before.database_file_identity !== after.database_file_identity) {
    errors.push('Full Framework database identity or schema changed across restart');
  }
  const packages = Array.isArray(before.packages) ? before.packages.map(record) : [];
  const ids = new Set(packages.map(item => item.package_id));
  if (ids.size !== packages.length || !isDeepStrictEqual(before.packages, after.packages)
      || packages.some(item => typeof item.package_id !== 'string' || !item.package_id.trim()
        || typeof item.version !== 'string' || !item.version.trim())
      || identity.official_root_package_ids.some(id => !ids.has(id))) {
    errors.push('Full Framework enabled packages did not preserve the Official Profile across restart');
  }
  return errors;
}
