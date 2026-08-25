import {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  test,
  appRoot,
  require,
  activeShellRoot,
  runNode,
  writeFile,
  writeExecutable,
  writeReleaseMetadata,
} from "./helpers.ts";
import { pathToFileURL } from "node:url";
import { listFullRuntimeProductionNodeModulePaths } from "../../../scripts/full-first-install-package.ts";
import { copyOfficeCliUpstreamSkill } from "../../../scripts/build-full-first-install-package/skills.ts";

export {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  test,
  appRoot,
  require,
  activeShellRoot,
  runNode,
  writeFile,
  writeExecutable,
  writeReleaseMetadata,
  pathToFileURL,
  listFullRuntimeProductionNodeModulePaths,
  copyOfficeCliUpstreamSkill,
};



export function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}



export async function resolveFrameworkSelectedBundleFixture(tempRoot) {
  const producerModulePath = process.env.OPL_FRAMEWORK_DESCRIPTOR_MODULE;
  if (!producerModulePath) return null;
  const { resolveSelectedBundleDescriptor } = await import(
    pathToFileURL(path.resolve(producerModulePath)).href,
  );
  const packageRecord = (packageId, skillRoot) => {
    const carrierRoot = path.join(tempRoot, 'resolved-selected-bundle', packageId);
    writeJson(path.join(carrierRoot, 'owner.json'), { package_id: packageId });
    writeJson(path.join(carrierRoot, '.codex-plugin', 'plugin.json'), {
      name: `${packageId}-plugin`,
      skills: skillRoot ? [skillRoot] : [],
    });
    if (skillRoot) {
      writeFile(path.join(carrierRoot, skillRoot, 'SKILL.md'), `# ${packageId}\n`);
      writeFile(path.join(carrierRoot, skillRoot, 'references', 'nested.md'), 'nested descriptor resource\n');
    }
    return {
      packageId,
      carrierRoot,
      ownerManifestPath: 'owner.json',
      pluginManifestPath: '.codex-plugin/plugin.json',
    };
  };
  const zeroSkill = packageRecord('runtime-zero-skill', '');
  const selectedSkill = packageRecord('runtime-selected-skill', 'skills/runtime-selected-skill');
  const unselected = packageRecord('runtime-unselected-fixed-package', 'skills/runtime-unselected-fixed-package');
  const descriptor = resolveSelectedBundleDescriptor([zeroSkill, selectedSkill]);
  return { descriptor, unselected };
}



export function fileSha256Ref(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}



export function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}



export function flowCapabilityBuildLockFixture(sources, capabilityRefs = [
  'cli:officecli',
  'cli:mineru-open-api',
]) {
  const adapters = {
    'cli:officecli': {
      sourcePath: sources.officeCliBin,
      version: 'officecli 0.0.1',
    },
    'cli:mineru-open-api': {
      sourcePath: sources.mineruOpenApiBin,
      version: 'mineru-open-api 0.0.1',
    },
  };
  const items = capabilityRefs.map((capabilityRef) => {
    const adapter = adapters[capabilityRef];
    assert.ok(adapter, capabilityRef);
    return {
      capability_ref: capabilityRef,
      source_ref: `fixture:${capabilityRef}@${adapter.version}`,
      source_sha256: fileSha256(adapter.sourcePath),
      version: adapter.version,
    };
  });
  return {
    surface_kind: 'opl_flow_capability_build_lock.v1',
    authority: 'opl-framework',
    target: 'full_offline_seed',
    flow_package: {
      id: 'opl-flow',
      version: '0.1.30',
      policy_sha256: '1'.repeat(64),
      strategy_digest: '2'.repeat(64),
    },
    items,
    lock_digest: crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex'),
  };
}



