import type { OplStandardAgentMembershipPolicy } from './architecture.ts';

export type AppGuiCapabilitiesProfile = {
  right_context_inspector: {
    compatibility_name: string;
    product_role: string;
    placement: string;
    surface_kind: string;
    default_state: string;
    default_third_column_visible: boolean;
    opens_on_user_or_task_request_only: boolean;
    chat_canvas_remains_primary: boolean;
    scope: string;
    workspace_surface: Record<string, unknown>;
    preview_surface: Record<string, unknown>;
    review_surface: Record<string, unknown>;
    on_demand_task_tools: Record<string, unknown>;
    equal_weight_tool_taxonomy_allowed: boolean;
    legacy_taxonomy_ids_forbidden: string[];
    runtime_duplicate_allowed: boolean;
    environment_popover_ref: string;
    must_not_own: string[];
  };
  ordinary_capability_selector_policy: {
    scope: string;
    authority: string;
    recommendation_authority: string;
    palette_agent_catalog_source_ref: string;
    opl_standard_agent_membership_policy: OplStandardAgentMembershipPolicy;
    palette_agent_status_source_ref: string;
    palette_agent_availability_policy: string;
    palette_agent_action_policy: string;
    palette_unknown_standard_agent_policy: string;
    palette_required_agent_package_ids?: string[];
    palette_home_shortcut_independence_policy: string;
    palette_agent_group_label_i18n: Record<'zh-CN' | 'en-US', string>;
    agent_owned_skill_deduplication_policy: string;
    agent_reference_admission_policy: {
      active_agent_package_cardinality: string;
      selection_authority: string;
      at_mention_agent_selection_allowed: boolean;
      at_mention_semantics: string;
      at_mention_requires_user_selection: boolean;
      plain_text_agent_reference_changes_active_package: boolean;
      multiple_agent_reference_policy: string;
      cross_agent_semantic_admission_owner: string;
      deterministic_cross_agent_routing_allowed: boolean;
      oma_engineering_admission: string;
      deliverable_failure_policy: string;
      existing_conversation_rebinding_allowed: boolean;
    };
    skill_source_ref: string;
    skill_menu_policy: string;
    conversation_loaded_skill_display_policy: string;
    package_skill_source_ref?: string;
    mcp_server_source_ref: string;
    mcp_menu_policy: string;
    conversation_loaded_mcp_display_policy: string;
    forbidden_mcp_policy: string;
    forbidden_mcp_examples: string[];
    conversation_snapshot_policy: string;
    forbidden_mcp_matchers: {
      exact: string[];
      prefixes: string[];
      contains: string[];
    };
    scrub_extra_keys: string[];
    required_scrub_targets: string[];
    unmatched_mcp_policy: string;
    required_preservation_targets: string[];
  };
  agent_package_registry: {
    directory_projection_authority: string;
    status_projection_authority: string;
    action_projection_authority: string;
    presentation_source: string;
    unknown_package_policy: string;
    manifest_lock_receipt_parser_allowed: boolean;
    action_id_allowlist_allowed: boolean;
    catalog_presentation_policy: {
      section_order: string[];
      application_management_policy_ref: string;
      ownership_classifier: {
        source_fields: string[];
        opl_origin: 'opl';
        unknown_origin: 'external';
        publisher_or_name_inference_allowed: false;
        maintenance_origin_grants_trust_or_actions: false;
        hardcoded_package_ids_allowed: false;
      };
      section_policy: {
        opl: string;
        external: string;
        components: string;
        availability_status_is_row_state_not_grouping: true;
        product_type_is_filter_not_section: true;
      };
      list_columns: string[];
      row_statuses: string[];
      installation_mode_presentation: string;
      standard_agent_name_policy: string;
      description_locale_policy: string;
      package_role_labels_i18n: Record<string, Record<'zh-CN' | 'en-US', string>>;
      raw_package_role_visible: boolean;
      dependency_hierarchy: {
        source: string;
        presentation: string;
        ordinary_list_policy: string;
        hardcoded_package_relationships_allowed: boolean;
        duplicate_rows_allowed: boolean;
        status_and_actions_source: string;
      };
      developer_controls_disclosure: {
        default_state: string;
        contains: string[];
        ordinary_catalog_remains_visible_when_collapsed: boolean;
      };
    };
    shell_consumption_policy: string;
  };
};
