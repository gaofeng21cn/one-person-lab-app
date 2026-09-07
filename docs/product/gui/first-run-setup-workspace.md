# 首启设置工作台

Owner: `one-person-lab-app`
Purpose: `focused_first_run_setup_workspace`
State: `active`
Machine boundary: 本文定义 App 首启产品体验；机器真相归
`contracts/app-gui-product-contract.json`、`contracts/app-page-state-matrix.json`、
`contracts/app-first-run-test-matrix.json`、Framework initialize 输出、active shell source、
focused tests 与用户路径截图。Official Profile 的安装结果以 configured carrier 的
clean-user installed/callable readback 为准；本文只定义首启体验，不维护迁移完成度。

## 背景

旧首启页把完成百分比、三张检查卡、阻塞项、下一步、密钥表单和普通产品导航同时放在第一屏。
它能展示状态，但更像运行状态面板，不像面向首次使用者的设置流程。用户需要先解释多个重复信号，
才能找到真正要完成的模型访问配置。

首启是一个专注但不阻断的三步设置工作台。首启流程内隐藏普通产品导航，
但检查中、需要操作和错误状态都保留显式“进入 OPL”动作；用户可以先进入 `/guid`，以后再继续设置。
配置完成后仍在原位显示完成态，并由用户主动进入正常 App shell。

## 目标

首启第一屏只回答四个问题：

1. 当前是三步中的哪一步。
2. 已经完成了什么。
3. 现在只需要做什么。
4. 现在如何进入 OPL，或继续完成设置。

页面必须保留真实的能力级前置条件、阻塞原因、初始化阶段、后台维护和诊断能力，但技术信息默认折叠；
这些状态不得重新成为 ordinary App route gate。

## 普通启动边界

- 认证后的根路由、登录成功、历史 `/startup-gate` 与 catch-all 都直接进入 `/guid`。
- ordinary launch 不渲染等待 fast state 的 `StartupGate`。`opl app state --profile fast --json`、
  managed-agent discovery 与其它局部状态在 Guid 已进入后后台刷新；失败只影响依赖该状态的局部能力。
- 只有刚完成 WebUI 登录的导航携带一次性 `postLoginSetupCheck`。Home 读取到明确的
  Core 未完成状态后用 replace 进入 `/first-run`；readiness 未知、超时或读取失败时
  fail-open 留在 `/guid`。该一次性 UI 检查最多等待 20 秒；普通启动、已登录刷新和
  deep link 不携带该意图，也不自动打断用户。
- installed launch target 为 `<=1500 ms`，计时从 OS launch request 到 Guid composer
  **visible、enabled、focusable**。后台 hydration 完成不属于终点。
- 该数值目前是产品目标，不是已测事实或 SLA；只有绑定 exact installed build 的测量证据才能宣称达标。
- `/first-run` 仍是显式、可恢复的三步设置工作台；移除普通 StartupGate 不删除 first-run 或 Core readiness。

## Official Profile Package 安装

当前 App source 路径：

- App 只有一个 `OPL Official Profile`，列出首次安装需要的官方 root Packages。
  Standard 在线安装，Full 优先使用离线 seed；两者读取同一 Profile 和同一 source
  helper，Full 不增加第二 root 清单。
- 首次安装通过 generic Package directory/status/action projection 逐 root 收敛，并按
  Package 声明补齐 required identity。
  例如 MAS 需要 `capability:mas-scholar-skills`，但 ScholarSkills 不必重复列为
  Official root。
- Package 依赖只检查 presence 和 callability，不以 version、ABI、lock、payload、
  digest、receipt 或 Release Set 作为首启门禁。
- 每个 root 独立显示 `waiting / installing / ready / attention`。一个 root 或依赖失败
  只让该 Agent 不可用；普通 Codex、App、Base 与其他 Package 继续。
