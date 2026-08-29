import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, "utf8"));

test("Docker WebUI repairs only stale managed-workspace project bindings before official AionCore rebinding", () => {
  const gui = readJson("contracts/app-gui-product-contract.json");
  const policy = gui.docker_webui_workspace_file_policy;
  const attachments = policy.chat_attachment_transport;
  const explorer = policy.project_explorer_resolution;
  const recovery = explorer.stale_binding_recovery;

  assert.equal(policy.managed_workspace_root_source, "OPL_WORKSPACE_ROOT");
  assert.equal(policy.managed_workspace_root, "/projects");
  assert.equal(policy.temporary_upload_root, "/tmp");
  assert.equal(policy.persistent_project_root, "/projects");
  assert.equal(
    policy.aioncore_source_policy,
    "official_release_assets_only_without_opl_source_patch_fork_or_private_release",
  );
  assert.deepEqual(attachments, {
    request_contract_owner: "official_aioncore_chat_file_ref",
    request_field: "files",
    request_shape: "source_tagged_chat_file_ref_array",
    legacy_string_array_allowed: false,
    renderer_file_marker_injection_allowed: false,
    source_classification: {
      browser_upload_paste_or_drop: "upload_ref_with_path_returned_by_post_api_fs_upload",
      backend_machine_file_picker: "local_ref_with_user_selected_absolute_path",
      project_explorer_file: "project_ref_with_workspace_pe_id_and_relative_path",
    },
    send_surfaces: [
      "guid_initial_message",
      "acp_conversation",
      "aionrs_conversation",
      "conversation_command_queue",
      "failed_send_restore",
    ],
    failure_policy:
      "reject_the_send_atomically_and_restore_prompt_and_source_tagged_attachments_without_persisting_or_replaying_legacy_string_refs",
    acceptance: {
      browser_upload_response: "http_200_with_managed_upload_path",
      message_request:
        "files_are_source_tagged_and_the_message_endpoint_accepts_the_request_without_invalid_json",
      conversation_readback: "the_user_message_and_attachment_are_visible_after_refresh",
      agent_readback: "the_selected_file_or_image_is_readable_by_the_selected_agent",
    },
  });
  assert.deepEqual(explorer.required_sequence, [
    "read_conversation_project_id",
    "read_same_user_domain_project",
    "read_project_explorer_workspace_pe_id",
    "copy_uploaded_file_to_target_pe_id",
    "fresh_project_explorer_read",
  ]);
  assert.equal(explorer.same_user_domain_required, true);
  assert.equal(
    explorer.stale_binding_definition,
    "conversation_project_id_is_nonempty_but_no_project_with_the_same_project_id_and_user_id_exists",
  );
  assert.deepEqual(recovery, {
    owner: "opl_aion_shell_web_host_startup_compatibility",
    scope: "only_conversations_whose_extra_workspace_exactly_matches_the_managed_workspace_root",
    mutation: "set_conversation_project_id_and_folder_id_to_null",
    transactional: true,
    idempotent: true,
    message_mutation_allowed: false,
    project_mutation_allowed: false,
    other_workspace_mutation_allowed: false,
    post_repair_binding_owner: "official_aioncore_lazy_project_binding",
    post_repair_shell_requirement: "fresh_conversation_read_before_project_resolution",
  });
  assert.equal(
    policy.completion_boundary,
    "source_contract_and_local_tests_do_not_imply_a_new_webui_image_or_remote_workspace_acceptance",
  );
});