export function writeFlowCapabilityBuildLockFixture(runtimeRoot, capabilityRefs = []) {
  const lock = flowCapabilityBuildLockFixture(
    {
      officeCliBin: path.join(runtimeRoot, 'bin', 'officecli'),
      mineruOpenApiBin: path.join(runtimeRoot, 'bin', 'mineru-open-api'),
    },
    capabilityRefs,
  );
  writeJson(
    path.join(runtimeRoot, 'capability-locks', 'opl-flow-capability-build-lock.json'),
    lock,
  );
  return lock;
}



export function runGit(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}



export function initializeGitRepo(repoRoot) {
  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(repoRoot, ["init", "-q"]);
  runGit(repoRoot, ["config", "user.name", "Full Runtime Test"]);
  runGit(repoRoot, ["config", "user.email", "full-runtime-test@example.invalid"]);
}



export function commitFixtureRepo(repoRoot, message) {
  runGit(repoRoot, ["add", "."]);
  runGit(repoRoot, ["commit", "-q", "-m", message]);
  return runGit(repoRoot, ["rev-parse", "HEAD"]);
}



export function writeVersionExecutable(filePath, output) {
  writeExecutable(filePath, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(output)}\n`);
}



export function writeDomainPlugin(root, pluginId) {
  writeJson(path.join(root, "plugins", pluginId, ".codex-plugin", "plugin.json"), {
    name: pluginId,
    skills: "./skills/",
  });
  writeFile(
    path.join(root, "plugins", pluginId, "skills", pluginId, "SKILL.md"),
    `# ${pluginId}\n`,
  );
}



export function writeAuthorityFunctionInventory(root, label) {
  writeJson(path.join(root, "contracts", "pack_compiler_input.json"), {
    source_refs: {
      authority_functions_source_ref: "runtime/authority_functions/README.md",
    },
  });
  writeFile(
    path.join(root, "runtime", "authority_functions", "README.md"),
    `# ${label} authority function inventory\n`,
  );
}



