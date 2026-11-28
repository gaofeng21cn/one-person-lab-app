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
- ordinary launch 不渲染等待 fast state 的 `StartupGate`。本机 `opld` `app.state.get`（`fast`；v1 CLI: `opl app state --profile fast --json`）、
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

非零退出时保留逐 Package 失败摘要供首启页面和验收读取：只包含有界、脱敏的 Package identity、失败状态和错误消息，不返回 action readback 或原始正文。Framework stdout 或 stderr JSON 的 `error.code` / `error.message` 优先于原始输出；失败仍为 `ok=false`，不写首次安装完成标记，后续可重试。后台首次安装失败向既有 App 日志写入脱敏结构化终态，绑定 App PID 与时间。clean-VM 验收只消费本次启动的失败事件并立即结束该验收，不重试安装、不改变 roots，也不以日志代替 configured carrier 的成功回读；旧启动和显式恢复事件不得中止本次验收。

当前 App source 路径：

- App 只有一个 `OPL Official Profile`，列出首次安装需要的官方 root Packages。
  Med Auto Cast (`med-autocast`) 是标准集成；Framework 按 MAC manifest 安装必需的
  `mac-media-assets`，并通过 installed descriptor 提供能力和素材库路径。
  Standard 在线安装，Full 优先使用离线 seed；两者读取同一 Profile 和同一 source
  helper，Full 不增加第二 root 清单。`mac-media-assets` 的轻量 catalog 随 Full 离线种子预置，Standard 随 MAC 的 required 依赖自动安装；完整媒体由用户在软件中心按需安装。MAC 开始或恢复制作时通过 `prepare` 再检查和补齐必需目录，库缺失只影响对应制作功能。
- 首次安装通过 generic Package directory/status/action projection 逐 root 收敛，并按
  Package 声明补齐 required identity。
  例如 MAS 需要 `capability:mas-scholar-skills`，但 ScholarSkills 不必重复列为
  Official root。
- Framework v2 提供 `opl pack ensure <package-id>`。Framework 从官方软件目录或 Full
  离线种子补齐缺失的 Package，恢复已停用的必要项，并回读依赖声明的能力。
  显式恢复的预览使用 `--dry-run`。仅支持 `pack inspect` 的早期 v2 仍可回读已有组合。
- Package 依赖只检查 presence 和 callability，不以 version、ABI、lock、payload、
  digest、receipt 或 Release Set 作为首启门禁。
- 每个 root 独立显示 `waiting / installing / ready / attention`。一个 root 或依赖失败
  只让该 Agent 不可用；普通 Codex、App、Base 与其他 Package 继续。
- Codex Core 可用后用户仍可进入 `/guid`；Official Profile 安装继续后台执行并在
  软件中心（`/apps`）显示。自动安装不能变成新的全屏等待门。
- Profile 只在 first install 或用户显式选择“恢复官方组合”时执行。用户后来卸载
  官方 Package 后，首启检查、普通启动、日更和 App update 都不得重新安装它。
- 旧版 Framework 通过 `opl app state --profile fast --json` 提供 directory entry 与
  action ref。两代接口均由 Framework 选择相应载体并执行具体安装。
- 首次安装完成状态必须来自 configured carrier 的 installed/callable fresh
  aggregation，不能来自 OPL lock、payload、receipt 或下载成功。该 installed
  outcome 仍需对应 carrier 的安装用户路径验收。

## 首次安装的说明与进度

Standard 和 Full 是同一产品的两种安装来源。Standard 首启联网补齐运行环境（必要时包括托管 Node）、Codex CLI、后台任务服务、本机操作助手，以及同一 Official Profile 的智能体与必需依赖。Full 使用包内离线种子完成这些本机准备。准备完成后两者使用相同的智能体和能力；不要求物理缓存、安装目录或安装当天独立更新的版本号逐字节相同。

首次准备面先说明正在做什么，再展示实际执行阶段和已用时间；本机环境阶段、智能体后台准备和模型访问分别说明。Framework 返回下载字节、总量和速度时显示真实传输进度；没有总量时只显示阶段，不估造整体百分比或剩余时间。Official Profile 按同一 roots 提供等待、安装、就绪和需要处理状态，成功仍须安装后的权威状态回读。

Core 就绪后可进入 App；官方智能体继续在后台准备，并提供软件中心进度入口。读取进度失败显示“进度待确认”，不得推断停止或自动重发安装。失败提供检查或重试入口，已成功的内容由原安装器校验复用。用户卸载后的启动不重新应用 Profile。

MAC 轻量素材目录随 MAC 自动安装；完整大素材、额外模型和用户自选资源不属于默认下载。两版的 Gateway 登录、云端模型调用和需要联网的研究任务仍需要网络；Full 的离线保证覆盖本机安装与启动。

