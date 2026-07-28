<p align="center">
  <img src="assets/branding/opl-app-logo.png" alt="One Person Lab App 标志" width="132" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab App</h1>

<p align="center"><strong>面向复杂知识工作的本地优先 AI 工作台</strong></p>
<p align="center">在本机或浏览器里进入科研、基金、演示、写书和通用任务，查看进度、继续长任务、检查交付物</p>

<!--
Owner: `one-person-lab-app`
Purpose: `public_app_entry_zh_cn`
State: `active_public_entry`
Machine boundary: 人读产品入口。机器真相在 `contracts/`、源码、release artifacts、updater metadata、validation outputs，以及 App 消费的 OPL Framework/domain projections。
-->

<p align="center">
  <img src="assets/branding/opl-app-user-journey-v2.png" alt="One Person Lab App 从选择任务到成果交付的用户旅程" width="100%" />
</p>

## 为什么需要它

AI 已经很擅长回答问题和生成内容，但当工作变成一篇论文、一个基金本子、一套汇报材料或一个长期项目时，用户真正关心的是：

- 从哪里开始，下一步该做什么？
- 之前跑过的任务进展到哪一步了？
- 生成了哪些文件，哪些还需要检查？
- 后台任务是否还在运行，失败时卡在哪里？
- 研究、基金、汇报这些专业 Agent 能不能放在一个统一入口里使用？

**One Person Lab App 就是这个入口。** 它把 One Person Lab、专业 Agent 和常用工具打包成桌面应用，让用户用一个界面进入复杂知识工作。

它不是把研究、基金、汇报压成一排按钮，而是把“开始、继续、查看进度、打开文件、处理阻塞”放到同一个产品里。用户不用关心背后是哪一个专业 Agent 在工作，只需要看到当前任务做到哪一步、生成了什么、还缺什么、下一步怎么继续。

OPL App 也不是只能装在一台 Mac 上的本地工具。当前产品面包括 macOS 桌面
App、Linux x86_64 Native WebUI，以及 Linux、Windows、服务器或云主机上的
Container WebUI。macOS arm64 Native WebUI 已实现，但只有首次精确公开发布和
readback 完成后才会成为普通浏览器路径。Hosted OPL Workspace 是 X0-03 条件
route，只有真实账号、存储、隔离、backend 和 owner policy 就绪后才出现，不是
当前普通产品承诺。

## 核心亮点

**一个入口进入多类专业 AI 工作**<br/>
从桌面应用进入通用工作、科研、基金、演示和写书，不需要在多个命令、仓库和工具之间切换。

**桌面与浏览器共享一套工作台**<br/>
本机 App、Native WebUI 与 Container WebUI 共享任务、产物、进度和回执语义。
Hosted Workspace 只有满足 X0 owner/backend gate 后才复用这套表面。

**看得见长任务进度**<br/>
应用展示任务进展、文件、运行状态和可继续的上下文。用户回来时可以直接看到做到了哪一步、有哪些结果、是否需要人工处理。

**把首次安装做成产品体验**<br/>
macOS 新用户可以使用完整首次安装包，先打开 App，再让后台继续准备框架、专业 Agent、技能和工具载荷。

**专业 Agent 保持清晰分工**<br/>
科研、基金、演示、写书四个默认目的入口面向不同类型成果。用户看到统一入口，背后仍保留各自专业判断和交付边界。

**让专业 AI 保持专业空间**<br/>
App 负责把入口、进度、文件和交付体验做好；医学研究、基金写作和视觉交付的具体判断，仍交给对应专业 Agent 完成。当任务进入专业阶段时，用户可以看到 AI 读资料、比较方案、接受审阅、继续修订并形成下一版交付物。

**适合从日常使用走向长期托管**<br/>
它不只服务一次对话，也面向需要多轮推进、后台维护、失败恢复、远程访问和持续交付的工作。

## 设计理念

