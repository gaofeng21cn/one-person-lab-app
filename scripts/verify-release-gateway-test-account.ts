import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

type VerifyOptions = {
  emailFile: string;
  passwordFile: string;
  outputPath?: string;
  controlBaseUrl?: string;
  allowInsecureLocalhost?: boolean;
};

type JsonRecord = Record<string, unknown>;

class RetryableGatewayRequestError extends Error {}

export type GatewayReleaseTestAccountReceipt = {
  schema: 'opl_release_gateway_test_account_qualification.v1';
  status: 'passed';
  account_policy: {
    role: 'user';
    account_status: 'active';
    balance_amount: 0;
    account_identity_present: true;
    profile_email_matches_configured: true;
  };
  credential_or_token_fields_in_receipt: false;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function unwrap(value: unknown): JsonRecord {
  const candidate = record(value);
  if ('data' in candidate) return unwrap(candidate.data);
  if ('result' in candidate) return unwrap(candidate.result);
  return candidate;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requestErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown transport failure';
  const cause = error instanceof Error ? record(error.cause) : {};
  const code = nonEmptyText(cause.code);
  return code ? `${message} (${code})` : message;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readCredentialFile(filePath: string, label: string): string {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new Error(`${label} must use mode 0600.`);
  }
  if (stat.size < 1 || stat.size > 4096) {
    throw new Error(`${label} has an invalid size.`);
  }
  const value = fs.readFileSync(filePath, 'utf8');
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} has an invalid value.`);
  }
  return value;
}

function normalizedControlBaseUrl(raw: string, allowInsecureLocalhost: boolean): string {
  const url = new URL(raw);
  const localTestEndpoint = allowInsecureLocalhost
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localTestEndpoint) {
    throw new Error('Gateway release-test account verification requires HTTPS.');
  }
  return raw.replace(/\/+$/, '');
}

async function requestJson(
  baseUrl: string,
  route: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: JsonRecord } = {},
): Promise<JsonRecord> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await requestJsonOnce(baseUrl, route, options);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableGatewayRequestError
        || (error instanceof TypeError && error.message === 'fetch failed')
        || (error instanceof DOMException && error.name === 'AbortError');
      if (!retryable) throw error;
      if (attempt === REQUEST_ATTEMPTS) break;
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(
    `Gateway release-test account request failed after ${REQUEST_ATTEMPTS} attempts: ${requestErrorSummary(lastError)}`,
  );
}

async function requestJsonOnce(
  baseUrl: string,
  route: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: JsonRecord } = {},
): Promise<JsonRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method ?? 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error('Gateway release-test account response is too large.');
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
      throw new Error('Gateway release-test account response is too large.');
    }
    if (!response.ok) {
      if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new RetryableGatewayRequestError(`Gateway returned HTTP ${response.status}.`);
      }
      throw new Error(`Gateway release-test account request failed with HTTP ${response.status}.`);
    }
    let parsed: unknown;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      throw new Error('Gateway release-test account response is not valid JSON.');
    }
    const envelope = record(parsed);
    if (envelope.code !== undefined) {
      const code = envelope.code;
      if (![0, 200, '0', '200', 'success'].includes(code as number | string)) {
        throw new Error('Gateway release-test account request was rejected.');
      }
    }
    return unwrap(parsed);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export async function verifyReleaseGatewayTestAccount(
  options: VerifyOptions,
): Promise<GatewayReleaseTestAccountReceipt> {
  const email = readCredentialFile(options.emailFile, 'Gateway release-test account email file');
  const password = readCredentialFile(options.passwordFile, 'Gateway release-test account password file');
  const baseUrl = normalizedControlBaseUrl(
    options.controlBaseUrl ?? 'https://gateway.medopl.com/api/v1',
    options.allowInsecureLocalhost === true,
  );
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    const session = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    accessToken = nonEmptyText(session.access_token ?? session.accessToken ?? session.token);
    refreshToken = nonEmptyText(session.refresh_token ?? session.refreshToken);
    if (!accessToken || !refreshToken) {
      throw new Error('Gateway release-test account login did not return a persistent session.');
    }

    const profileEnvelope = await requestJson(baseUrl, '/user/profile', { token: accessToken });
    const profile = Object.keys(record(profileEnvelope.user)).length > 0
      ? record(profileEnvelope.user)
      : profileEnvelope;
    const role = nonEmptyText(profile.role ?? profile.user_role ?? profile.userRole)?.toLowerCase();
    const status = nonEmptyText(profile.status)?.toLowerCase();
    const profileEmail = nonEmptyText(profile.email)?.toLowerCase();
    const accountId = nonEmptyText(profile.id ?? profile.user_id ?? profile.userId)
      ?? (typeof profile.id === 'number' && Number.isFinite(profile.id) ? String(profile.id) : null);
    const balance = Number(profile.balance ?? profile.balance_amount ?? profileEnvelope.balance);

    if (role !== 'user') {
      throw new Error('Gateway release qualification refuses administrator or non-user accounts.');
    }
    if (status !== 'active') {
      throw new Error('Gateway release-test account must be active.');
    }
    if (!accountId) {
      throw new Error('Gateway release-test account profile has no account identity.');
    }
    if (profileEmail !== email.trim().toLowerCase()) {
      throw new Error('Gateway release-test account profile does not match the configured identity.');
    }
    if (!Number.isFinite(balance) || balance !== 0) {
      throw new Error('Gateway release-test account must have a zero balance.');
    }

    const receipt: GatewayReleaseTestAccountReceipt = {
      schema: 'opl_release_gateway_test_account_qualification.v1',
      status: 'passed',
      account_policy: {
        role: 'user',
        account_status: 'active',
        balance_amount: 0,
        account_identity_present: true,
        profile_email_matches_configured: true,
      },
      credential_or_token_fields_in_receipt: false,
    };
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
      fs.writeFileSync(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    }
    return receipt;
  } finally {
    if (accessToken && refreshToken) {
      await requestJson(baseUrl, '/auth/logout', {
        method: 'POST',
        token: accessToken,
        body: { refresh_token: refreshToken },
      }).catch(() => undefined);
    }
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const emailFile = argumentValue('--email-file');
  const passwordFile = argumentValue('--password-file');
  const outputPath = argumentValue('--output');
  if (!emailFile || !passwordFile || !outputPath) {
    throw new Error('Usage: verify-release-gateway-test-account.ts --email-file <path> --password-file <path> --output <path>');
  }
  await verifyReleaseGatewayTestAccount({ emailFile, passwordFile, outputPath });
  process.stdout.write('Gateway release-test account preflight passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown verification failure.';
    process.stderr.write(`Gateway release-test account preflight failed: ${message}\n`);
    process.exitCode = 1;
  });
}
