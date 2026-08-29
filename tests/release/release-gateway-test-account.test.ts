import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyReleaseGatewayTestAccount } from '../../scripts/verify-release-gateway-test-account.ts';

type Profile = {
  id: number;
  email: string;
  role: string;
  status: string;
  balance: number;
};

async function withGateway(
  profile: Profile,
  run: (baseUrl: string, calls: string[]) => Promise<void>,
  options: { disconnectLoginAttempts?: number; unavailableLoginAttempts?: number } = {},
) {
  const calls: string[] = [];
  let disconnectedLoginAttempts = 0;
  let unavailableLoginAttempts = 0;
  const server = http.createServer((request, response) => {
    calls.push(`${request.method} ${request.url}`);
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && request.url === '/auth/login') {
      if (disconnectedLoginAttempts < (options.disconnectLoginAttempts ?? 0)) {
        disconnectedLoginAttempts += 1;
        request.socket.destroy();
        return;
      }
      if (unavailableLoginAttempts < (options.unavailableLoginAttempts ?? 0)) {
        unavailableLoginAttempts += 1;
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'temporarily unavailable' }));
        return;
      }
      response.end(JSON.stringify({ data: { access_token: 'access-secret', refresh_token: 'refresh-secret' } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/user/profile') {
      response.end(JSON.stringify({ data: { user: profile } }));
      return;
    }
    if (request.method === 'POST' && request.url === '/auth/logout') {
      response.end(JSON.stringify({ code: 0, data: {} }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function credentialFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-release-account-'));
  const emailFile = path.join(root, 'email');
  const passwordFile = path.join(root, 'password');
  const outputPath = path.join(root, 'receipt.json');
  fs.writeFileSync(emailFile, 'release-test@example.invalid', { mode: 0o600 });
  fs.writeFileSync(passwordFile, 'dedicated-test-password', { mode: 0o600 });
  fs.chmodSync(emailFile, 0o600);
  fs.chmodSync(passwordFile, 0o600);
  return { root, emailFile, passwordFile, outputPath };
}

test('release Gateway preflight accepts only the active zero-balance user and emits no identity or secret', async () => {
  const fixture = credentialFixture();
  try {
    await withGateway({
      id: 42,
      email: 'release-test@example.invalid',
      role: 'user',
      status: 'active',
      balance: 0,
    }, async (baseUrl, calls) => {
      const receipt = await verifyReleaseGatewayTestAccount({
        emailFile: fixture.emailFile,
        passwordFile: fixture.passwordFile,
        outputPath: fixture.outputPath,
        controlBaseUrl: baseUrl,
        allowInsecureLocalhost: true,
        retryDelayMs: 1,
      });
      assert.deepEqual(receipt.account_policy, {
        role: 'user',
        account_status: 'active',
        balance_amount: 0,
        account_identity_present: true,
        profile_email_matches_configured: true,
      });
      assert.deepEqual(calls, [
        'POST /auth/login',
        'GET /user/profile',
        'POST /auth/logout',
      ]);
      const serialized = fs.readFileSync(fixture.outputPath, 'utf8');
      for (const forbidden of [
        'release-test@example.invalid',
        'dedicated-test-password',
        'access-secret',
        'refresh-secret',
        '42',
      ]) assert.doesNotMatch(serialized, new RegExp(forbidden));
    });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('release Gateway preflight retries a transient transport failure without weakening account checks', async () => {
  const fixture = credentialFixture();
  try {
    await withGateway({
      id: 42,
      email: 'release-test@example.invalid',
      role: 'user',
      status: 'active',
      balance: 0,
    }, async (baseUrl, calls) => {
      const receipt = await verifyReleaseGatewayTestAccount({
        emailFile: fixture.emailFile,
        passwordFile: fixture.passwordFile,
        outputPath: fixture.outputPath,
        controlBaseUrl: baseUrl,
        allowInsecureLocalhost: true,
        retryDelayMs: 1,
      });
      assert.equal(receipt.status, 'passed');
      assert.deepEqual(calls, [
        'POST /auth/login',
        'POST /auth/login',
        'GET /user/profile',
        'POST /auth/logout',
      ]);
    }, { disconnectLoginAttempts: 1 });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('release Gateway preflight reports the transport cause after bounded retries', async () => {
  const fixture = credentialFixture();
  try {
    await withGateway({
      id: 42,
      email: 'release-test@example.invalid',
      role: 'user',
      status: 'active',
      balance: 0,
    }, async (baseUrl, calls) => {
      await assert.rejects(
        verifyReleaseGatewayTestAccount({
          emailFile: fixture.emailFile,
          passwordFile: fixture.passwordFile,
          outputPath: fixture.outputPath,
          controlBaseUrl: baseUrl,
          allowInsecureLocalhost: true,
          retryDelayMs: 1,
        }),
        /request failed after 5 attempts: fetch failed/,
      );
      assert.deepEqual(calls, [
        'POST /auth/login',
        'POST /auth/login',
        'POST /auth/login',
        'POST /auth/login',
        'POST /auth/login',
      ]);
      assert.equal(fs.existsSync(fixture.outputPath), false);
    }, { disconnectLoginAttempts: 5 });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('release Gateway preflight retries a transient HTTP failure', async () => {
  const fixture = credentialFixture();
  try {
    await withGateway({
      id: 42,
      email: 'release-test@example.invalid',
      role: 'user',
      status: 'active',
      balance: 0,
    }, async (baseUrl, calls) => {
      const receipt = await verifyReleaseGatewayTestAccount({
        emailFile: fixture.emailFile,
        passwordFile: fixture.passwordFile,
        outputPath: fixture.outputPath,
        controlBaseUrl: baseUrl,
        allowInsecureLocalhost: true,
        retryDelayMs: 1,
      });
      assert.equal(receipt.status, 'passed');
      assert.deepEqual(calls, [
        'POST /auth/login',
        'POST /auth/login',
        'GET /user/profile',
        'POST /auth/logout',
      ]);
    }, { unavailableLoginAttempts: 1 });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const [name, profile, expected] of [
  [
    'administrator account',
    { id: 1, email: 'release-test@example.invalid', role: 'admin', status: 'active', balance: 0 },
    /refuses administrator or non-user accounts/,
  ],
  [
    'funded account',
    { id: 2, email: 'release-test@example.invalid', role: 'user', status: 'active', balance: 1 },
    /must have a zero balance/,
  ],
] as const) {
  test(`release Gateway preflight rejects ${name}`, async () => {
    const fixture = credentialFixture();
    try {
      await withGateway(profile, async (baseUrl, calls) => {
        await assert.rejects(
          verifyReleaseGatewayTestAccount({
            emailFile: fixture.emailFile,
            passwordFile: fixture.passwordFile,
            outputPath: fixture.outputPath,
            controlBaseUrl: baseUrl,
            allowInsecureLocalhost: true,
            retryDelayMs: 1,
          }),
          expected,
        );
        assert.equal(fs.existsSync(fixture.outputPath), false);
        assert.deepEqual(calls, [
          'POST /auth/login',
          'GET /user/profile',
          'POST /auth/logout',
        ]);
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}
