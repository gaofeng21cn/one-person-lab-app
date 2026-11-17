export type AppCodexProfile = {
  default_model: string;
  default_model_description: string;
  default_reasoning_effort: string;
  app_runtime_home: {
    default_path: string;
    override_env: string;
    resolution_policy: string;
    app_env_injection: string;
    startup_and_recheck_mutation: string;
    explicit_model_access_mutation: string;
  };
  auto_model_policy: {
    authority: string;
    recommendation_authority: string;
    policy_source_ref: string;
    projection_surface_kind: string;
    projection_presence_rule: string;
    app_role: string;
    resolution_precedence: string[];
    app_fallback_role: string;
    configured_default: {
      model: string;
      reasoning_effort: string;
    };
    configured_default_role: string;
    mode_default: string;
    model_catalog_source: string;
    builtin_model_catalog_source: string;
    catalog_response_models_field: string;
    catalog_default_model_field: string;
    catalog_supported_reasoning_efforts_field: string;
    catalog_supported_reasoning_effort_option_value_field: string;
    catalog_reasoning_effort_order_policy: string;
    catalog_pagination_request_cursor_field: string;
    catalog_pagination_response_cursor_field: string;
    catalog_pagination_completion_policy: string;
    catalog_hidden_model_field: string;
    catalog_hidden_model_policy: string;
    custom_model_access_policy: {
      default_enabled: boolean;
      surface: string;
      selection: string;
      auto_behavior: string;
      disabled_selection: string;
      warning_required: boolean;
    };
    frontier_model_preference_order_role: string;
    frontier_model_preference_order: string[];
    known_model_reasoning_effort_overrides: Record<string, string>;
    unknown_default_model_policy: string;
    unknown_model_reasoning_effort_policy: string;
    catalog_without_default_policy: string;
    catalog_unavailable_fallback: {
      model: string;
      reasoning_effort: string;
    };
    persistence_policy: {
      auto: string;
      fixed: string;
      state_encoding: string;
      reasoning_override_from_auto: string;
      stale_fixed_model: string;
    };
  };
  opl_flow_context: {
    flow_id: string;
    source: string;
    presence_source_ref: string;
    presence_rule: string;
    delivery: string;
    absence_policy: string;
    status_source_ref: string;
    status_planes: string[];
    user_agents_policy: string;
    language_policy: string;
    app_role: string;
    flow_policy_parsing: string;
    companion_inventory_storage: string;
  };
  new_conversation_additional_instructions: {
    content_owner: 'user';
    delivery: string;
    storage_key: string;
    storage_key_status: 'legacy_compatibility_storage_key';
    generated_base_context_allowed: boolean;
    agent_route_fallback_allowed: boolean;
    empty_value_policy: string;
    reset_behavior: string;
    effect: string;
  };
};
