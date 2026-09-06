import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8')) as Record<string, any>;

const productActionMapping = () => ({
  'canonical_task.list': 'conversation.list',
  'canonical_task.read': 'conversation.open',
  'canonical_task.refresh': 'conversation.refresh',
  'canonical_task.start': 'conversation.start',
  'canonical_task.send_text': 'conversation.send_text',
  'canonical_turn.stop': 'conversation.turn.stop',
  'canonical_approval.respond': 'conversation.approval.respond',
  'pair.revoke': 'pair.revoke',
});

const serializeAssociatedData = (fields: string[], values: Record<string, string | number>) =>
  fields
    .map((field) => {
      const value = String(values[field]);
      return `${field}=${Buffer.byteLength(value, 'utf8')}:${value}`;
    })
    .join('|');

const decryptVector = (vector: Record<string, any>, associatedData: string) => {
  const ciphertextAndTag = Buffer.from(vector.ciphertext_and_tag_hex, 'hex');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(vector.derived_key_hex, 'hex'),
    Buffer.from(vector.nonce_hex, 'hex'),
  );
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(ciphertextAndTag.subarray(-16));
  return Buffer.concat([decipher.update(ciphertextAndTag.subarray(0, -16)), decipher.final()]).toString('utf8');
};

test('OPL Link wire contract has one serverless control plane and encrypted transport shape', () => {
  const product = readJson('contracts/app-remote-companion.json');
  const wire = readJson('contracts/app-remote-companion-wire.json');
  assert.equal(wire.schema, 'opl_app_remote_companion_wire.v2');
  assert.equal(wire.service_owner, 'opl-link/service');
  assert.equal(wire.protocol_version, product.transport.protocol);
  assert.equal(product.source_refs.wire_contract, 'contracts/app-remote-companion-wire.json');
  assert.deepEqual(wire.target_runtime, {
    control_plane_compute: 'cloudflare_workers_free',
    control_plane_persistence: 'cloudflare_d1_free',
    realtime_provider: 'ably_free',
    always_on_application_server_required: false,
    local_resident_service_required: false,
    cloudflare_tunnel_required: false,
  });
  assert.deepEqual(wire.compatibility.manual_code, {
    status: 'short_code_user_fallback',
    client_behavior: 'resolve_through_the_configured_ios_worker_origin_then_reuse_the_same_code_in_the_existing_claim_request',
    resolution_eligibility: 'reserved_pairing_before_first_claim_only',
  });
  assert.deepEqual(wire.compatibility.legacy_transport_identifiers, {
    status: 'v1_wire_aliases_only',
    action_prefix: 'canonical_task',
    event_prefix: 'task',
    product_object: 'canonical_codex_conversation',
    product_semantics_source: 'contracts/app-remote-companion.json#surface_boundary.conversation_model',
    must_not_be_interpreted_as: 'opl_link_task_control_plane_or_task_lifecycle_authority',
  });
  assert.equal(wire.app_access_projection.view_type, 'remote_companion_access');
  assert.equal(
    wire.app_access_projection.result_schema_ref,
    'contracts/opl-app-contributions.schema.json#/$defs/remote_companion_access_result',
  );
  assert.deepEqual(wire.app_access_projection.actions, [
    'pair.start',
    'pair.refresh',
    'pair.confirm',
    'pair.cancel',
    'device.rename',
    'pair.revoke',
  ]);
  assert.equal(wire.app_access_projection.secret_policy.qr_payload_only_when, 'status_equals_qr_ready');
  assert.equal(wire.app_access_projection.secret_policy.qr_payload_max_length, 8192);
  assert.match(wire.app_access_projection.wire_alias_policy, /internal_wire_compatibility_alias/);
  assert.deepEqual(
    wire.transport_envelope.encrypted_payload_variants.command.allowed_action_ids,
    product.action_policy.mvp_allowed_actions,
  );

  const endpoints = wire.control_plane_http.endpoints as Array<Record<string, any>>;
  assert.equal(new Set(endpoints.map((endpoint) => endpoint.id)).size, endpoints.length);
  assert.equal(new Set(endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).size, endpoints.length);
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'desktop_create_pairing'));
  assert.deepEqual(wire.control_plane_http.release_cohort_lock, {
    source: 'opl-link/release-cohort.json',
    product_contract_ref: 'contracts/app-remote-companion.json#transport.release_cohort_lock',
    owner: 'opl-link/service',
    source_status: 'source_integrated_validation_placeholder_not_live_qualified',
    metadata_match_required_before_pairing: true,
    match_fields: ['environment', 'cohort_id', 'protocol_version', 'provider', 'service_origin', 'config_digest'],
    config_summary_match_required: true,
    config_digest_match_required: true,
    expected_validation_cohort: {
      environment: 'validation',
      cohort_id: 'ably-validation-20260819',
      protocol_version: 'opl_remote_transport.v1',
      provider: 'ably',
      service_origin: 'https://validation.invalid',
      deployment_state: 'not_live_qualified',
      active_pair_limit: 20,
      warning_threshold: 15,
    },
    admission_authority: 'opl-link/service_cloudflare_worker_and_d1',
    limit_scope: 'validation_cohort_not_provider_seat_limit',
    fixed_provider_seat_limit: false,
    mismatch_policy: 'fail_closed_before_claim_or_transport_connection',
  });
  assert.deepEqual(endpoints.find((endpoint) => endpoint.id === 'service_health'), {
    id: 'service_health',
    method: 'GET',
    path: '/healthz',
    auth: 'none',
    idempotency_required: false,
    proof_scope: 'worker_process_reachable_only',
    response_fields: ['status'],
  });
  const metadataEndpoint = endpoints.find((endpoint) => endpoint.id === 'service_metadata');
  assert.ok(metadataEndpoint.response_fields.includes('config_digest'));
  assert.ok(metadataEndpoint.response_fields.includes('cohort_id'));
  const readinessEndpoint = endpoints.find((endpoint) => endpoint.id === 'service_readiness');
  assert.match(readinessEndpoint.proof_scope, /d1_read_write/);
  assert.ok(readinessEndpoint.response_must_not_include.includes('transport_credential'));
  assert.deepEqual(endpoints.find((endpoint) => endpoint.id === 'ios_resolve_manual_pairing'), {
    id: 'ios_resolve_manual_pairing',
    method: 'POST',
    path: '/v1/remote-companion/pairings/resolve',
    auth: 'manual_code_in_body',
    idempotency_required: true,
    request_fields: ['protocol_version', 'manual_code'],
    response_fields: ['protocol_version', 'pairing_id', 'service_url', 'desktop_public_key', 'expires_at'],
    secret_request_fields: ['manual_code'],
    allowed_pairing_state: 'reserved',
    response_must_not_include: ['claim_secret', 'desktop_pair_token', 'ios_claim_token', 'provider_credential'],
  });
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'ios_claim_pairing'));
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'desktop_confirm_pairing'));
  const invitationEndpoint = endpoints.find((endpoint) => endpoint.id === 'operator_create_invitation');
  assert.equal(invitationEndpoint.auth, 'operator_bearer_from_cloudflare_worker_secret');
  assert.ok(invitationEndpoint.request_fields.includes('protocol_version'));
  const capacityEndpoint = endpoints.find((endpoint) => endpoint.id === 'operator_read_capacity');
  assert.deepEqual(capacityEndpoint, {
    id: 'operator_read_capacity',
    method: 'GET',
    path: '/v1/remote-companion/capacity',
    auth: 'operator_bearer_from_OPL_LINK_OPERATOR_TOKEN',
    idempotency_required: false,
    response_fields: ['protocol_version', 'active_pair_count', 'active_pair_limit', 'warning_threshold', 'warning'],
  });
  const credentialEndpoint = endpoints.find((endpoint) => endpoint.id === 'refresh_provider_credentials');
  assert.ok(credentialEndpoint);
  assert.deepEqual(credentialEndpoint.response_fields, [
    'protocol_version',
    'transport_provider',
    'transport_credential',
    'key_epoch',
    'credential_expires_at',
    'push_recipient_id',
  ]);
  assert.deepEqual(credentialEndpoint.secret_response_fields, ['transport_credential']);
  assert.ok(credentialEndpoint.response_fields.includes('push_recipient_id'));
  const renameEndpoint = endpoints.find((endpoint) => endpoint.id === 'rename_own_device');
  assert.deepEqual(renameEndpoint.request_fields, ['protocol_version', 'display_name']);
  const putPushEndpoint = endpoints.find((endpoint) => endpoint.id === 'register_own_push_recipient');
  assert.ok(putPushEndpoint.forbidden_request_fields.includes('apns_token'));
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'delete_own_push_recipient'));
  const readPairingEndpoint = endpoints.find((endpoint) => endpoint.id === 'read_pairing');
  assert.ok(readPairingEndpoint);
  assert.ok(readPairingEndpoint.device_activation_fields.includes('peer_device_id'));
  assert.ok(readPairingEndpoint.device_activation_fields.includes('peer_public_key'));
  assert.deepEqual(readPairingEndpoint.device_activation_fields, [
    'device_id',
    'device_label',
    'peer_device_id',
    'peer_device_label',
    'peer_public_key',
    'transport_provider',
    'transport_credential',
    'key_epoch',
    'credential_expires_at',
    'push_recipient_id',
  ]);
  for (const field of [
    'transport_client_id',
    'publish_channel',
    'subscribe_channel',
    'channel_epoch',
    'capability_token',
    'capability_expires_at',
  ]) assert.equal(readPairingEndpoint.device_activation_fields.includes(field), false, `${field} is provider-specific`);
  assert.ok(readPairingEndpoint.device_activation_fields.includes('push_recipient_id'));
  assert.ok(!readPairingEndpoint.device_activation_fields.includes('device_credential'));
  assert.equal(readPairingEndpoint.pre_active_device_activation, null);
  assert.match(readPairingEndpoint.device_activation_policy, /pre_active_pairing_returns_null/);
  assert.match(readPairingEndpoint.active_device_credential_source, /desktop_pair_token/);
  assert.equal('device_credential' in wire.control_plane_http.tokens, false);
  assert.match(wire.control_plane_http.tokens.desktop_pair_token, /active_device_credential_after_activation/);
  assert.match(wire.control_plane_http.tokens.ios_claim_token, /active_device_credential_after_activation/);
  assert.match(wire.control_plane_http.tokens.active_device_credential, /without_minting_a_second_bearer/);
  assert.equal(wire.provider_transport.selected_target, 'ably');
  assert.equal(wire.provider_transport.implementation_status, 'source_implemented_not_live_verified');
  assert.deepEqual(wire.provider_transport.credential_wire.public_core_fields, [
    'transport_provider',
    'transport_credential',
    'key_epoch',
    'credential_expires_at',
    'push_recipient_id',
  ]);
  assert.equal(wire.provider_transport.credential_wire.opaque_field, 'transport_credential');
  assert.equal(wire.provider_transport.credential_wire.provider_adapter_may_decode, true);
  assert.equal(wire.provider_transport.switching.conditional_alternative, 'tencent_cloud_im');
  assert.equal(wire.provider_transport.switching.automatic_fallback, false);
  assert.equal(wire.provider_transport.switching.dual_write, false);
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'revoke_pair'));
  assert.deepEqual(endpoints.find((endpoint) => endpoint.id === 'revoke_pair').request_fields, ['protocol_version']);
  assert.ok(endpoints.some((endpoint) => endpoint.id === 'read_revocation'));
  const detachEndpoint = endpoints.find((endpoint) => endpoint.id === 'desktop_detach_ack');
  assert.equal(detachEndpoint.auth, 'matching_revoked_desktop_credential_only');
  assert.deepEqual(detachEndpoint.detachment_basis_values, ['desktop_ack']);
  assert.match(wire.control_plane_http.tokens.revoked_desktop_credential_scope, /only_submit_the_matching_desktop_detach_ack/);
  for (const endpoint of endpoints.filter((candidate) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(candidate.method))) {
    assert.equal(endpoint.idempotency_required, true, `${endpoint.id} must require Idempotency-Key`);
  }
  for (const code of ['forbidden', 'service_unavailable', 'idempotency_conflict', 'idempotency_in_flight']) {
    assert.ok(wire.control_plane_http.error_envelope.allowed_error_codes.includes(code));
  }
});