export function writeFrameworkRuntimeSource(frameworkRoot) {
  const temporalPackages = [
    "@temporalio/activity",
    "@temporalio/client",
    "@temporalio/common",
    "@temporalio/worker",
    "@temporalio/workflow",
  ];
  const dependencies = Object.fromEntries(temporalPackages.map((packageName) => [packageName, "1.0.0"]));
  const lockPackages = {
    "": { dependencies },
    ...Object.fromEntries(temporalPackages.map((packageName) => [`node_modules/${packageName}`, {}])),
    "node_modules/@temporalio/core-bridge": {},
    "node_modules/@swc/core": {},
    "node_modules/@swc/core-darwin-arm64": { optional: true, os: ["darwin"], cpu: ["arm64"] },
    "node_modules/@swc/core-linux-x64-gnu": { optional: true, os: ["linux"], cpu: ["x64"] },
    "node_modules/e2b": { optional: true },
  };
  writeJson(path.join(frameworkRoot, "package.json"), {
    name: "fixture-opl-framework",
    version: "0.0.0",
    exports: {
      "./cordis-profiles": "./dist/host/composition-profiles.js",
    },
    dependencies,
  });
  writeJson(path.join(frameworkRoot, "package-lock.json"), {
    name: "fixture-opl-framework",
    lockfileVersion: 3,
    packages: lockPackages,
  });
  writeJson(path.join(frameworkRoot, "tsconfig.json"), {});
  writeFile(
    path.join(frameworkRoot, "dist", "host", "composition-profiles.js"),
    "export const startCordisChannelProviderHost = () => ({ });\n",
  );
  for (const packageName of temporalPackages) {
    writeJson(path.join(frameworkRoot, "node_modules", ...packageName.split("/"), "package.json"), {
      name: packageName,
      version: "1.0.0",
    });
  }
  writeFile(
    path.join(
      frameworkRoot,
      "node_modules",
      "@temporalio",
      "core-bridge",
      "releases",
      "aarch64-apple-darwin",
      "index.node",
    ),
    "fixture native module",
  );
  writeJson(path.join(frameworkRoot, "node_modules", "@swc", "core", "package.json"), {
    name: "@swc/core",
    version: "1.0.0",
  });
  writeJson(path.join(frameworkRoot, "node_modules", "@swc", "core-darwin-arm64", "package.json"), {
    name: "@swc/core-darwin-arm64",
    version: "1.0.0",
  });
  writeFile(
    path.join(frameworkRoot, "node_modules", "@swc", "core-darwin-arm64", "swc.darwin-arm64.node"),
    "fixture swc native module",
  );

  const managedUpdate = {
    managed_update: {
      surface_id: "opl_managed_updater_kernel",
      components: [
        { component_id: "opl_base", provider_id: "runtime_substrate" },
        {
          component_id: "opl_app",
          provider_id: "installation_carrier",
          current: { host_update_route: "fixture_host_update" },
          owner_route: { route_kind: "fixture_owner_route" },
        },
        {
          component_id: "opl_packages",
          provider_id: "capability_packages",
          current: {
            currentness_authority: "installed_owner_descriptor_and_native_carrier",
            projection_source: "installed_owner_descriptor",
            installed_package_count: 1,
          },
          conditions: [{ type: "Ready", status: "True" }],
          owner_route: { route_kind: "clean_managed_package_executor" },
        },
      ],
    },
  };
  const appState = {
    app_state: {
      schema_version: "opl_app_state.v1",
      runtime_source_carriers: {
        items: [{ carrier_id: "medautoscience", source_health_status: "ready" }],
      },
    },
  };
  writeExecutable(path.join(frameworkRoot, "bin", "opl"), `#!/bin/sh
expected_scholar_root="$OPL_FULL_RUNTIME_HOME/modules/mas-scholar-skills"
if [ "\${OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS:-}" != "$expected_scholar_root" ]; then
  printf 'MAS Scholar Skills wrapper env mismatch: %s != %s\\n' "\${OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS:-unset}" "$expected_scholar_root" >&2
  exit 3
fi
if [ ! -f "$OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS/.codex-plugin/plugin.json" ]; then
  printf 'MAS Scholar Skills packaged root is incomplete: %s\\n' "$OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS" >&2
  exit 4
fi
case "$*" in
  "update status --json") printf '%s\\n' '${JSON.stringify(managedUpdate)}' ;;
  "app state --profile fast --json") printf '%s\\n' '${JSON.stringify(appState)}' ;;
  *) printf 'unexpected fixture opl args: %s\\n' "$*" >&2; exit 2 ;;
esac
`);
}



