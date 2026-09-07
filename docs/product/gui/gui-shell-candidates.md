# GUI Shell Candidates

Owner: `one-person-lab-app`
Purpose: `gui_shell_candidate_map`
State: `active`
Machine boundary: Human-readable map for active and candidate GUI shells.
Machine truth lives in `contracts/app-shell-adapter.json`,
`contracts/app-shell-candidates.json`, `contracts/shell-adapters/*.json`,
package scripts, validation output, and candidate package artifacts.

## Current Map

| Role | Shell | Physical checkout | Adapter contract | Default scope |
| --- | --- | --- | --- | --- |
| Active App GUI | `aionui` | `shells/aionui` or `OPL_APP_SHELL_ROOT` | `contracts/app-shell-adapter.json` | Stable plus Dev/Nightly Preview wrapper commands |
| Foreground candidate | `opl-studio` | `shells/opl-studio` or `../opl-studio` | `contracts/shell-adapters/opl-studio.json` | Explicit validation/build and dedicated Studio Preview release only; never App Stable/Dev/Nightly before adoption |

Stable role marker:
`gui_shell_roles: active=aionui; foreground=opl-studio`.

Default maintenance validates this two-role registry. Detailed candidate
contracts are intentionally carrier-owned and explicit:

| Validation scope | Owner entry | Default/release participation |
| --- | --- | --- |
| Fixed role registry | `npm run validate:shell-candidates` | Included in default structural gates; does not inspect candidate implementation detail. |
| OPL Studio foreground detail | `npm run validate:candidate:studio` / `npm run test:candidate:studio` | Explicit on demand; full candidate evidence is Studio-only. |

## 选择边界

两个 Shell 实现同一 App product contract，拥有独立 checkout、依赖树、bundle identity
和 GUI user-data。Runtime、Package、Codex thread 与 domain authority 不随选择迁移；
renderer 启动前通过 App-owned compatibility/admission。

Repository 与 adoption 责任见 [Studio 产品边界](opl-studio-plan.md)，Host 架构见
[Application Host composition](deepseek-harness-composition-plan.md)。
本文件只负责启动目标选择，不复制这些架构规则或 current source gap。

Codex executable 通过 `OPL_CODEX_BIN` 进入既有 App Server adapter。Active AionUI 使用
Shell-owned `opl_aioncore_managed_resources_projection.v1`，组合官方 AionCore Node-only
export 与 Shell 独立选择的官方 Codex package；Studio 不依赖 AionCore 或 AionUI parser。
具体打包与 readback 只维护在
[Codex carrier](../../architecture/aioncore-codex-only-carrier.md)。

显式 launcher、直接打开 bundle 与 installed process 分别验证 executable resolution。
同一产品名、两个窗口或一次顺序切换均不证明相同物理 runtime 或并发写安全。

## 两条选择轴

| Decision | Meaning | Authority / effect |
| --- | --- | --- |
| `active release shell` | Stable 与当前 Dev/Nightly Preview 的发布 GUI | 只由 `contracts/app-shell-adapter.json` 决定；当前为 AionUI。 |
| `local GUI launch target` | 本机本次打开 AionUI 或 Native | 每次 launch 局部选择；不得修改 active adapter、release role 或 updater channel。 |
| `adoption / promotion` | 候选正式替换默认发布 GUI | 显式修改 active adapter，并完成完整 adoption/release/owner gates。 |

## Adoption 与设计

本机选择 candidate 不改变 active release shell、App identity 或 updater feed。
Preview 到正式 App 的 handoff、原地升级、允许迁移的数据与回滚准入仅由
`contracts/app-release-channel.json#shell_transition_policy` 和
[Studio 产品边界](opl-studio-plan.md) 规定。候选构建和窗口可用不表示 adoption。

设计体系从 [GUI README](README.md) 进入；Shell 实现 App-owned 产品、交互与视觉，
不能从 upstream 默认或截图反向定义产品。当前证据通过
[Shell conformance](shell-conformance-matrix.md) 定位。

## Commands

### Local launcher

默认命令只激活已安装的 AionUI 主线，不重建、不改 user-data，也不改变 release adapter：

```bash
npm run gui
```

OPL Studio candidate 使用独立 bundle，可与正在运行的主线并存。默认 action 只允许 dry-run：

```bash
npm run gui -- --shell opl-studio
npm run gui -- --shell opl-studio --rebuild
npm run gui -- --shell opl-studio --workspace /path/to/project
npm run gui -- --shell opl-studio --plan
```

只有明确需要测试真实 mutation 时才使用：

```bash
npm run gui -- --shell opl-studio --allow-actions
```

切换权限模式前先退出已运行的 Native Candidate；`open` 不创建第二个 Candidate 实例，
已运行进程不会接收新的环境变量。Launcher 从 candidate registry 读取目标与 build/open
规则，缺失 checkout/bundle 时 fail closed，并输出 exact Runtime identity 与
`release_adoption_changed=false`。主线开发模式仍可显式运行
`npm run gui -- --shell aionui --mode dev`。

### Validation and packaging

Validate the default active GUI:

```bash
npm run validate:active-shell -- --quick
```

Validate the fixed role registry, then select candidate detail explicitly
without changing the active GUI:

```bash
npm run validate:shell-candidates
npm run validate:candidate:studio
```

Build the foreground candidate through the App wrapper. Full Studio evidence is
owned by the OPL Studio candidate path. The wrapper injects the current App
checkout as an absolute `OPL_APP_REPO_ROOT`; Studio then requires committed,
tracked-clean source and produces the Electron, standalone WebUI, Docker smoke,
and exact-commit carrier manifest required by the App contract:

```bash
npm run package:candidate:studio
```

If the candidate checkout is a sibling repo instead of `shells/<candidate>`,
set `OPL_APP_SHELL_ROOT` for that command:

```bash
OPL_APP_SHELL_ROOT=../opl-studio npm run package:candidate:studio
```

The generated carrier manifest is ignored candidate evidence. It does not
change `app-shell-adapter.json`, wire any distribution/update channel, or prove
signing, notarization, public publication, release admission, or adoption.

## Boundaries

Candidate package builds and local launches are technical candidate artifacts.
They do not switch the active release shell, Stable release packaging,
Dev/Nightly Preview packaging, release readiness, owner acceptance, runtime
truth, domain truth, artifact authority, or current App release status.

The default release GUI changes only when `contracts/app-shell-adapter.json` is
edited and the App shell adapter, product profile, page-state, first-run,
package, release, and owner gates pass for that adoption. Local launch selection
is deliberately outside that authority path.

## 文档生命周期

本文只维护 active/foreground 选择、启动操作与 adoption 边界。Studio 的架构与产品角色见
[Studio boundary](opl-studio-plan.md)，实现状态与证据通过
[Shell conformance](shell-conformance-matrix.md) 定位。每轮候选工作、source SHA、测试结果、
迁移顺序和待办写入该 operation 的报告，不按历史顺序追加到本文件。
