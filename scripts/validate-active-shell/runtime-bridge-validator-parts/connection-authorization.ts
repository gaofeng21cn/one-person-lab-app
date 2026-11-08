import { assertDeepEqualJson } from '../assertions.ts';

export function validateConnectionAuthorizationApprovalBridge(runtimeBridge) {
  assertDeepEqualJson(
    runtimeBridge.connection_access_approval_bridge,
    {
      bridge_id: 'approveConnectionAccess',
      desktop_only: false,
      webui_route: '/api/opl-runtime/connection-access-approve',
      command: 'opl connect authorization approve --request-id <requestId> --json',
      transport: 'runtime_provider_via_desktop_typed_ipc_or_existing_authenticated_webui_http_proxy_to_dedicated_owner_command_no_generic_app_action_payload',
      request_fields: ['requestId'],
      response_success_fields: ['ok', 'stateRefreshRequired'],
      response_failure_fields: ['ok', 'errorCode'],
      trusted_context: 'authenticated_app_user_initiated_action_only',
      fresh_state_required: true,
      secret_fields: [],
      generic_app_action_allowed: false,
      model_callable_allowed: false,
      mcp_app_callable_allowed: false,
      confirmation_boolean_authority: false,
      secret_persistence: false,
      secret_diagnostics: false,
      shell_fail_closed_policy: 'reject_unexpected_request_or_cli_fields_and_never_return_raw_stdout_stderr_or_secret_material',
    },
    'Connection authorization approval bridge',
  );
}