想了解 OPL App 为什么从工作目的开始、如何让成果带着来路，以及为什么把内部诊断留在需要时才展开，请阅读 [OPL App 白皮书（HTML）](https://gaofeng21cn.github.io/one-person-lab-app/latest/whitepapers/opl-app-whitepaper.html) 或 [PDF 版本](https://gaofeng21cn.github.io/one-person-lab-app/latest/whitepapers/opl-app-whitepaper.pdf)。

## 下载与安装

用户先选择 Desktop、WebUI 或 Headless，不需要先理解 GitHub、Homebrew 或
GHCR。统一入口、平台矩阵、校验、更新和回滚见
[One Person Lab 安装指南](docs/delivery/install/README.md)；维护侧术语与状态见
[分发与安装 SSOT](docs/delivery/distribution-and-install-ssot.md)。

### Homebrew

已经使用 Homebrew 的 macOS arm64 用户，可以走最短终端路径：

```bash
brew tap gaofeng21cn/one-person-lab
brew install --cask one-person-lab
open -a "One Person Lab"
```

Nightly 构建需要显式选择：

```bash
brew install --cask one-person-lab-nightly
```

需要完整首次安装载荷时：

```bash
brew install --cask one-person-lab-full
open -a "One Person Lab"
```

更新使用标准 Homebrew 流程：

```bash
brew update
brew upgrade --cask one-person-lab
```

Homebrew 是 App cask 分发路径。安装后打开 `One Person Lab.app`；首次启动使用共享的 App 设置流程，然后由 App 在后台继续所需维护。如果 App 提示需要设置或修复，按应用内提示操作。需要终端诊断时，可以运行：

```bash
opl system initialize --json
```

Homebrew 本身也支持 Linux。当前 `opl` Formula 在 macOS/Linux 安装 OPL
Base/CLI；Desktop Cask 仍只适用于 macOS。跨平台
`one-person-lab-webui` Formula 技术上可行，目标是让 macOS/Linux 使用同一条
Browser WebUI 命令，但当前尚未实现。

希望通过 Homebrew 一次拿到完整首次安装包时，使用
`one-person-lab-full`。release channel、updater、Full package 和 macOS trust
细节由
[App release guide](docs/delivery/release/README.md) 与 App contracts 维护。

### 可信安装入口

从包含 `opl-install.sh` 的 Release 起，macOS 与 Linux 使用同一个按版本冻结的
公共入口。下载同 tag 的脚本和 component manifest，校验脚本 digest 后再执行：

```bash
VERSION=<release-version>
BASE="https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${VERSION}"
curl -fLO "${BASE}/opl-install.sh"
curl -fLO "${BASE}/opl-app-component-manifest.json"
EXPECTED="$(jq -r '.artifacts[] | select(.name == "opl-install.sh") | .digest | sub("^sha256:"; "")' opl-app-component-manifest.json)"
if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 opl-install.sh | awk '{print $1}')"
else
  ACTUAL="$(sha256sum opl-install.sh | awk '{print $1}')"
fi
test "$ACTUAL" = "$EXPECTED"
chmod 0755 opl-install.sh
./opl-install.sh
```

需要显式选择时使用 `--desktop`、`--webui`、`--native-webui`、
`--container-webui` 或 `--headless`。

已安装 Homebrew 的 macOS 用户使用摘要绑定的 Standard Cask：

```bash
brew install --cask gaofeng21cn/one-person-lab/one-person-lab
```

未安装 Homebrew 时，从下面的 GitHub Release 下载精确 DMG。不要把可变
`main` 分支中的 `install.sh` 直接通过管道交给 shell 执行。仓库脚本仍供从已审阅
source checkout 开发或恢复时运行 `./install.sh`。公开 Release 同 tag 的
`opl-app-installer.sh` 会在任何 App 目标变更前校验其 component manifest 与 DMG：

```bash
curl -fLO https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v<version>/opl-app-installer.sh
chmod 0755 opl-app-installer.sh
./opl-app-installer.sh --stable-macos-install --standard --release-tag v<version> --yes
```

### 直接下载

也可以从发布页下载当前桌面包：

[下载 One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

没有 Homebrew 的 macOS arm64 新用户优先选择
`One-Person-Lab-Full-<version>-mac-arm64.dmg`。同一完整首次安装包也可以通过
`one-person-lab-full` Homebrew cask 安装。

macOS 可以通过 DMG、Homebrew 或 Container WebUI 使用；Linux x86_64 已支持
公开 Native WebUI，Container 仍可用于隔离和服务器。Linux Desktop 已有构建能力，
但尚未完成公开发行与 clean-host 资格。macOS Desktop 首次启动图文教程以
[macOS App install user guide](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install.html)
为主入口；同一份 guide 也提供
[可转发 PDF](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install-slides.pdf)、
[可转发 PPTX](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install-slides.pptx) 和
[detailed PDF](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install-detailed-guide.pdf)。

日常更新由 Homebrew 或应用内更新通道完成，取决于安装方式。release asset、updater metadata 和 Full first-install 边界由 App release guide 与 contracts 维护。

### 安装与更新对象

Full 首装包是给干净机器准备的预置载荷，不是长期更新通道。安装完成后，App
维护只暴露三个软件对象。运行时、集成、Codex 投影和 profile migration
都只是所属对象内部的状态详情，不形成独立 updater：

| 对象 | 用户应如何理解 |
| --- | --- |
| OPL Base | Framework 持有的无界面运行前提。Runtime substrate、隔离的 embedded Codex CLI、Temporal、native helpers 和 companion-tool integration 都是 Base 内部的依赖或集成状态。Homebrew Formula `opl` 与 Framework installer 只是同一 Base 对象的不同 carrier。 |
| OPL App | GUI 与控制面。standard updater、Homebrew Cask 和 signed installer 只更新 App carrier，不修改 Base 或 Packages。 |
| OPL Packages | Framework 管理的 Agent、能力和工作流 package，包括 MAS/MAG/RCA/OMA/OBF、MAS Scholar Skills 与 OPL Flow。Codex Surface readiness 和 workflow-profile migration 是 package transaction 子状态，不是独立软件对象或更新通道。 |

User Data / Artifacts 属于独立的存储、保留与清理边界，不是可安装软件，也不会成为第四个 updater 对象。

Windows、macOS browser、服务器或云主机用户使用 Container WebUI 时，请从
[Docker/WebUI install guide](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html) 开始；Linux x86_64
个人电脑默认可用 Native WebUI。同一份 Container guide
guide 也提供
[detailed PDF](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install-detailed-guide.pdf)。

## 应用能做什么

One Person Lab App 是面向用户的日常 chat-first 桌面入口：

- 从一个桌面界面进入通用工作，以及科研、基金、演示、写书四个默认目的入口。
- 在 macOS 桌面与本机/服务器浏览器 WebUI 之间保留同一套工作台语义；Hosted Workspace 仍是条件 X0-03。
- 默认提供科研、基金、演示和写书入口；更多专业能力由可扩展 Agent Packages 提供。
- 展示进度、文件、运行状态和可恢复的工作上下文，帮助用户继续长任务和检查交付物。
- 首次启动先完成最基本的可用准备，再让更完整的运行环境和专业 Agent 载荷在后台维护。
- 通过 Homebrew、直接下载或完整首次安装包提供安装和更新路径。
- 把 One Person Lab 和领域智能体呈现为可直接使用的产品体验。

## 用户路径

1. 从发布页下载应用包。
2. 打开 `One Person Lab.app`。
3. 让首次启动完成基础设置；界面会显示准备进度和下一步。
4. 选择工作目录。
5. 开始通用工作，或进入科研、基金、演示、写书入口。
6. 通过进度、文件和运行状态视图继续任务、检查交付物。

## 产品边界

One Person Lab App 负责桌面产品体验：打包、发布、更新、首次启动、界面状态、截图和用户文档。它证明的是用户能否顺利安装、打开、进入任务、查看进度和处理文件；医学研究、基金写作和视觉交付是否合格，仍由对应专业 Agent 和人工决策来判断。

公开角色图：

- App 是普通用户产品入口和 GUI 产品事实源。产品导航、页面状态预期、用户文档、截图，以及让用户管理专业 Agent package 的界面，都由 App 仓维护。
- Agent package management 是 App 产品面，但 package lock、生命周期 receipt、校验、rollback ref 和 package truth 归 Framework/root。App 负责请求和展示这些事实，不能把 shell 本地状态当成安装权威。
- One Person Lab Framework/root 持有 App 背后的 runtime state、action execution、package/runtime projection、provider/domain projection 和领域路由事实。
- AionUI 是主线 shell implementation carrier；Native Workbench 是开发备选候选。二者都消费 App/root canonical state，不持有 product、runtime、package 或 domain truth。

App 决定用户看到的安装形态、默认入口、首次启动体验和设置界面。One Person Lab Framework 提供背后的运行、初始化和进度数据，MAS、MAG、RCA、OBF 承载各自专业判断和交付物。App 只负责把这些能力呈现为用户能使用的桌面产品体验，不替专业 Agent 做领域判断。

当前 OPL App 工作台有两个必要入口：本机桌面 App 与 Docker/WebUI 浏览器入口。Docker/WebUI 是 U1-05 的同产品浏览器形态，不是第二套产品。Hosted OPL Workspace 是 X0-03，只有真实账号、存储、隔离、backend 和 owner policy 存在时才可复用这套语言；本仓不为它维护 placeholder state 或默认发布义务。

GUI 产品事实也由 App 仓维护。当前 GUI 主线是基于 AionUI 的 OPL 品牌壳；Native Workbench 是开发备选和 foreground candidate；Hermes Desktop / `hermes-codex` 保留为 prior-candidate reference。`agui-codex`、PilotDeck 等只作为已归档技术验证或参考材料，不再作为日常实现、默认验证或抛光路线；真正进入产品的界面、默认行为和发布体验，以 App 仓的产品文档、合同和验证结果为准。

需要框架、运行时和合同信息时，请进入 [`gaofeng21cn/one-person-lab`](https://github.com/gaofeng21cn/one-person-lab)。

## 技术入口

<details>
  <summary><strong>展开开发者与发布说明</strong></summary>

### 仓库结构

```text
one-person-lab-app/
  assets/               应用首页和产品视觉资产
  docs/                 应用产品、发布、测试、截图和用户文档
  contracts/            应用层机器可读合同
  scripts/              应用层验证和发布包装脚本
  shells/
    aionui/             gaofeng21cn/opl-aion-shell 的外部检出目录
```

`shells/aionui/` 不纳入本仓跟踪。构建和验证时从 `gaofeng21cn/opl-aion-shell` 检出，AionUI 历史和贡献者记录保留在独立 shell 仓库中。Native Workbench 作为开发备选候选，同样以 `shells/opl-native-workbench` 外部检出承载；Hermes Desktop / `hermes-codex` 保留为 prior-candidate reference。`shells/agui-codex/` 只保留到 `gaofeng21cn/opl-agui-codex-shell` 的已归档技术验证链接；除非明确要求 AGUI replay，不再默认更新、完善或抛光。

### 常用验证命令

```bash
npm run ensure:shell
bun install --cwd shells/aionui --frozen-lockfile
bun run validate:active-shell
npm run validate:gui-shell
bun run i18n:types
bun run test
bun run build-mac
```

发布资产归一化和验证从应用根目录暴露：

```bash
bun run prepare-release-assets -- build-artifacts release-assets
bun run validate-release -- release-assets
```

当前活动界面由 [`contracts/app-shell-adapter.json`](contracts/app-shell-adapter.json) 声明：

- 活动界面：`aionui`
- 界面目录：`shells/aionui`
- 运行桥接合同：`contracts/app-runtime-bridge.json`
- 上游家族：`AionUI`
- 界面来源：`gaofeng21cn/opl-aion-shell`
- 历史策略：外部检出，不合并进 App 默认分支

不改变默认发布 adapter 的情况下，可以显式选择 Native Workbench 开发备选候选：

```bash
OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/opl-native-workbench.json npm run package
```

Hermes Desktop 保留为显式 prior-candidate reference：

```bash
OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/hermes-codex.json npm run package
```

已归档 AGUI 技术验证只在明确要求 AGUI replay 时回放，不属于正常 GUI 开发路径：

```bash
OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/agui-codex.json npm run package
```

显式回放 package validation 要求 manifest 声明 `candidate_app_bundle_ready`、`explicit_candidate_app_bundle`，以及相对路径形式的 `.app` bundle；该 bundle 必须包含 `Contents/Info.plist` 和 `Contents/MacOS` 可执行文件。纯文本 smoke artifact 不算可回放 App package。

当前迁移与发布状态见 [`docs/status.md`](docs/status.md)。

### 产品与安装合同

App 产品默认策略由
[`contracts/app-product-profile.json`](contracts/app-product-profile.json)
声明。安装与 Codex 可见暴露策略由
[`contracts/app-install-exposure-policy.json`](contracts/app-install-exposure-policy.json)
声明，运行桥接策略由
[`contracts/app-runtime-bridge.json`](contracts/app-runtime-bridge.json)
声明，release channel 策略由
[`contracts/app-release-channel.json`](contracts/app-release-channel.json)
声明。这些 contracts 维护用户可见安装面、standard 与 Full package 边界、
7 层安装/更新分类、updater 可见性、Homebrew cask policy、条件保留的 X0-01 运行状态页桥接行为、
App 管理的 Codex 暴露、Workflow Profile merge 边界和 release validation gates。

OPL Framework 仍生产 install/sync/read-model surfaces、runtime state 和 action
execution。MAS/MAG/RCA/OMA 继续持有 domain skill semantics、quality/export
judgment、artifact authority 和 owner receipts。发布脚本会在打包前把 App-owned
product contracts 同步到活动 shell，让 shell 消费 App truth，而不是定义 App
truth。

当前 release 操作、Full package policy、macOS trust 诊断、updater metadata 和 evidence
gates 见 [App release guide](docs/delivery/release/README.md)。当前 App 产品状态和剩余
gap 见 [`docs/status.md`](docs/status.md) 与
[`docs/active/app-ideal-state-gap-plan.md`](docs/active/app-ideal-state-gap-plan.md)。

GUI 定义栈按顺序阅读：[`docs/product/gui/ideal-interaction-spec.md`](docs/product/gui/ideal-interaction-spec.md) 定义不绑定具体 shell 的理想交互形态，[`docs/product/gui/codex-to-opl-app-delta.md`](docs/product/gui/codex-to-opl-app-delta.md) 定义 Codex App 变成 OPL App 需要追加、隐藏和治理的产品增量，[`docs/product/gui/feature-inventory.md`](docs/product/gui/feature-inventory.md) 维护跨 shell 的能力清单。后续设计或评审 GUI 时先看这三份，再看 contracts 和 page-state 矩阵；AionUI 是当前实现主线，Native Workbench 是开发备选和 foreground candidate，Hermes Desktop / `hermes-codex` 是 prior-candidate reference，`agui-codex` 和 PilotDeck 只提供已归档技术验证或参考材料，不能反过来定义 OPL App 产品事实。

### Agent / Framework Boundary

- App 展示 OPL route 和 progress projection 给出的下一步、阻塞、文件和状态，但不把它们当成 MAS/MAG/RCA 的领域裁决。
- Foundry Agents 的具体工作仍发生在各自 stage attempt 内部；App 不规定专业 Agent 必须按什么工具顺序思考或创作。
- 工具和技能入口对 App 来说是可用能力目录；权限、凭据、可写范围和质量裁决仍由 Framework 与 domain agent 的合同和回执约束。

</details>
