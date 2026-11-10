import { appRoot, assert, fs, path, test } from './helpers.ts';
import { validateBrandedDeepLinkPolicy } from '../../../scripts/validate-active-shell/gui-product-contract-validator.ts';
import { validateBrandedDeepLinkProbeContract } from '../../../scripts/validate-active-shell/shell-settings-and-team-validator.ts';

function readPolicy() {
  const contract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-gui-product-contract.json'), 'utf8'),
  );
  return structuredClone(contract.branded_deep_link_policy);
}

function readAdapter() {
  return structuredClone(
    JSON.parse(
      fs.readFileSync(path.join(appRoot, 'contracts/app-shell-adapter.json'), 'utf8'),
    ),
  );
}

test('branded deep links use only opl:// and a hostname-only navigate action', () => {
  assert.doesNotThrow(() => validateBrandedDeepLinkPolicy(readPolicy()));

  for (const mutate of [
    (policy: any) => {
      policy.scheme = 'aionui';
    },
    (policy: any) => {
      policy.accepted_schemes.push('aionui');
    },
    (policy: any) => {
      policy.action_authority = 'hostname_or_path_alias';
    },
    (policy: any) => {
      policy.allowed_actions.push('provider/add');
    },
  ]) {
    const policy = readPolicy();
    mutate(policy);
    assert.throws(() => validateBrandedDeepLinkPolicy(policy), /branded deep-link policy/);
  }
});

test('branded deep links reject unknown duplicate and opaque query payloads', () => {
  for (const mutate of [
    (policy: any) => {
      policy.action_schemas.navigate.additional_params_allowed = true;
    },
    (policy: any) => {
      policy.action_schemas.navigate.duplicate_params_allowed = true;
    },
    (policy: any) => {
      policy.action_schemas.navigate.optional_params.push('source');
    },
    (policy: any) => {
      policy.forbidden_parameter_names = policy.forbidden_parameter_names.filter(
        (name: string) => name !== 'data',
      );
    },
    (policy: any) => {
      policy.opaque_payload_policy = 'decode_base64_json';
    },
  ]) {
    const policy = readPolicy();
    mutate(policy);
    assert.throws(() => validateBrandedDeepLinkPolicy(policy), /branded deep-link policy/);
  }
});

test('branded deep links reject credential actions and secret-like material', () => {
  for (const mutate of [
    (policy: any) => {
      policy.forbidden_credential_actions = ['add-provider'];
    },
    (policy: any) => {
      policy.forbidden_parameter_names = policy.forbidden_parameter_names.filter(
        (name: string) => name !== 'api_key',
      );
    },
    (policy: any) => {
      policy.secret_like_value_prefixes = policy.secret_like_value_prefixes.filter(
        (prefix: string) => prefix !== 'sk-',
      );
    },
    (policy: any) => {
      policy.invalid_input_policy.parameter_value_logging_allowed = true;
    },
  ]) {
    const policy = readPolicy();
    mutate(policy);
    assert.throws(() => validateBrandedDeepLinkPolicy(policy), /branded deep-link policy/);
  }
});

test('branded deep links keep navigation inside the exact App-owned route registry', () => {
  const policy = readPolicy();
  assert.ok(policy.route_registry.static_exact_routes.includes('/apps'));
  assert.deepStrictEqual(policy.route_registry.allowed_section_routes, [
    '/apps?section=applications',
    '/apps?section=updates',
    '/apps?section=resources',
    '/apps?section=sources',
    '/settings/environment?section=updates',
  ]);

  for (const mutate of [
    (policy: any) => {
      policy.route_registry.static_exact_routes.push('/conversation/:id');
    },
    (policy: any) => {
      policy.route_registry.static_exact_routes.push('/runtime');
    },
    (policy: any) => {
      policy.route_registry.match_policy = 'prefix_or_pattern_match';
    },
    (policy: any) => {
      policy.route_registry.settings_route_source_ref = 'shell_local_routes';
    },
    (policy: any) => {
      policy.route_registry.allowed_section_routes.push('/apps?section=unknown');
    },
    (policy: any) => {
      policy.route_registry.allowed_section_routes.push('/apps?section=updates&source=external');
    },
    (policy: any) => {
      policy.route_registry.allowed_section_routes.push('/apps?section=updates#diagnostics');
    },
  ]) {
    const policy = readPolicy();
    mutate(policy);
    assert.throws(() => validateBrandedDeepLinkPolicy(policy), /branded deep-link policy/);
  }
});

test('invalid deep links stay local fail-open across cold warm and second-instance delivery', () => {
  for (const mutate of [
    (policy: any) => {
      policy.delivery_paths = ['cold_start_argv', 'warm_macos_open_url'];
    },
    (policy: any) => {
      policy.delivery_policy = 'delivery_path_specific_parsers';
    },
    (policy: any) => {
      policy.invalid_input_policy.interaction = 'block_startup';
    },
    (policy: any) => {
      policy.invalid_input_policy.raw_url_logging_allowed = true;
    },
    (policy: any) => {
      policy.invalid_input_policy.pending_invalid_state_allowed = true;
    },
  ]) {
    const policy = readPolicy();
    mutate(policy);
    assert.throws(() => validateBrandedDeepLinkPolicy(policy), /branded deep-link policy/);
  }
});

test('active shell adapter requires every branded deep-link implementation probe', () => {
  assert.doesNotThrow(() => validateBrandedDeepLinkProbeContract(readAdapter()));

  for (const mutate of [
    (adapter: any) => {
      adapter.implementation_probes.branded_deep_link_surface.source_ref = 'shell_local_policy';
    },
    (adapter: any) => {
      adapter.implementation_probes.branded_deep_link_surface.probes.pop();
    },
    (adapter: any) => {
      adapter.implementation_probes.branded_deep_link_surface.probes[0].required = false;
    },
    (adapter: any) => {
      adapter.implementation_probes.branded_deep_link_surface.probes[1].required_evidence = [];
    },
  ]) {
    const adapter = readAdapter();
    mutate(adapter);
    assert.throws(() => validateBrandedDeepLinkProbeContract(adapter), /branded deep-link/);
  }
});
