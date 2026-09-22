import { assertDeepEqualJson } from '../assertions.ts';
import { settingsControlPlane } from './context.ts';

export function validateDesktopTrayPolicy(guiContract) {
  const trayPolicy = guiContract.desktop_tray_policy;
  const iconPolicy = trayPolicy?.icon_policy;
  assertDeepEqualJson(
    iconPolicy,
    {
      macos_asset_role: 'dedicated_monochrome_geometric_template_image',
      macos_brand_motif: 'opl_segmented_workflow_orbit_with_single_person_core',
      macos_base_point_size: 16,
      macos_scale_factors: [1, 2],
      macos_template_image_required: true,
      macos_transparency_required: true,
      macos_color_policy: 'black_alpha_mask_only',
      macos_forbidden_source: 'scaled_full_color_application_icon',
      other_platforms: 'retain_application_icon_unless_platform_specific_asset_is_defined',
    },
    'App GUI desktop tray icon policy',
  );
}

export function validateDesktopApplicationIconPolicy(guiContract) {
  assertDeepEqualJson(
    guiContract.theme_and_branding?.desktop_app_icon_policy,
    {
      source_asset: 'active_shell/resources/icon.png',
      source_artwork_unchanged: true,
      macos_canvas_px: 1024,
      macos_alpha_threshold_percent: 50,
      macos_expected_alpha_bounds: '824x824+100+100',
      macos_safe_margin_required: true,
      macos_derived_assets: [
        'active_shell/resources/app.png',
        'active_shell/resources/app_dev.png',
        'active_shell/resources/app.icns',
        'packaged .app Contents/Resources/icon.icns',
      ],
      pwa_and_in_app_brand_assets_unchanged: true,
    },
    'App GUI desktop application icon policy',
  );
}

export function validateBrandedDeepLinkPolicy(policy) {
  assertDeepEqualJson(
    policy,
    {
      schema: 'opl_app_branded_deep_link.v1',
      carrier_scope: 'desktop_shell_only',
      scheme: 'opl',
      accepted_schemes: ['opl'],
      legacy_scheme_policy:
        'reject_unless_an_explicit_compatibility_contract_and_live_evidence_are_added',
      action_authority: 'url_hostname_only_with_empty_path',
      allowed_actions: ['navigate'],
      action_schemas: {
        navigate: {
          required_params: ['route'],
          optional_params: [],
          additional_params_allowed: false,
          duplicate_params_allowed: false,
          route_value_policy: 'single_url_decoded_absolute_app_path',
        },
      },
      forbidden_credential_actions: ['add-provider', 'provider/add'],
      forbidden_parameter_names: [
        'data',
        'api_key',
        'apikey',
        'authorization',
        'credential',
        'key',
        'password',
        'secret',
        'token',
      ],
      secret_like_value_prefixes: ['Bearer ', 'eyJ', 'ghp_', 'github_pat_', 'sk-'],
      opaque_payload_policy: 'base64_json_and_other_encoded_payloads_are_forbidden',
      validation_layers: {
        main_process:
          'validate_scheme_action_path_query_cardinality_and_secret_policy_before_queue_or_emit',
        renderer: 'validate_route_against_app_owned_exact_route_registry_before_navigation',
      },
      route_registry: {
        static_exact_routes: ['/guid', '/archived', '/scheduled'],
        settings_route_source_ref:
          'contracts/app-settings-control-plane.json#ordinary_routes+secondary_pages',
        settings_route_fields: ['ordinary_routes[].path', 'secondary_pages[].path'],
        match_policy: 'exact_path_only_no_query_hash_or_dynamic_segments',
        forbidden_route_classes: [
          'conversation_id',
          'runtime',
          'first_run',
          'authentication',
          'extension',
          'test_or_developer',
        ],
      },
      delivery_paths: [
        'cold_start_argv',
        'warm_macos_open_url',
        'second_instance_additional_data_or_argv',
      ],
      delivery_policy: 'all_delivery_paths_use_the_same_parser_and_validation_result',
      invalid_input_policy: {
        interaction: 'drop_only_the_invalid_link_and_keep_the_app_current_route_and_input_usable',
        logging: 'warn_with_reason_code_and_redacted_structure_only',
        raw_url_logging_allowed: false,
        parameter_value_logging_allowed: false,
        pending_invalid_state_allowed: false,
        global_startup_block_allowed: false,
      },
    },
    'App GUI branded deep-link policy',
  );

  const settingsRoutes = [
    ...(settingsControlPlane.ordinary_routes ?? []),
    ...(settingsControlPlane.secondary_pages ?? []),
  ].map((route) => route.path);
  if (
    settingsRoutes.length === 0 ||
    new Set(settingsRoutes).size !== settingsRoutes.length ||
    settingsRoutes.some(
      (route) =>
        typeof route !== 'string' ||
        !route.startsWith('/settings/') ||
        /[?#:]/.test(route),
    )
  ) {
    throw new Error('App Settings deep-link registry must contain unique exact /settings/* paths');
  }
}