- Codex Core 可用后用户仍可进入 `/guid`；Official Profile 安装继续后台执行并在
  Settings > Agents 显示。自动安装不能变成新的全屏等待门。
- Profile 只在 first install 或用户显式选择“恢复官方组合”时执行。用户后来卸载
  官方 Package 后，首启检查、普通启动、日更和 App update 都不得重新安装它。
- helper 只读取 `opl app state --profile fast --json` 并调用 directory entry 提供的
  opaque action ref；它不调用私有 Package lifecycle 命令，也不决定 Codex Plugin
  Manager、Git 或其它 carrier。
- 首次安装完成状态必须来自 configured carrier 的 installed/callable fresh
  aggregation，不能来自 OPL lock、payload、receipt 或下载成功。该 installed
  outcome 仍需对应 carrier 的安装用户路径验收。

## 桌面布局

- 使用全视口 `focused_setup_workspace`，覆盖普通 Titlebar、Sider 和会话历史区。
- `/first-run` 是认证后的独立路由，不挂载普通 Layout，因此普通快捷键、托盘、deep link 和通知导航不会卸载首启。
- readiness 的 ready、blocked、unknown、timeout 和读取失败都不得把普通启动改道到
  `/first-run`。fresh WebUI login 是唯一例外：它先进入 `/guid` 并携带一次性检查意图，
  仅当 fast state 明确显示任一 Core 项未完成时 replace 到 `/first-run`；ready、unknown、
  timeout 或 read failure 均留在 `/guid`。任何导航都不得修改 readiness。
- 顶部是精简品牌栏，显示 One Person Lab 品牌、未就绪时始终可用的“进入 OPL”动作与帮助入口。
- macOS 品牌栏保留 traffic lights 安全区；Windows/Linux 复用现有最小化、最大化和关闭按钮。
- 主工作区最大宽度约 1040px，采用 `240px + 1fr` 两栏。
- 左侧固定三步：工作目录、本机能力、模型访问。Official Profile 的 Package
  安装进度归“本机能力”，不新增第四步或独立 Package setup wizard。
- 左侧只显示步骤状态和 `已完成数 / 总数`，不显示百分比。
- 右侧一次只承载当前任务；检查中、需要配置、失败和完成在同一位置原位替换。
- 技术详情在工作区下方折叠，帮助入口可以打开该折叠区。

普通导航在用户主动进入 `/guid` 之前不可见，包括 `ready_to_launch` 已成立但仍停留在完成态时。
普通 Layout 不挂载；FirstRun 仍对根节点内的非自身 sibling 设置 `inert` 和 `aria-hidden`，首焦点留在 FirstRun；卸载首启页时恢复原属性。
首启页不得把新会话、搜索、定时任务、运行状态、设置或空会话历史作为首次配置的视觉或交互竞争项。

## 模型访问

模型访问是唯一需要用户输入的常见首启步骤。Desktop 与 WebUI 都提供两条真实路径，并默认选择账户登录：

- `OPL Gateway 账户`：输入邮箱和密码。Desktop 通过 typed IPC，WebUI 通过既有 `/api/opl-runtime/*`
  HTTP proxy，二者最终都调用 `opl connect gateway login --credentials-stdin --json`；首启不显示设备名称，使用 Framework 默认值。
- `API Key`：保留现有 `configureCodex` stdin bridge，作为兼容方式。

账户登录和 API Key 使用分段控件切换。`已有 Codex 配置` 不再占用分段控件，而是在其外提供独立次要重检入口。
当前路径只能有一个主操作；配置或重检请求进行中时，禁用路径切换和另一条动作，直到当前请求结束。

Desktop 不注入 App 私有 `CODEX_HOME`。进程已有显式 `CODEX_HOME` 时原样保留，否则让 Codex 和 Framework 使用系统默认
`~/.codex`。启动检测和“已有 Codex 配置”重检均为只读；只有用户显式选择 Gateway 或 API Key 后，才允许 Framework
通过带备份与恢复能力的原子合并修改相关配置字段。

