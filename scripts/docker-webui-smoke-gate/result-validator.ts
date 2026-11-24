import {
  expectedImageSeedSelection,
  imageCurrentnessStatuses,
  ordinaryMustNotClaim,
  ordinaryStatusRows,
  requiredResultFields,
  resultSchema,
  type GateResultValidation,
} from './contract.ts';
import { isNonEmptyString, isObject } from './support.ts';

export function validateDockerWebuiSmokeGateResult(payload: unknown): GateResultValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  if (!isObject(payload)) {
    return {
      status: 'failed',
      missing_fields: [...requiredResultFields],
      invalid_fields: ['payload'],
    };
  }
  for (const field of requiredResultFields) {
    if (!(field in payload)) missingFields.push(field);
  }
  if (payload.schema !== resultSchema) invalidFields.push('schema');
  if (!['clean_linux_vm', 'clean_windows_vm', 'existing_docker', 'existing_old_onepersonlab_data_dir'].includes(String(payload.gate))) {
    invalidFields.push('gate');
  }
  if (!['passed', 'typed_blocker', 'failed'].includes(String(payload.status))) invalidFields.push('status');
  if (payload.status === 'typed_blocker' && !isObject(payload.typed_blocker)) invalidFields.push('typed_blocker');
  for (const objectField of [
    'diagnostics_validation',
    'health',
    'compose',
    'container',
    'image',
    'data_preservation',
    'ordinary_user_status',
    'secret_scan',
  ]) {
    if (objectField in payload && !isObject(payload[objectField])) invalidFields.push(objectField);
  }
  if ('api_key_flow' in payload && !isObject(payload.api_key_flow)) invalidFields.push('api_key_flow');
  if (isObject(payload.ordinary_user_status)) {
    const ordinaryStatus = payload.ordinary_user_status;
    if (ordinaryStatus.path_id !== 'ordinary_docker_webui_user_path') {
      invalidFields.push('ordinary_user_status.path_id');
    }
    if (ordinaryStatus.priority !== 'ordinary_user_path_before_evidence_bundle_language') {
      invalidFields.push('ordinary_user_status.priority');
    }
    if (ordinaryStatus.settings_entry !== 'Settings -> Account & Access') {
      invalidFields.push('ordinary_user_status.settings_entry');
    }
    if (ordinaryStatus.image_seed_selection !== expectedImageSeedSelection) {
      invalidFields.push('ordinary_user_status.image_seed_selection');
    }
    if (!Array.isArray(ordinaryStatus.must_not_claim)) {
      invalidFields.push('ordinary_user_status.must_not_claim');
    } else {
      for (const claim of ordinaryMustNotClaim) {
        if (!ordinaryStatus.must_not_claim.includes(claim)) {
          invalidFields.push(`ordinary_user_status.must_not_claim.${claim}`);
        }
      }
    }
    for (const rowName of ordinaryStatusRows) {
      const row = ordinaryStatus[rowName];
      if (!isObject(row)) {
        invalidFields.push(`ordinary_user_status.${rowName}`);
        continue;
      }
      if (!['passed', 'typed_blocker', 'failed', 'not_run'].includes(String(row.status))) {
        invalidFields.push(`ordinary_user_status.${rowName}.status`);
      }
      if (!isNonEmptyString(row.summary)) {
        invalidFields.push(`ordinary_user_status.${rowName}.summary`);
      }
    }
  }
  if (payload.status === 'passed') {
    if (!isObject(payload.diagnostics_validation) || payload.diagnostics_validation.status !== 'passed') {
      invalidFields.push('diagnostics_validation.status');
    }
    if (
      !isObject(payload.diagnostics_validation) ||
      !isObject(payload.diagnostics_validation.compose_volume_mapping) ||
      payload.diagnostics_validation.compose_volume_mapping.status !== 'passed'
    ) {
      invalidFields.push('diagnostics_validation.compose_volume_mapping.status');
    }
    if (
      !isObject(payload.diagnostics_validation) ||
      !isObject(payload.diagnostics_validation.preservation_evidence) ||
      payload.diagnostics_validation.preservation_evidence.status !== 'passed'
    ) {
      invalidFields.push('diagnostics_validation.preservation_evidence.status');
    }
    if (
      !isObject(payload.diagnostics_validation) ||
      !isObject(payload.diagnostics_validation.image_identity) ||
      payload.diagnostics_validation.image_identity.status !== 'passed' ||
      !isNonEmptyString(payload.diagnostics_validation.image_identity.digest) ||
      !/^sha256:[a-f0-9]{64}$/i.test(payload.diagnostics_validation.image_identity.digest)
    ) {
      invalidFields.push('diagnostics_validation.image_identity.digest');
    }
    if (
      !isObject(payload.diagnostics_validation) ||
      !isObject(payload.diagnostics_validation.image_identity) ||
      payload.diagnostics_validation.image_identity.currentness_claim !== false
    ) {
      invalidFields.push('diagnostics_validation.image_identity.currentness_claim');
    }
    if (
      !isObject(payload.diagnostics_validation) ||
      !isObject(payload.diagnostics_validation.image_identity) ||
      !imageCurrentnessStatuses.includes(String(payload.diagnostics_validation.image_identity.currentness_status) as typeof imageCurrentnessStatuses[number])
    ) {
      invalidFields.push('diagnostics_validation.image_identity.currentness_status');
    }
    if (
      isObject(payload.diagnostics_validation) &&
      isObject(payload.diagnostics_validation.image_identity) &&
      payload.diagnostics_validation.image_identity.remote_digest !== null &&
      (!isNonEmptyString(payload.diagnostics_validation.image_identity.remote_digest) ||
        !/^sha256:[a-f0-9]{64}$/i.test(payload.diagnostics_validation.image_identity.remote_digest))
    ) {
      invalidFields.push('diagnostics_validation.image_identity.remote_digest');
    }
    if (!isObject(payload.health) || payload.health.status !== 'passed') invalidFields.push('health.status');
    if (!isObject(payload.compose) || payload.compose.status !== 'present') invalidFields.push('compose.status');
    if (!isObject(payload.image) || payload.image.status !== 'present') invalidFields.push('image.status');
    if (
      !isObject(payload.image) ||
      !isNonEmptyString(payload.image.digest) ||
      !/^sha256:[a-f0-9]{64}$/i.test(payload.image.digest)
    ) {
      invalidFields.push('image.digest');
    }
    if (!isObject(payload.image) || payload.image.currentness_claim !== false) {
      invalidFields.push('image.currentness_claim');
    }
    if (!isObject(payload.image) || !imageCurrentnessStatuses.includes(String(payload.image.currentness_status) as typeof imageCurrentnessStatuses[number])) {
      invalidFields.push('image.currentness_status');
    }
    if (
      isObject(payload.image) &&
      payload.image.remote_digest !== null &&
      (!isNonEmptyString(payload.image.remote_digest) || !/^sha256:[a-f0-9]{64}$/i.test(payload.image.remote_digest))
    ) {
      invalidFields.push('image.remote_digest');
    }
    if (!isObject(payload.data_preservation) || payload.data_preservation.status !== 'passed') {
      invalidFields.push('data_preservation.status');
    }
    if (!isObject(payload.api_key_flow) || payload.api_key_flow.status !== 'passed') invalidFields.push('api_key_flow.status');
    if (!isObject(payload.api_key_flow) || payload.api_key_flow.stdin_transport !== true) {
      invalidFields.push('api_key_flow.stdin_transport');
    }
    if (!isObject(payload.ordinary_user_status)) {
      invalidFields.push('ordinary_user_status');
    } else {
      for (const rowName of ordinaryStatusRows) {
        const row = payload.ordinary_user_status[rowName];
        if (!isObject(row) || row.status !== 'passed') {
          invalidFields.push(`ordinary_user_status.${rowName}.status`);
        }
      }
    }
    if (!isObject(payload.secret_scan) || payload.secret_scan.status !== 'passed') invalidFields.push('secret_scan.status');
  }
  return {
    status: missingFields.length === 0 && invalidFields.length === 0 ? 'passed' : 'failed',
    missing_fields: missingFields,
    invalid_fields: invalidFields,
  };
}