test('OPL Link wire keeps secrets out of QR, routes, logs, and provider plaintext', () => {
  const wire = readJson('contracts/app-remote-companion-wire.json');
  const qrFields = new Set(wire.pairing_qr.fields as string[]);
  for (const field of wire.pairing_qr.forbidden_fields as string[]) {
    assert.equal(qrFields.has(field), false, `${field} must not be present in pairing QR`);
  }
  assert.equal(wire.control_plane_http.tokens.transport, 'bearer_header_only_never_url_query_or_qr');
  assert.equal(wire.secret_and_log_policy.provider_or_cloud_plaintext_conversation_content, false);
  assert.ok(wire.secret_and_log_policy.never_log.includes('transport_credential'));
  assert.equal(wire.desktop_dispatch.provider_history_read_for_business_state, false);
  assert.equal(wire.desktop_dispatch.cloud_conversation_store, false);
  assert.equal(wire.desktop_dispatch.task_management_authority, false);

  const outer = new Set(wire.transport_envelope.outer_fields as string[]);
  for (const field of wire.transport_envelope.outer_plaintext_must_not_include as string[]) {
    assert.equal(outer.has(field), false, `${field} must remain encrypted`);
  }
  assert.equal(wire.transport_envelope.nonce_bytes, 12);
  assert.deepEqual(wire.transport_envelope.direction_values, ['ios_to_desktop', 'desktop_to_ios']);
  assert.equal(wire.transport_envelope.hkdf_salt, 'utf8_pair_id');
  assert.match(wire.transport_envelope.associated_data_serialization, /declared_order/);
  assert.equal(wire.transport_envelope.ordering.duplicate_nonce_rejected, true);
  assert.equal(wire.transport_envelope.ordering.duplicate_or_regressed_sequence_rejected, true);
  assert.equal(wire.transport_envelope.ordering.unknown_send_result_policy, 'do_not_resend_refresh_canonical_state');

  const command = wire.transport_envelope.encrypted_payload_variants.command;
  assert.deepEqual(command.product_action_mapping, productActionMapping());
  assert.deepEqual(command.payload_contracts['canonical_turn.stop'].payload_fields, []);
  assert.match(command.payload_contracts['canonical_turn.stop'].turn_selection, /desktop_resolves/);
  assert.deepEqual(command.payload_contracts['canonical_approval.respond'].payload_fields, [
    'approval_id',
    'decision',
  ]);
  assert.deepEqual(command.payload_contracts['canonical_approval.respond'].decision_values, ['approve', 'reject']);
  assert.match(command.payload_contracts['canonical_approval.respond'].decision_mapping.approve, /one_shot_accept/);

  const event = wire.transport_envelope.encrypted_payload_variants.event;
  assert.equal(event.product_event_mapping['task.list_snapshot'], 'conversation.directory_snapshot');
  assert.deepEqual(event.payload_contracts['task.list_snapshot'], ['tasks', 'complete']);
  assert.deepEqual(event.payload_contracts['thread.snapshot'], ['thread_id', 'messages', 'approval']);
  assert.deepEqual(event.projection_shapes.task, [
    'id',
    'title',
    'status',
    'updated_at',
    'needs_user_action',
    'active_turn_id',
  ]);
});