账户登录成功后必须读取 `opl app state --profile fast --json`。未发现 managed key 时，只有唯一解析出 Codex 分组才执行
`gateway_account_complete_setup`；无法唯一解析时显示本地化 `group_selection_required`，不得宣称模型访问已就绪。完成设置后必须
重新读取 fast state；若仍暴露 `gateway_account_use_for_model_access`，必须显示独立的“设为模型访问方式”确认动作。账户登录不构成
这项 medium-impact 本机 Codex provider mutation 的确认。登录成功后，凭据字段必须替换为明确的本地化成功状态，并把键盘焦点移到
“设为模型访问方式”；在用户确认前仍保持 `codex_config` 未就绪。只有用户显式确认后才允许执行，并在执行前后都读取 fresh state。每次成功的权威读取都发布
到共享 App state 缓存，使已挂载的首页和侧栏同步解除旧阻断；最终仍只以 initialize 确认 `codex_config` ready。
密码在成功、失败或切换方式后立即清空，不进入 App state、generic action、stdout/stderr、receipt 或 renderer diagnostics。
API Key 输入保留可见字段标签、密码显隐、安全说明和 renderer 脱敏。Desktop 与 WebUI 都默认展示 Gateway 账户登录，并保留 API Key 兼容入口。

## 状态模型

### 检查中

- 当前步骤显示明确的检查状态。
- 右侧显示 initialize event 的用户可读标签和耗时。
- 不显示伪精确百分比；允许用户显式进入 OPL，但不得把该导航解释为 readiness 已成立。
- initialize payload 返回前不得显示“没有待处理项”或“可以开始使用”。

### 需要操作

- 标题直接说明当前任务。
- 多个 Core 项同时未就绪时，按固定三步顺序选择第一个未就绪项，rail active 状态与右侧任务必须一致。
- 正文解释缺少什么、为什么需要、下一步是什么。
- 错误靠近当前任务显示本地化文案；技术原文只放在技术详情，不进入 beginner toast。
- “进入 OPL”保持可用，只导航到 `/guid`，不触发配置、App action 或维护命令。

### 验证中

- 主按钮原位显示 loading，防止重复提交。
- API Key 仅在验证成功后清空；Gateway 密码无论成功或失败都清空。

### 完成

- 右侧当前任务原位替换为完成态。
- 不显示巨大 `100%`。
- 页面只保留一个主操作：进入 OPL。
- initialize 结果不得自动跳转；只有用户点击完成态主操作才进入 `/guid`。
- 进入 `/guid` 时继续携带 `postInstallSelfCheck` route state。

未就绪时的“进入 OPL”属于 defer entry：它不携带 `postInstallSelfCheck`，不调用 initialize/configure/action/maintenance bridge，
不修改或合成 `ready_to_launch`。`ready_to_launch` 不约束 App 主界面导航；进入普通 shell 后改用能力级前置条件。

## 进入 OPL 后的渐进式恢复

- 普通侧栏在任一 Core 前置条件未完成时持续显示“完成首次设置”，点击后返回 `/first-run`；它不是模态框，也不会自动改变当前路由。
- Home composer 上方不得常驻泛化的“运行环境需要处理”横幅。用户真正发起发送但被 Codex CLI
  或模型访问阻断时，才在 composer 附近显示局部、非模态的恢复提示，并保留草稿。
- 普通文字对话只要求本机助手与模型访问。发送被拦截时保留草稿，在输入区下方显示本地化原因和“完成设置”动作。
- 工作目录未完成时，只禁用 project/OPL workspace controls；普通本地对话以及当前 composer 的
  attachment、file/directory picker、paste/drop 与 `/open` 继续可用并只服从 Codex permission/approval/sandbox。
  Codex CLI/model prerequisites 保持原有约束。