export function createFullRuntimeFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-full-scholar-runtime-"));
  const scholarRoot = path.join(tempRoot, "mas-scholar-skills");
  initializeGitRepo(scholarRoot);
  const contentLockPaths = [
    ".codex-plugin/plugin.json",
    "contracts/scholar-skills-capability-modules.json",
    "runtime/reference-provider-adapters/index.ts",
    "skills/mas-scholar-skills/SKILL.md",
  ];
  writeJson(path.join(scholarRoot, ".codex-plugin", "plugin.json"), {
    name: "mas-scholar-skills",
    version: "0.2.3",
    skills: "./skills/",
  });
  writeJson(
    path.join(scholarRoot, "contracts", "scholar-skills-capability-modules.json"),
    { package_id: "mas-scholar-skills" },
  );
  writeFile(path.join(scholarRoot, "skills", "mas-scholar-skills", "SKILL.md"), "# Scholar Skills\n");
  writeFile(
    path.join(scholarRoot, "runtime", "reference-provider-adapters", "index.ts"),
    "export const fixtureAdapter = true;\n",
  );
  const contentLock = {
    algorithm: "sha256",
    canonicalization: "ordered_path_length_file_length_bytes",
    paths: contentLockPaths,
    digest: `sha256:${"a".repeat(64)}`,
  };
  writeJson(path.join(scholarRoot, "contracts", "opl_capability_package_manifest.json"), {
    surface_kind: "opl_capability_package_manifest.v2",
    package_id: "mas-scholar-skills",
    package_role: "capability_package",
    version: "0.2.3",
    capability_abi: {
      id: "mas-scholar-skills.v1",
      version: "1.0.0",
    },
    primary_consumer: {
      agent_id: "mas",
      package_id: "mas",
      dependency_kind: "hard_runtime_dependency",
      required: true,
      version_requirement: ">=0.2.0 <0.3.0",
      capability_abi: "mas-scholar-skills.v1",
    },
    consumer_policy: {
      supported_required_by: ["mas"],
      non_primary_runtime_dependency_supported: false,
    },
    content_lock: contentLock,
  });
  const sourceCommit = commitFixtureRepo(scholarRoot, "fixture scholar source");
  runGit(scholarRoot, ["branch", "scholar-fixture-ref", sourceCommit]);

  const frameworkRoot = path.join(tempRoot, "one-person-lab");
  initializeGitRepo(frameworkRoot);
  writeFrameworkRuntimeSource(frameworkRoot);
  const frameworkCommit = commitFixtureRepo(frameworkRoot, "fixture framework source");

  const masRoot = path.join(tempRoot, "med-autoscience");
  const magRoot = path.join(tempRoot, "med-autogrant");
  const rcaRoot = path.join(tempRoot, "redcube-ai");
  const metaAgentRoot = path.join(tempRoot, "opl-meta-agent");
  const bookforgeRoot = path.join(tempRoot, "opl-bookforge");
  const oplFlowRoot = path.join(tempRoot, "opl-flow");
  writeDomainPlugin(masRoot, "med-autoscience");
  writeDomainPlugin(magRoot, "med-autogrant");
  writeDomainPlugin(rcaRoot, "redcube-ai");
  writeDomainPlugin(metaAgentRoot, "opl-meta-agent");
  writeDomainPlugin(bookforgeRoot, "opl-bookforge");
  writeJson(path.join(masRoot, "contracts", "opl_agent_package_manifest.json"), {
    surface_kind: "opl_agent_package_manifest.v1",
    package_id: "mas",
    version: "0.2.6",
    capability_dependencies: [
      {
        package_id: "mas-scholar-skills",
        kind: "framework_capability_package",
        required: true,
        version_requirement: ">=0.2.0 <0.3.0",
        capability_abi: "mas-scholar-skills.v1",
      },
    ],
  });
  for (const [root, label] of [
    [masRoot, "MAS"],
    [magRoot, "MAG"],
    [rcaRoot, "RCA"],
    [bookforgeRoot, "OBF"],
  ]) {
    writeAuthorityFunctionInventory(root, label);
  }
  writeJson(path.join(metaAgentRoot, "contracts", "pack_compiler_input.json"), {
    source_refs: {},
  });
  writeJson(path.join(oplFlowRoot, ".codex-plugin", "plugin.json"), {
    name: "opl-flow",
    skills: "./skills/",
  });
  writeJson(path.join(oplFlowRoot, "contracts", "workflow-policy.json"), {
    schema: "opl_flow_workflow_policy.v3",
    package: { id: "opl-flow" },
    provides: [],
    requires: [
      {
        kind: "codex_skill",
        id: "agent-reach",
        source: "https://github.com/Panniantong/Agent-Reach",
        source_path: "agent_reach/skill",
      },
    ],
    recommends: [],
    compatible_optional: [],
  });
  writeFile(path.join(oplFlowRoot, "templates", "AGENTS.md"), "# OPL Flow fixture\n");
  writeFile(path.join(oplFlowRoot, "skills", "opl-flow", "SKILL.md"), "# OPL Flow\n");

  const packageRoots = {
    mas: masRoot,
    mag: magRoot,
    rca: rcaRoot,
    oma: metaAgentRoot,
    obf: bookforgeRoot,
    "mas-scholar-skills": scholarRoot,
    "opl-flow": oplFlowRoot,
  };
  for (const [packageId, sourceRoot] of Object.entries(packageRoots)) {
    if (packageId === "mas-scholar-skills") continue;
    initializeGitRepo(sourceRoot);
    commitFixtureRepo(sourceRoot, `fixture ${packageId} source`);
  }

  const officeCliRoot = path.join(tempRoot, "OfficeCLI");
  const mineruRoot = path.join(tempRoot, "MinerU-Ecosystem");
  const mineruDocumentExtractorRoot = path.join(tempRoot, "mineru-document-extractor");
  for (const root of [officeCliRoot, mineruRoot, mineruDocumentExtractorRoot]) {
    fs.mkdirSync(root, { recursive: true });
  }

  const toolsRoot = path.join(tempRoot, "tools");
  const nodeRoot = path.join(toolsRoot, "node");
  const nodeBin = path.join(nodeRoot, "bin", "node");
  const npmBin = path.join(nodeRoot, "bin", "npm");
  const npxBin = path.join(nodeRoot, "bin", "npx");
  const npmRoot = path.join(nodeRoot, "lib", "node_modules", "npm");
  writeVersionExecutable(nodeBin, "v22.0.0");
  writeVersionExecutable(npmBin, "10.0.0");
  writeVersionExecutable(npxBin, "10.0.0");
  writeJson(path.join(npmRoot, "package.json"), { name: "npm", version: "10.0.0" });
  writeFile(path.join(npmRoot, "lib", "cli.js"), "// npm fixture\n");

  const pythonRoot = path.join(toolsRoot, "cpython-3.12-fixture-macos-aarch64-none");
  const uvBin = path.join(toolsRoot, "uv");
  const temporalCliBin = path.join(toolsRoot, "temporal");
  const temporalCliArchive = path.join(toolsRoot, "temporal.tar.gz");
  const officeCliBin = path.join(toolsRoot, "officecli");
  const mineruOpenApiBin = path.join(toolsRoot, "mineru-open-api");
  writeVersionExecutable(path.join(pythonRoot, "bin", "python3"), "Python 3.12.0");
  writeVersionExecutable(uvBin, "uv 0.1.0");
  writeVersionExecutable(temporalCliBin, "temporal 1.0.0");
  writeFile(temporalCliArchive, "fixture temporal archive");
  writeVersionExecutable(officeCliBin, "officecli 0.0.1");
  writeVersionExecutable(mineruOpenApiBin, "mineru-open-api 0.0.1");

  const options = {
    version: "26.7.15-scholar-fixture",
    outDir: path.join(tempRoot, "out"),
    frameworkRoot,
    frameworkRef: "framework-fixture-ref",
    guiRoot: path.join(tempRoot, "gui"),
    masRoot,
    masRef: "mas-fixture-ref",
    masScholarSkillsRoot: scholarRoot,
    masScholarSkillsRef: "scholar-fixture-ref",
    magRoot,
    magRef: "mag-fixture-ref",
    rcaRoot,
    rcaRef: "rca-fixture-ref",
    metaAgentRoot,
    metaAgentRef: "oma-fixture-ref",
    bookforgeRoot,
    bookforgeRef: "obf-fixture-ref",
    oplFlowRoot,
    oplFlowRef: "flow-fixture-ref",
    officeCliRoot,
    officeCliRef: "v0.0.1",
    officeCliRelease: {
      requested_ref: "v0.0.1",
      resolved_ref: "v0.0.1",
      resolved_commit: null,
      latest_stable_verified: true,
      policy: "fixture",
      version: "0.0.1",
    },
    mineruRoot,
    mineruRef: "mineru-fixture-ref",
    mineruDocumentExtractorRoot,
    includeBunRuntime: false,
    runtimeCacheDir: path.join(tempRoot, "cache"),
    runtimeCacheMode: "off",
  };
  const sources = {
    nodeToolchain: { nodeBin, npmBin, npxBin, npmRoot },
    bunBin: null,
    pythonRoot,
    uvBin,
    temporalCliBin,
    temporalCliArchive,
    officeCliBin,
    mineruOpenApiBin,
    mineruRepoRoot: null,
  };
  return { tempRoot, options, sources, sourceCommit, frameworkCommit };
}
