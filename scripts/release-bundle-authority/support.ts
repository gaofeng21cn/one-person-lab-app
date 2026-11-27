import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

export type ErrorCode =
  | 'contract_file_missing'
  | 'contract_json_invalid'
  | 'contract_shape_invalid'
  | 'cli_usage_error'
  | 'unknown_command';

function defaultExitCode(code: ErrorCode): number {
  switch (code) {
    case 'cli_usage_error':
    case 'unknown_command':
      return 2;
    case 'contract_file_missing':
    case 'contract_json_invalid':
    case 'contract_shape_invalid':
      return 3;
  }
}

export class FrameworkContractError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    exitCode = defaultExitCode(code),
  ) {
    super(message);
    this.name = 'FrameworkContractError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }

  toJSON() {
    return {
      version: 'g2',
      error: {
        code: this.code,
        message: this.message,
        exit_code: this.exitCode,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonText(raw: string): unknown {
  return JSON.parse(raw);
}

export function formatJsonPayload(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function canonicalFail(message: string, jsonPath: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { path: jsonPath, ...details });
}

function assertUnicodeScalarString(value: string, jsonPath: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        canonicalFail('Canonical JSON does not allow lone Unicode surrogates.', jsonPath, { string_offset: index });
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      canonicalFail('Canonical JSON does not allow lone Unicode surrogates.', jsonPath, { string_offset: index });
    }
  }
}

function canonicalValueText(value: unknown, jsonPath: string): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, jsonPath);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      canonicalFail('Canonical JSON does not allow non-finite numbers.', jsonPath);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      canonicalFail('Canonical JSON does not allow symbol keys.', jsonPath);
    }
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        canonicalFail('Canonical JSON does not allow sparse arrays.', `${jsonPath}/${index}`);
      }
      entries.push(canonicalValueText(value[index], `${jsonPath}/${index}`));
    }
    if (Object.keys(value).length !== value.length) {
      canonicalFail('Canonical JSON arrays cannot carry named properties.', jsonPath);
    }
    return `[${entries.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      canonicalFail('Canonical JSON only accepts plain JSON objects.', jsonPath);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      canonicalFail('Canonical JSON does not allow symbol keys.', jsonPath);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (Object.getOwnPropertyNames(record).length !== keys.length) {
      canonicalFail('Canonical JSON objects cannot carry non-enumerable properties.', jsonPath);
    }
    for (const key of keys) assertUnicodeScalarString(key, `${jsonPath}/<key>`);
    return `{${keys.sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        canonicalFail('Canonical JSON objects cannot carry accessor properties.', `${jsonPath}/${key}`);
      }
      const entry = record[key];
      if (entry === undefined || typeof entry === 'bigint' || typeof entry === 'function' || typeof entry === 'symbol') {
        canonicalFail('Canonical JSON contains an unsupported value.', `${jsonPath}/${key}`, { value_type: typeof entry });
      }
      return `${JSON.stringify(key)}:${canonicalValueText(entry, `${jsonPath}/${key}`)}`;
    }).join(',')}}`;
  }
  canonicalFail('Canonical JSON contains an unsupported value.', jsonPath, { value_type: typeof value });
}

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalValueText(value, '$'), 'utf8');
}

export function resolveOplStatePaths(input: { dataDir?: string | null } = {}) {
  const explicitStateDir = process.env.OPL_STATE_DIR?.trim() || null;
  const homeDir = process.env.HOME?.trim() || os.homedir();
  const dataDir = input.dataDir?.trim() || process.env.OPL_DATA_DIR?.trim() || null;
  const stateDir = explicitStateDir
    ? path.resolve(explicitStateDir)
    : dataDir
      ? path.join(path.resolve(dataDir), 'opl', 'state')
      : path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
  return { state_dir: stateDir };
}

const schemaDir = path.resolve(import.meta.dirname, '../../contracts/release-bundle');

export function loadReleaseBundleSchema(fileName: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(schemaDir, fileName), 'utf8')) as Record<string, unknown>;
}

const ajv = new (Ajv2020 as unknown as new (options: Record<string, unknown>) => {
  compile(schema: AnySchema): ValidateFunction;
})({ allErrors: true, strict: false });
(addFormats as unknown as (instance: unknown) => void)(ajv);

const compiledValidators = new Map<string, ValidateFunction>();

export type JsonSchemaRegistryEntry = {
  schemaId: string;
  schema: AnySchema;
  sourceRef?: string;
};

function schemaIdentity(schema: AnySchema, fallback: string): string {
  if (!isRecord(schema)) return fallback;
  if (typeof schema.schema_id === 'string' && schema.schema_id.length > 0) return schema.schema_id;
  if (typeof schema.$id === 'string' && schema.$id.length > 0) return schema.$id;
  return fallback;
}

function normalizeAjvErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((error) => ({
    instance_path: error.instancePath,
    schema_path: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'JSON Schema validation failed.',
    params: error.params as Record<string, unknown>,
  }));
}

function getCompiledValidator(entry: JsonSchemaRegistryEntry): ValidateFunction {
  const schemaId = schemaIdentity(entry.schema, entry.schemaId);
  const cached = compiledValidators.get(schemaId);
  if (cached) return cached;
  try {
    const compiled = ajv.compile(entry.schema);
    compiledValidators.set(schemaId, compiled);
    return compiled;
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'JSON Schema contract could not be compiled by Ajv.',
      {
        schema_id: entry.schemaId,
        source_ref: entry.sourceRef,
        cause: error instanceof Error ? error.message : 'Ajv schema compilation failed.',
      },
    );
  }
}

export function assertJsonSchemaPayload(
  entry: JsonSchemaRegistryEntry,
  payload: unknown,
): void {
  const validate = getCompiledValidator(entry);
  if (validate(payload)) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Payload failed JSON Schema validation.',
    {
      schema_id: entry.schemaId,
      ...(entry.sourceRef ? { source_ref: entry.sourceRef } : {}),
      errors: normalizeAjvErrors(validate.errors),
    },
  );
}