test('crypto and pairing test vectors pin cross-language byte compatibility', () => {
  const wire = readJson('contracts/app-remote-companion-wire.json');
  const vector = wire.transport_envelope.test_vector;
  assert.equal(vector.shared_secret_hex, '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
  assert.equal(vector.derived_key_hex, '6017bf36ae1274c1168a217e69737e9792226ab555e0447dddec1b278f15de59');
  assert.equal(vector.sender_sequence, 1);
  assert.equal(vector.ciphertext_and_tag_hex, 'c90ce480a4b58bf4d5c076ee419a3661510728dcf874430328912093e560fccc293cd3535ea01c');
  assert.equal(wire.pairing_authentication_string.test_vector.authentication_string, '867 604');
});

test('sender_sequence is AEAD-bound and a sequence-only mutation fails decryption', () => {
  const wire = readJson('contracts/app-remote-companion-wire.json');
  const vector = wire.transport_envelope.test_vector;
  const fields = wire.transport_envelope.associated_data_fields as string[];
  assert.deepEqual(fields, [
    'protocol_version',
    'pair_id',
    'sender_device_id',
    'recipient_device_id',
    'key_epoch',
    'sender_sequence',
    'channel_direction',
  ]);

  const values = {
    protocol_version: wire.protocol_version,
    pair_id: vector.pair_id,
    sender_device_id: vector.sender_device_id,
    recipient_device_id: vector.recipient_device_id,
    key_epoch: vector.key_epoch,
    sender_sequence: vector.sender_sequence,
    channel_direction: vector.direction,
  };
  const associatedData = serializeAssociatedData(fields, values);
  assert.equal(associatedData, vector.associated_data_utf8);
  assert.equal(decryptVector(vector, associatedData), vector.plaintext_utf8);

  const mutatedSequenceData = serializeAssociatedData(fields, {
    ...values,
    sender_sequence: vector.sender_sequence + 1,
  });
  assert.throws(() => decryptVector(vector, mutatedSequenceData));
});

test('revocation completion requires token denial and desktop detach readback', () => {
  const wire = readJson('contracts/app-remote-companion-wire.json');
  const endpoint = (wire.control_plane_http.endpoints as Array<Record<string, any>>)
    .find((candidate) => candidate.id === 'read_revocation');
  assert.ok(endpoint);
  assert.match(endpoint.terminal_rule, /d1_denies_future_tokens/);
  assert.match(endpoint.terminal_rule, /desktop_connector_is_detached/);
  assert.ok(endpoint.response_fields.includes('detachment_basis'));
});
