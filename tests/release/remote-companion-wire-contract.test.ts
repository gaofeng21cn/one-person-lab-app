import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateRemoteCompanionWireContract } from '../../scripts/validate-active-shell/remote-companion-validator.ts';

const read = (name: string) => JSON.parse(fs.readFileSync(`contracts/${name}.json`, 'utf8')) as Record<string, any>;
const wire = () => read('app-remote-companion-wire');
type Contract = Record<string, any>;
const rejects = (mutate: (value: Contract) => void, pattern?: RegExp) => {
  const value = wire();
  mutate(value);
  assert.throws(() => validateRemoteCompanionWireContract(value), pattern);
};

test('Studio wire exposes a closed companion route family with separate desktop and phone credentials', () => {
  assert.doesNotThrow(() => validateRemoteCompanionWireContract(wire(), read('app-remote-companion')));
  for (const route of ['POST /pair', 'DELETE /devices/:id']) {
    rejects(w => { w.host_routes[route].auth = 'device_bearer'; }, /auth/);
  }
  rejects(w => { w.host_routes['POST /claim'].auth = 'anonymous'; }, /auth/);
  rejects(w => { w.client_routes['POST /account/claim'].auth = 'gateway_account_access_token'; }, /auth/);
  rejects(w => { w.client_routes['POST /account/claim'].input = ['deviceName', 'clientId']; }, /account claim input/);
  rejects(w => { w.client_routes['POST /invoke'].auth = 'desktop_session'; }, /auth/);
  rejects(w => { w.client_routes['POST /execute-action'] = { auth: 'device_bearer' }; }, /supported values/);
  rejects(w => { w.host_routes['DELETE /devices/:id'].effect = 'keep_existing_streams'; }, /effect/);
});

test('a companion token cannot admit arbitrary owner APIs or shell execution', () => {
  for (const method of ['executeAction', 'configureCodexApiKey', 'shell.exec', 'readState']) {
    rejects(w => { w.methods[method] = 'unrestricted_host_invoke'; }, /allowlist/);
  }
  rejects(w => { delete w.methods.respondToServerRequest; }, /allowlist/);
});

test('device credentials remain bound to a trusted HTTPS origin and bounded lifetime', () => {
  rejects(w => { w.origin_policy = 'follow_any_redirect_or_accept_self_signed'; }, /origin_policy/);
  rejects(w => { w.base_path = '/api'; }, /base_path/);
  rejects(w => { w.pairing_url = 'opllink://pair?code=<secret>'; }, /pairing URL/);
  rejects(w => { w.pairing_ttl_seconds = 0; }, /lifetime/);
  rejects(w => { w.pairing_ttl_seconds = 121; }, /lifetime/);
  rejects(w => { w.credential_ttl_days = 31; }, /expire/);
  rejects(w => { w.security = w.security.filter((x: string) => x !== 'hash_device_credentials_at_rest'); }, /security/);
  const value = wire();
  const policy = read('app-remote-companion');
  policy.pairing.ttl_seconds = value.pairing_ttl_seconds - 1;
  assert.throws(() => validateRemoteCompanionWireContract(value, policy), /lifetimes must agree/);
});

test('mutation correlation and canonical reread prevent automatic replay after an unknown result', () => {
  rejects(w => { w.client_routes['POST /invoke'].input = ['method', 'payload']; }, /invocation input/);
  rejects(w => { w.mutation_policy = 'retry_until_success'; }, /mutation_policy/);
  rejects(w => { w.event_policy = 'reconnect_then_replay_pending_commands'; }, /event_policy/);
  rejects(w => { w.client_routes['POST /invoke'].output = { result: 'phone_history_cache' }; }, /result/);
});

test('file downloads remain thread-relative and generic credential listings exclude tokens', () => {
  rejects(w => { w.client_routes['POST /download'].input = ['absolutePath']; }, /download input/);
  rejects(w => { w.host_routes['GET /devices'].output.devices = 'devices_with_plaintext_tokens'; }, /devices/);
  rejects(w => { w.security = w.security.filter((x: string) => x !== 'workspace_realpath_and_symlink_bounds'); }, /security/);
});
