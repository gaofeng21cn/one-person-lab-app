import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const cacheActionNames = new Set([
  'actions/cache',
  'actions/cache/restore',
  'actions/cache/save',
]);

const volatileIdentityPatterns = [
  /\bgithub\.run_id\b/i,
  /\bgithub\.run_attempt\b/i,
  /\bgithub\.run_number\b/i,
  /\bGITHUB_RUN_ID\b/,
  /\bGITHUB_RUN_ATTEMPT\b/,
  /\bGITHUB_RUN_NUMBER\b/,
  /\bDate\.now\s*\(/,
  /\bMath\.random\s*\(/,
  /\brandomUUID\s*\(/,
];

const explicitSaveGuardPattern = /cache[-_]?hit|save[-_]?required|force[_-]?rebuild/i;
const defaultWriterGuardPattern = /github\.ref\s*==\s*['"]refs\/heads\/main['"]/i;
const dynamicCacheKeyAssignmentPattern =
  /(?:cacheKey|cache_key|workflowCacheKey|workflow_cache_key)\s*[:=]\s*[^;]{0,1024}/g;
const cacheCatalogPath = 'contracts/app-actions-cache-catalog.json';
const dynamicCacheClassEnv = 'OPL_ACTIONS_CACHE_CLASS';

type CacheClass = {
  id?: unknown;
  key_prefixes?: unknown;
  legacy_key_prefixes?: unknown;
  max_budget_bytes?: unknown;
  keep_generations_per_platform?: unknown;
  restore_mode?: unknown;
  writer_ref?: unknown;
};

type CacheCatalog = Record<string, any> & {
  classes?: CacheClass[];
};

function actionName(uses: string): string {
  const separator = uses.lastIndexOf('@');
  return separator >= 0 ? uses.slice(0, separator) : uses;
}

function containsVolatileIdentity(value: string): boolean {
  return volatileIdentityPatterns.some((pattern) => pattern.test(value));
}

function yamlFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return yamlFiles(absolutePath);
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) return [];
      return [absolutePath];
    });
}

function automationPaths(appRoot: string): string[] {
  const workflows = yamlFiles(path.join(appRoot, '.github', 'workflows'));
  const compositeActions = yamlFiles(path.join(appRoot, '.github', 'actions'))
    .filter((filePath) => /^action\.ya?ml$/.test(path.basename(filePath)));
  return [...workflows, ...compositeActions]
    .map((filePath) => path.relative(appRoot, filePath))
    .sort();
}

