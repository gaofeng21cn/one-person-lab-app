# App Script Reference

Owner: `one-person-lab-app`
Purpose: `maintainer_command_reference`
State: `active`
Machine boundary: `package.json`, script argument parsers and workflows own executable behavior.

App scripts coordinate the external Shell, build assets and collect owner
evidence. Use the root package aliases below; implementation helpers are not
additional operator protocols. Full flags are defined by each script's parser.

## Development

| Task | Entry |
| --- | --- |
| Materialize selected active Shell | `npm run ensure:shell` |
| Install active Shell dependencies | `npm run install:shell` |
| Select/launch local GUI | `npm run gui` |
| Active Shell desktop or WebUI | `npm start`, `npm run webui` |
| Prepare App payload and compile | `npm run package` |
| Build selected OS carrier | `npm run build-mac:arm64`, `npm run build-win`, `npm run build-deb` |
| Check model policy projection | `npm run codex:model-policy:check` |
| Regenerate model policy projection | `npm run codex:model-policy:sync` |
| Explicit Studio candidate package | `npm run package:candidate:studio` |

Shell selection comes from `contracts/app-shell-adapter.json`; explicit candidate
selection does not change the release role. See [architecture](../docs/architecture.md).
The [testing guide](../docs/testing/README.md) owns check selection and evidence scope.

## Delivery

| Task | Entry |
| --- | --- |
| Authorized Stable dispatch | `npm run release:stable-dispatch -- <operation arguments>` |
| Read incident/recovery status | `npm run release:incident-status -- <arguments>` |
| Manual local App / Full build | `npm run manual:local-app`, `npm run manual:full-dmg` |
| Inspect exact local assets | `npm run validate-release -- <asset-directory>` |
| Inspect exact public assets | `npm run verify-remote-release -- <arguments>` |
| Collect requested cohort evidence | `npm run release:collect-evidence -- <arguments>` |
| Write / validate evidence manifest | `npm run release:evidence:manifest -- <arguments>`, `npm run release:evidence:validate -- <arguments>` |
| Prepare release notes / check provider | `npm run release:notes:prepare -- <arguments>`, `npm run release:notes:probe-ai` |
| Explain Actions timing | `npm run release:actions-timing -- <arguments>` |
| Inspect Full size / pruning | `npm run release:full:size -- <arguments>`, `npm run release:full:prune-audit -- <arguments>` |
| Plan WebUI GHCR cleanup | `npm run release:cleanup-webui-ghcr -- <arguments>` |

The [release guide](../docs/delivery/release/README.md) is the sole operational
reference for admission, dispatch, recovery and public readback. The
[immutable Bundle reference](../docs/delivery/release/immutable-release-bundle.md)
owns release identity; [cache architecture](../docs/delivery/actions-cache-architecture.md)
owns acceleration. Timing/cache output cannot authorize publication.

Commands that collect live actions, dispatch workflows, publish or delete assets
are mutations, not ordinary validation. Use the requested operation's existing
authority and inspect current durable state before recovery. Historical record
readers under `release:historical-*` interpret sealed evidence only and cannot
authorize a current publication.

## Documentation And Platform Checks

| Task | Entry / owner |
| --- | --- |
| Publishing template integrity | `npm run docs:publishing-templates` |
| Generate maintained user guides | `npm run docs:guides` |
| Generate App whitepaper | `npm run docs:whitepaper` |
| Publish prepared guides | `npm run docs:publish`; [publishing reference](../docs/publishing/README.md) |
| Docker/WebUI smoke | [Docker smoke gates](../docs/delivery/install/docker-webui-smoke-gates.md) |
| Windows platform/WSL2 | [Windows validation](../docs/delivery/validation/windows-wsl2/README.md) |

Generated user artifacts belong under the declared ignored site/output paths;
tracked source and manifests stay with their guide owner. Rendering validates
artifact integrity, not release readiness. Retired runbooks and probe commands
must be removed with their callers rather than kept as compatibility entries.
