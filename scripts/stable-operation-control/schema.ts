import crypto from 'node:crypto';

export type JsonRecord = Record<string, unknown>;

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const runIdPattern = /^[1-9][0-9]*$/;
const noncePattern = /^[0-9a-f]{32}$/;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type StableOperationControl = {
  schema: 'opl_app_stable_operation_control.v1';
  status: 'admitted';
  operation: 'standard';
  operation_id: string;
  actor: string;
  run_id: string;
  run_attempt: 1;
  nonce: string;
  nonce_digest: string;
  consumed_once: false;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  desktop_additional_platforms: string[];
  critical_blobs: Record<string, string>;
  source_gate_digest: string;
  pre_nonce_guard_digest: string;
  run_authority_reconcile_digest: string;
  authority_digest: string;
  issued_authority: StableOperationAuthority;
};

export type StableOperationAuthority = {
  schema: 'opl_app_stable_operation_authority.v1';
  status: 'issued';
  issuance: {
    source: 'operator_issued_github_dispatch_input';
    cryptographic_signature: false;
  };
  authority_id: string;
  operation: 'standard';
  operation_id: string;
  issuer: string;
  issued_at: string;
  expires_at: string;
  objective_fingerprint: string;
  nonce: string;
  nonce_digest: string;
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
  };
  desktop_additional_platforms: string[];
  critical_blobs: Record<string, string>;
  source_gate_digest: string;
  pre_nonce_guard_digest: string;
  pre_dispatch_evidence: {
    source_gate: JsonRecord;
    pre_nonce_guard: JsonRecord;
  };
  authority_digest: string;
};

export type StableOperationConsumption = {
  schema: 'opl_app_stable_operation_consumption.v1';
  status: 'consumed';
  operation: 'standard';
  operation_id: string;
  control_authority_digest: string;
  run_id: string;
  run_attempt: 1;
  nonce_digest: string;
  run_authority_reconcile_digest: string;
  consumed_once: true;
  consumption_digest: string;
};

export function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one JSON object.`);
  }
  return value as JsonRecord;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

export function exactSha(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact Git commit SHA.`);
  return normalized;
}

export function digest(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!digestPattern.test(normalized)) throw new Error(`${label} must be an exact SHA-256 digest.`);
  return normalized;
}

export function runId(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!runIdPattern.test(normalized)) throw new Error(`${label} must be a positive GitHub run id.`);
  return normalized;
}

export function runAttempt(value: unknown, label: string): 1 {
  if (Number(value) !== 1) throw new Error(`${label} must equal 1.`);
  return 1;
}

export function nonce(value: unknown, label: string): string {
  const normalized = text(value, label).toLowerCase();
  if (!noncePattern.test(normalized)) throw new Error(`${label} must be 16 random bytes encoded in lowercase hex.`);
  return normalized;
}

export function operationId(value: unknown): string {
  const normalized = text(value, 'operation_id');
  if (!operationIdPattern.test(normalized)) throw new Error('operation_id is not canonical.');
  return normalized;
}

export function isoInstant(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized)) || !/Z$/.test(normalized)) {
    throw new Error(`${label} must be an ISO-8601 UTC instant.`);
  }
  return normalized;
}

export function objectiveFingerprint(value: unknown): string {
  const normalized = text(value, 'objective_fingerprint');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(normalized)) {
    throw new Error('objective_fingerprint is not canonical.');
  }
  return normalized;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = value as JsonRecord;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}

export function objectDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function nonceDigest(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

const stableDesktopAdditionalPlatformIds = [
  'linux-x64',
  'windows-x64',
] as const;

export const defaultStableDesktopAdditionalPlatformIds = ['linux-x64', 'windows-x64'] as const;

export function normalizedStableDesktopAdditionalPlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('desktop_additional_platforms must be one JSON array of audited Stable additional Desktop platform IDs.');
  }
  const selected = new Set<string>();
  for (const platform of value) {
    if (
      typeof platform !== 'string'
      || !(stableDesktopAdditionalPlatformIds as readonly string[]).includes(platform)
      || selected.has(platform)
    ) {
      throw new Error('desktop_additional_platforms contains an unknown or duplicate platform ID.');
    }
    selected.add(platform);
  }
  return stableDesktopAdditionalPlatformIds.filter((platform) => selected.has(platform));
}