Full 的本机首次安装独立于自动更新偏好；待激活更新失败后仍通过 Framework 安装包内已校验的 Codex 种子。启动不能等待 Gateway 登录、模型请求或上游版本查询。runtime 安装失败保留实际阶段和安装来源，不降级成隐藏的联网安装；重试失败应在原入口可见。

离线验收使用空用户目录、拒绝外部网络和无 Gateway 凭据的实际 App，检查窗口可进入以及真实 Codex App Server 的 initialize 和 thread/list。只有对应最终产物通过该检查后，才可将其称为已验证的离线 Full；源码测试或种子存在不能替代产物验收。

## 桌面布局

- Studio 直接复用固定 DSH cohort 官方 `OnboardingModal`（`ui-settings-models` npm 包），由它负责 body portal、居中容器、遮罩、滚动、响应式尺寸、`inert` 与焦点生命周期；OPL 仅提供工作目录、本机助手、模型访问和真实安装进度。
- 状态和操作直接使用官方 `DisclosureRow`、`StateDot`、`Tag` 与 `Button`；不保留平行的首启容器、控件样式或焦点管理。官方容器已经覆盖所需行为时不再自行实现。
- 本机准备和智能体进度是实际正文，展示期间使用 DSH 现有 active 会话布局；不把长进度区塞进空会话的居中 hero。该适配仅影响展示，不创建或修改 Codex 会话。首启窄屏尺寸与滚动由官方容器负责，删除旧自绘首启的响应式 padding。
- 安装器运行期间显示当前真实阶段、来源和已用时间；“准备哪些内容”按需展开。没有总字节数的本机环境准备不显示整体百分比。
- 本机准备按工作目录、本机助手、模型访问的固定顺序显示状态。Professional Packages 归本机能力的后台准备，不增加独立安装向导。
- 保留“进入 OPL”，交由 DSH Settings 的 onboarding coordinator 结束当前展示；该动作不取消后台安装，也不修改 readiness。其后以会话内状态和软件中心入口继续呈现进度。
- 普通 App 根节点在官方首启容器打开时由 DSH 设置 `inert`；键盘焦点和 Tab 由同一官方 modal layer 管理。首启层不放进侧栏内容区，也不同时呈现两份进度。
- macOS 交通灯与标题栏安全区、窄屏侧栏 drawer 继续由 DSH AppFrame/SidebarRoot 和载体处理。OPL 不另写响应式侧栏或首启遮罩。
- 400×600 最小检查视口中，官方容器保持可滚动，当前动作和“进入 OPL”可访问，无横向溢出。正文、状态、展开行和按钮沿用 DSH 字体与主题。

## 模型访问

模型访问是唯一需要用户输入的常见首启步骤。Desktop 与 WebUI 都提供两条真实路径，并默认选择账户登录：

- `OPL Gateway 账户`：输入邮箱和密码。Desktop 通过 typed IPC，WebUI 通过既有 `/api/opl-runtime/*`
  HTTP proxy，二者经受信任的 Host 调用 Framework 的 `connect.gateway.login`。首启使用 Framework 默认设备名称。
- `API Key`：保留现有 `configureCodex` stdin bridge，作为兼容方式。

账户登录和 API Key 使用分段控件切换。`已有 Codex 配置` 不再占用分段控件，而是在其外提供独立次要重检入口。
当前路径只能有一个主操作；配置或重检请求进行中时，禁用路径切换和另一条动作，直到当前请求结束。

Desktop 不注入 App 私有 `CODEX_HOME`。进程已有显式 `CODEX_HOME` 时原样保留，否则让 Codex 和 Framework 使用系统默认
`~/.codex`。启动检测和“已有 Codex 配置”重检均为只读；只有用户显式选择 Gateway 或 API Key 后，才允许 Framework
通过带备份与恢复能力的原子合并修改相关配置字段。

账户登录成功后必须通过 `opld` `app.state.get` (`fast`；v1 CLI: `opl app state --profile fast --json`) 读取最新投影。Framework 在 `resolved_group_id` 返回名称含 Codex 的唯一分组（忽略大小写），或仅有的可用分组。
缺少 managed key 且投影提供设置动作时，App 使用该 ID 执行 `gateway_account_complete_setup`。字段为 `null` 或缺失时，App 显示本地化的分组提示，保留当前设置。完成设置后必须
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
- 所有交互使用官方 DSH 原语组件，保留键盘焦点与可见字段标签；可访问名称使用本地化可见文本或 `aria-labelledby`，不得使用 testid。
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
- 不修改上游 DSH 通用 Layout/Sidebar/Modal body；产品内容通过官方组件和 slots 接入。
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