function readCacheCatalog(appRoot: string, violations: string[]): CacheCatalog | null {
  const absolutePath = path.join(appRoot, cacheCatalogPath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${cacheCatalogPath}: required Actions cache catalog is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as CacheCatalog;
  } catch (error) {
    violations.push(
      `${cacheCatalogPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function collectCacheCatalogViolations(catalog: CacheCatalog | null): string[] {
  if (!catalog) return [];
  const violations: string[] = [];
  if (
    catalog.schema !== 'opl_actions_cache_catalog.v1' ||
    catalog.purpose !== 'bounded_default_on_reusable_acceleration' ||
    catalog.default_writer_ref !== 'refs/heads/main' ||
    catalog.write_policy?.large_cache_action !== 'restore_then_explicit_save' ||
    catalog.write_policy?.combined_actions_cache_allowed !== false ||
    catalog.write_policy?.non_default_refs !== 'restore_only_from_default_branch' ||
    catalog.write_policy?.dynamic_key_class_env !== dynamicCacheClassEnv
  ) {
    violations.push(`${cacheCatalogPath}: catalog must require explicit main-only writes for large caches`);
  }

  const repositoryBudget = Number(catalog.repository_budget_bytes);
  const minimumHeadroom = Number(catalog.minimum_headroom_bytes);
  const classes = Array.isArray(catalog.classes) ? catalog.classes : [];
  const classBudgets = classes.map((entry) => Number(entry.max_budget_bytes));
  const classBudget = classBudgets.reduce((sum, value) => sum + value, 0);
  if (
    !Number.isSafeInteger(repositoryBudget) || repositoryBudget <= 0 ||
    !Number.isSafeInteger(minimumHeadroom) || minimumHeadroom <= 0 ||
    classBudgets.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    classBudget + minimumHeadroom > repositoryBudget
  ) {
    violations.push(`${cacheCatalogPath}: class budgets plus minimum headroom must fit the repository cache budget`);
  }

  const expectedClassIds = new Set([
    'dependency_download',
    'first_run_install_seed',
    'compiled_output',
    'full_runtime_layer',
  ]);
  const expectedRestoreModes = new Map([
    ['dependency_download', 'prefix_fallback_allowed'],
    ['first_run_install_seed', 'legacy_prefix_migration_then_exact_only'],
    ['compiled_output', 'exact_only'],
    ['full_runtime_layer', 'exact_only'],
  ]);
  const seenClassIds = new Set<string>();
  const seenPrefixes = new Set<string>();
  const legacyPrefixes: string[] = [];
  for (const cacheClass of classes) {
    const classId = typeof cacheClass.id === 'string' ? cacheClass.id : '';
    if (!expectedClassIds.has(classId) || seenClassIds.has(classId)) {
      violations.push(`${cacheCatalogPath}: cache class id is missing, duplicated, or unsupported: ${classId || '<empty>'}`);
    }
    seenClassIds.add(classId);
    if (
      cacheClass.writer_ref !== 'refs/heads/main' ||
      cacheClass.restore_mode !== expectedRestoreModes.get(classId) ||
      !Number.isSafeInteger(cacheClass.max_budget_bytes) ||
      Number(cacheClass.max_budget_bytes) <= 0 ||
      !Number.isSafeInteger(cacheClass.keep_generations_per_platform) ||
      Number(cacheClass.keep_generations_per_platform) < 1 ||
      !Array.isArray(cacheClass.key_prefixes) ||
      cacheClass.key_prefixes.length === 0
    ) {
      violations.push(`${cacheCatalogPath}: cache class ${classId || '<empty>'} must declare its canonical restore mode, main writer, positive budget, prefixes, and bounded generations`);
    }
    for (const prefix of Array.isArray(cacheClass.key_prefixes) ? cacheClass.key_prefixes : []) {
      if (typeof prefix !== 'string' || prefix === '' || seenPrefixes.has(prefix)) {
        violations.push(`${cacheCatalogPath}: cache key prefix is missing or duplicated: ${String(prefix)}`);
      }
      seenPrefixes.add(String(prefix));
    }
    for (const prefix of Array.isArray(cacheClass.legacy_key_prefixes) ? cacheClass.legacy_key_prefixes : []) {
      if (typeof prefix !== 'string' || prefix === '') {
        violations.push(`${cacheCatalogPath}: legacy cache key prefix is missing: ${String(prefix)}`);
      } else {
        legacyPrefixes.push(prefix);
      }
    }
  }
  if (new Set(legacyPrefixes).size !== legacyPrefixes.length) {
    violations.push(`${cacheCatalogPath}: legacy cache key prefixes must be unique`);
  }
  for (const prefix of legacyPrefixes) {
    if (seenPrefixes.has(prefix)) {
      violations.push(`${cacheCatalogPath}: legacy cache key prefix cannot remain writable: ${prefix}`);
    }
  }
  if (seenClassIds.size !== expectedClassIds.size) {
    violations.push(`${cacheCatalogPath}: catalog must declare all canonical cache classes`);
  }
  if (
    catalog.documentation_ref !== 'docs/delivery/actions-cache-architecture.md' ||
    catalog.cache_plan?.schema !== 'opl_actions_cache_plan.v2' ||
    catalog.cache_plan?.selected_package_set_schema !== 'opl_full_runtime_selected_package_set.v1' ||
    !Array.isArray(catalog.cache_plan?.required_fields) ||
    !catalog.cache_plan.required_fields.includes('selected_package_set') ||
    !catalog.cache_plan.required_fields.includes('runtime_cache_aggregate_key_input') ||
    !Array.isArray(catalog.cache_plan?.runtime_layer_required_fields) ||
    !catalog.cache_plan.runtime_layer_required_fields.includes('key_input_digest') ||
    catalog.cache_receipt?.schema !== 'opl_actions_cache_receipt.v2' ||
    catalog.cache_receipt?.required_currentness_status !== 'passed' ||
    !Array.isArray(catalog.cache_receipt?.required_fields) ||
    !catalog.cache_receipt.required_fields.includes('identity') ||
    !catalog.cache_receipt.required_fields.includes('runtime_currentness') ||
    !catalog.cache_receipt.required_fields.includes('metrics') ||
    !Array.isArray(catalog.cache_receipt?.required_metrics) ||
    !catalog.cache_receipt.required_metrics.includes('hit_ratio') ||
    !catalog.cache_receipt.required_metrics.includes('total_duration_seconds') ||
    !catalog.cache_receipt.required_metrics.includes('save_failure_count') ||
    catalog.cache_only_warmup?.workflow !== '.github/workflows/full-first-install-release.yml' ||
    catalog.cache_only_warmup?.workflow_input?.cache_only !== true ||
    catalog.cache_only_warmup?.scheduling !== 'reusable_capability_without_independent_event_entry' ||
    catalog.cache_only_warmup?.release_gate !== false ||
    catalog.cache_only_warmup?.miss_fallback !== 'full_package_build_materializes_validates_and_main_saves_missing_layers' ||
    catalog.cache_only_warmup?.requires_exact_app_shell_framework_shas !== true ||
    catalog.cache_only_warmup?.requires_selected_package_set_identity !== true ||
    !Array.isArray(catalog.cache_only_warmup?.forbidden_outputs) ||
    !catalog.cache_only_warmup.forbidden_outputs.includes('release_dmg')
  ) {
    violations.push(`${cacheCatalogPath}: catalog must define cache plan, receipt, and cache-only warmup boundaries`);
  }
  if (
    catalog.cleanup?.inventory_credentials !== 'actions_read_only' ||
    catalog.cleanup?.mutation_authority !== 'isolated_cleanup_broker_required' ||
    catalog.cleanup?.unprovisioned_behavior !== 'plan_only_no_delete' ||
    !Array.isArray(catalog.cleanup?.protect) ||
    !catalog.cleanup.protect.includes('keys_reachable_from_current_main') ||
    !catalog.cleanup.protect.includes('current_frozen_cohort_keys') ||
    catalog.cleanup?.delete !== 'exact_cache_ids_outside_protected_generations_including_stale_main_generations' ||
    catalog.cleanup?.blind_delete_all_allowed !== false
  ) {
    violations.push(`${cacheCatalogPath}: cleanup must protect reachable keys while allowing exact stale main generation removal`);
  }
  return violations;
}

function cacheClassForKey(catalog: CacheCatalog | null, key: string): CacheClass | null {
  if (!catalog || key.trim().startsWith('${{')) return null;
  const classes = Array.isArray(catalog.classes) ? catalog.classes : [];
  const matches = classes.flatMap((cacheClass) => (
    Array.isArray(cacheClass.key_prefixes)
      ? cacheClass.key_prefixes
        .filter((prefix): prefix is string => typeof prefix === 'string' && key.startsWith(prefix))
        .map((prefix) => ({ cacheClass, prefix }))
      : []
  ));
  matches.sort((left, right) => right.prefix.length - left.prefix.length);
  return matches[0]?.cacheClass ?? null;
}

function cacheClassForId(catalog: CacheCatalog | null, classId: string): CacheClass | null {
  if (!catalog) return null;
  const classes = Array.isArray(catalog.classes) ? catalog.classes : [];
  return classes.find((cacheClass) => cacheClass.id === classId) ?? null;
}

function stepGroups(document: Record<string, any>): Array<{ id: string; steps: Array<Record<string, any>> }> {
  const jobGroups = Object.entries(document.jobs ?? {}).map(([jobId, jobValue]) => {
    const job = jobValue as Record<string, any>;
    return {
      id: `job=${jobId}`,
      steps: Array.isArray(job.steps) ? job.steps as Array<Record<string, any>> : [],
    };
  });
  const compositeSteps = Array.isArray(document.runs?.steps)
    ? [{ id: 'composite_action', steps: document.runs.steps as Array<Record<string, any>> }]
    : [];
  return [...jobGroups, ...compositeSteps];
}

export function collectActionsCachePolicyViolations(appRoot: string): string[] {
  const violations: string[] = [];
  const catalog = readCacheCatalog(appRoot, violations);
  violations.push(...collectCacheCatalogViolations(catalog));

  for (const automationPath of automationPaths(appRoot)) {
    const absolutePath = path.join(appRoot, automationPath);
    const text = fs.readFileSync(absolutePath, 'utf8');
    let document: Record<string, any>;
    try {
      document = parseYaml(text) as Record<string, any>;
    } catch (error) {
      violations.push(
        `${automationPath}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    for (const group of stepGroups(document)) {
      for (const [stepIndex, step] of group.steps.entries()) {
        if (typeof step.uses !== 'string') continue;
        const cacheAction = actionName(step.uses);
        if (!cacheActionNames.has(cacheAction)) continue;

        const key = step.with?.key;
        const location = `${automationPath} ${group.id} step=${stepIndex + 1}`;
        if (typeof key !== 'string' || !key.trim()) {
          violations.push(`${location}: ${cacheAction} must declare a non-empty cache key`);
          continue;
        }
        if (containsVolatileIdentity(key)) {
          violations.push(`${location}: reusable cache key contains volatile run identity`);
        }

        const dynamicKey = key.trim().startsWith('${{');
        const declaredClassId = step.env?.[dynamicCacheClassEnv];
        let cacheClass = cacheClassForKey(catalog, key);
        if (dynamicKey) {
          if (typeof declaredClassId !== 'string' || !cacheClassForId(catalog, declaredClassId)) {
            violations.push(
              `${location}: fully dynamic cache key must declare a cataloged ${dynamicCacheClassEnv}`,
            );
          } else {
            cacheClass = cacheClassForId(catalog, declaredClassId);
          }
        } else if (!cacheClass) {
          violations.push(`${location}: cache key is not owned by the Actions cache catalog`);
        } else if (
          declaredClassId !== undefined &&
          (typeof declaredClassId !== 'string' || declaredClassId !== cacheClass.id)
        ) {
          violations.push(`${location}: ${dynamicCacheClassEnv} does not match the cache key prefix owner`);
        }
        if (cacheAction === 'actions/cache') {
          violations.push(`${location}: combined actions/cache restore-save is forbidden; use restore plus guarded explicit save`);
        }
        if (
          cacheAction === 'actions/cache/restore' &&
          typeof step.with?.['restore-keys'] === 'string' &&
          step.with['restore-keys'].trim() !== '' &&
          cacheClass?.restore_mode === 'exact_only'
        ) {
          violations.push(`${location}: exact-only cache class must not declare restore-keys`);
        }
        if (cacheAction === 'actions/cache/save') {
          const condition = typeof step.if === 'string' ? step.if : '';
          if (!explicitSaveGuardPattern.test(condition)) {
            violations.push(
              `${location}: explicit cache save must be guarded by a cache miss, save-required output, or forced rebuild`,
            );
          }
          if (!defaultWriterGuardPattern.test(condition)) {
            violations.push(`${location}: explicit cache save must be restricted to refs/heads/main`);
          }
        }
      }
    }

    for (const assignment of text.matchAll(dynamicCacheKeyAssignmentPattern)) {
      if (containsVolatileIdentity(assignment[0])) {
        violations.push(
          `${automationPath}: dynamically generated reusable cache key contains volatile run identity`,
        );
      }
    }
  }

  return [...new Set(violations)];
}

export function validateActionsCachePolicy(appRoot: string): number {
  const violations = collectActionsCachePolicyViolations(appRoot);
  for (const violation of violations) {
    console.error(`FAIL actions_cache_policy: ${violation}`);
  }
  return violations.length;
}
