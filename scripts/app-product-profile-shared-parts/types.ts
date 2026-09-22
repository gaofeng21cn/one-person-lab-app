
export type ProductProfileLike = {
  schema_version?: unknown;
  codex?: {
    default_model?: unknown;
    default_reasoning_effort?: unknown;
    auto_model_policy?: Record<string, unknown>;
  };
  gui?: {
    authority?: unknown;
    implementation_carrier?: unknown;
    appearance?: {
      default_css_theme_id?: unknown;
      codex_theme_default_enabled?: unknown;
    };
    home?: Record<string, unknown> & {
      codex_auto_model_selection?: Record<string, unknown>;
      codex_model_display_options?: Record<string, unknown> & {
        auto_option?: Record<string, unknown>;
        reasoning_labels?: Record<string, { zh?: unknown; en?: unknown }>;
        visible_models?: Array<Record<string, unknown>>;
      };
    };
    ordinary_conversation?: Record<string, unknown>;
    right_context_inspector?: Record<string, unknown>;
  };
  settings?: {
    control_plane?: {
      experience_contract?: {
        visual_system?: Record<string, unknown>;
      };
    };
  };
};

export type HomePolicyOptions = {
  requireEnglishStatusLabel?: boolean;
  requireSelectionPersistence?: boolean;
};

export type ModelDisplayOptions = {
  requireAutoIdAndDescriptions?: boolean;
};

export type OfficialProfileLike = {
  profile_id?: unknown;
  authority?: unknown;
  additional_official_profiles_allowed?: unknown;
  user_composed_profiles_allowed?: unknown;
  desired_root_package_ids?: unknown;
  apply_on?: unknown;
  never_apply_on?: unknown;
  user_removal_policy?: {
    explicit_uninstall_is_persistent_preference?: unknown;
    reinstall_before_explicit_restore_allowed?: unknown;
  };
  composition_policy?: {
    required_dependency_resolution?: unknown;
    optional_dependency_absence_blocks?: unknown;
    composition_gate?: unknown;
    forbidden_composition_or_readiness_gates?: unknown;
  };
  distribution_forms?: {
    standard?: {
      desired_roots_source?: unknown;
      offline_seed?: unknown;
    };
    full?: {
      desired_roots_source?: unknown;
      offline_seed?: unknown;
    };
    same_desired_roots_required?: unknown;
    full_difference?: unknown;
    full_additional_desired_roots_allowed?: unknown;
  };
  package_currentness_policy?: {
    published_current_stable_authority?: unknown;
    installed_callable_authority?: unknown;
    app_carrier_authority?: unknown;
    app_release_authority?: unknown;
    shared_release_set_ordinary_update_authority?: unknown;
  };
};

export type OfficialProfileValidationOptions = {
  fail?: (message: string) => never;
};
