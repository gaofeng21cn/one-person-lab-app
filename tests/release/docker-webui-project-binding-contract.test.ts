import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, "utf8"));

test("Docker WebUI repairs only stale managed-workspace project bindings before official AionCore rebinding", () => {
  const gui = readJson("contracts/app-gui-product-contract.json");
  const policy = gui.docker_webui_workspace_file_policy;
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

test("Docker WebUI exposes multiple persistent working directories without creating a second Project SSOT", () => {
  const gui = readJson("contracts/app-gui-product-contract.json");
  const policy = gui.docker_webui_workspace_file_policy;
  const catalog = policy.workspace_catalog;

  assert.equal(policy.schema, "opl_app_docker_webui_workspace_file_policy.v2");
  assert.equal(catalog.owner, "one_person_lab_app");
  assert.equal(catalog.catalog_root, "/projects");
  assert.equal(catalog.deployment_managed_root_mutation_allowed, false);
  assert.equal(catalog.user_managed_top_level_directories, true);
  assert.deepEqual(catalog.initial_operations, ["create", "list", "select", "bind_new_conversation"]);
  assert.equal(catalog.initial_destructive_operations_allowed, false);
  assert.deepEqual(catalog.path_policy, {
    canonical_path_required: true,
    must_be_catalog_root_or_direct_child: true,
    parent_traversal_allowed: false,
    absolute_path_injection_allowed: false,
    symlink_escape_allowed: false,
  });
  assert.deepEqual(catalog.conversation_binding, {
    source: "conversation_extra_workspace",
    exact_runtime_path_required: true,
    immutable_after_conversation_creation: true,
    same_working_directory_reusable_by_multiple_conversations: true,
    aioncore_project_binding_owner: "official_aioncore_user_domain_project_binding",
    cloud_or_instance_project_crud_allowed: false,
  });
  assert.deepEqual(catalog.project_mapping.example, {
    "/projects/project-a": "P1",
    "/projects/project-b": "P2",
    "/projects/project-c": "P3",
  });
  assert.equal(catalog.current_conversation_upload_target, "bound_working_directory");
  assert.equal(catalog.project_explorer_scope, "current_conversation_bound_project_workspace_root");
  assert.equal(catalog.legacy_root_conversation_compatibility, "/projects");
});