- readiness 尚未读取成功时，不合成失败状态、不修改 `ready_to_launch`，也不凭缓存之外的信息阻断普通操作尝试。
- 所有恢复提示必须非模态、可键盘访问，并给出直接返回首启工作台的合法入口。

## 响应式与可访问性

- 窄屏下步骤栏移动到任务面板上方，保持三步顺序和状态语义。
- 输入框、分段控件和主按钮在手机宽度下改为单列，不产生横向滚动。
- 在 App 允许的 400×600 最小窗口中，隐藏重复标题、完成计数、提示性图标和二级上下文，保留紧凑三步轨道、当前任务、必要输入与完整主操作；当前主操作和顶栏“进入 OPL”均不得被裁切或遮挡。
- 状态必须同时使用图标和文本，不只依赖颜色。
- 交互控件触控目标不小于 44px。
- 所有交互使用 Arco 组件，保留键盘焦点与可见字段标签；可访问名称使用本地化可见文本或 `aria-labelledby`，不得使用 testid。
- initialize、模型访问和维护动作共享一个页面级请求锁；任一请求进行中时不得启动竞争动作。
- 技术详情只在首启页内展开，不提供提前离开到普通 Settings 的入口。
- 访问密钥可以保存在本机并只发送到已配置的模型端点；任何 renderer 错误和诊断在显示前必须脱敏本次提交的密钥。
- Gateway 密码只通过 runtime provider 进入专用 stdin secret bridge；WebUI 复用现有 runtime HTTP proxy，不新增秘密通道，renderer 不保存或显示密码。
- 中英文都只显示 App-owned beginner copy；raw setup fields、命令、路径和 provider 细节默认隐藏。

## 不做的事

- 不改变 `ready_to_launch` 的 Core 汇总语义和 required items；普通 shell 使用更细的能力级前置条件。
- required Core item 的 `disabled` 状态不得计为 ready；只有真实可用状态、非 blocking、计数和 blocking 集合一致时才接受 `ready_to_launch`。
- 不让 Core readiness、full readiness、初始化读取或后台维护阻塞用户显式进入 `/guid`；未就绪能力可以在主界面中保持不可用或提示继续设置。
- 不恢复 `/startup-gate` 等待页、以 1,500 ms timeout 后才导航，或在 renderer root 中无界等待 managed-agent/config prefetch。
- 不增加新的 runtime、provider 或配置真相源。
- 不维护 Standard/Full 两份 Package 清单，不把 Official Profile 变成持续
  desired-state controller，不在用户卸载后静默恢复。
- 不在首启实现 Package resolver、版本兼容器、lock、payload、receipt、
  materialization、rollback 或跨 Package transaction。
- 不修改 AionUI 通用 Layout/Sider fork body；专注模式由 OPL FirstRun overlay 实现。
- 不引入新 UI 依赖、插画、渐变、玻璃效果或营销式首屏。

## 验收

完成需要同时具备：

- App 合同和 page-state matrix 校验通过。
- first-run test matrix 覆盖专注模式、三步栏、无百分比、Desktop/WebUI 账户默认、API Key 兼容、系统默认 Codex 重检与 WebUI runtime proxy 边界。
- Package 首启路径还必须覆盖：Standard/Full 同一 Official Profile、所有 roots
  自动安装、MAS required capability 自动补齐、单 root 失败局部化、Codex Core
  可用后进入 App、用户卸载跨重启/日更保持、显式 Restore 恢复。
- active shell DOM 测试覆盖 initialize pending、Gateway 账户登录、唯一分组完成设置、模型访问绑定、共享首页缓存刷新、API Key 配置、已有 Codex 重检、密码生命周期、WebUI 边界、完成态、技术详情，以及未就绪/后台请求期间始终可用的纯导航入口。
- i18n、TypeScript 与 package build 通过。
- 桌面、常规窄屏与 400×600 最小窗口截图证明普通导航不存在、文本无溢出、主操作清晰、状态切换不造成结构跳动。
