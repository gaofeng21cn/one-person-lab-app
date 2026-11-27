# Team、Bot 与 Superagent

Owner: `one-person-lab-app`
State: `source_implemented_and_verified`

Team、Subagent 和角色预设直接使用固定版本 DSH 的完整官方 Web 工作台。OPL 插件只提供工作台入口与 Codex 执行适配；会话、模型菜单、确认弹窗、成员导航、任务详情和角色配置均由官方客户端管理。普通 OPL 对话继续使用现有 Codex 界面。

在 OPL 侧栏打开「智能体协作」，工作台按需启动。原版用法如下：

1. 在工作台中新建或打开根会话，在模型／推理菜单开启「启用智能体协作」。新会话默认关闭。
2. 向协调者描述分工，由模型通过官方工具创建具名成员、发送消息和创建、认领或完成共享任务。
3. 点击会话页头的 Subagent 控件，查看成员树及下方的共享任务板；点击成员进入其会话，也可在右侧打开成员聊天。通过普通输入框续作，使用 Stop 停止。任务板只读，修改由模型工具完成。
4. 关闭协作沿用官方确认流程：已有模型请求时需确认；取消不变；关闭保留成员和任务。子会话不显示根会话的开关和任务板。
5. 可复用角色使用官方 Settings 中的 Agent Presets。查看配置沿用官方 YAML 视图，创建和修改沿用 Creator。固定版本没有单独的 Bot 模板管理页。

DSH 固定 `dsh-v0.2.3-alpha.2`，提交 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。协作工作台直接装配官方 `dsh-base` 与 `dsh-web-app`，不复制或改写官方 UI；主 OPL profile 不加载 base。原版 CLI 独立进程通过父 Host 的私有 IPC 复用同一个持久 Codex App Server，官方 DSH 持有逻辑会话、成员和任务，Codex 持有执行线程。执行适配将官方本轮工具目录、模型、推理和权限投影交给 Codex；不创建第二个 Codex 客户端。工作台的 Settings、热更新和退出均由原版 CLI 管理，OPL 停止工作台时中断其确切的活动轮次。Codex 内置命令的细节与 Token 用量仍以原 Codex 线程为准；当前适配展示最终回复与官方 DSH 工具卡片，尚未投影完整的 Codex 原生事件流。

旧版自制 Bot 模板、创建 Team、手工添加成员页面及其写接口已撤下。原 `$DSH_HOME/opl/sessions` 和 Codex 执行绑定继续使用；旧 `bots.json` 原文件保留供迁移参考，不再作为新角色的配置入口。

Superagent 使用独立的完整原型工作台，固定 `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。Source、Policy、Ticket、Assignment、Report、设置及恢复流程保持原样，与 Team 无依赖。OPL 管理独立 profile 的启停，并通过现有 `opl-codex-agents` 适配器复用 App 唯一持久 Codex App Server；模型列表来自 App 的 Codex 模型目录，无需另配模型供应商账号。工单 Session 与 Codex 线程的绑定保存在 Superagent 自己的 profile 中；数据位于 `$DSH_HOME/opl-superagent`，停止保留配置和工单。在 Superagent 入口启动后，点击「打开工作台」，由顶层页面交换官方启动凭据并进入工单概览。DSH 的 `SameSite=Strict` 登录 cookie 在桌面 `file:` 页的 iframe 中无法完成认证；App 保留官方 cookie 与来源校验，使用浏览器顶层页面。沿用原型 setup 配置专用仓库账号、Source、Policy 和执行目录；模型使用 App 的 Codex 模型；未配置时不接单。独立模型供应商引导在该 Codex profile 中关闭。上游的专用账号执行环境逐线程传入 Codex，普通 App 对话的环境不变。

两种工作台都监听 Studio 所在机器的回环地址，本机从 App 入口启动；远程 WebUI 使用者需在该机器打开或显式转发工作台端口。源码验证、真实模型执行、安装、发布和外部接单分别验收；既有真实 Codex 续作和任务修订证据不替代本次官方界面交互验证。Superagent 尚未做 GitHub／飞书真实接单的业务验收。

本次验证覆盖原版 Team 开关及停用确认、成员树、右侧成员聊天和任务详情。真实 Codex 创建、认领并完成共享任务；重启工作台后，同一 reviewer 沿用原 Codex 线程，通过官方工具回读同一项任务。取消、未知派发不重发、父进程通道断开后的退出与恢复已由集成测试覆盖。App 门禁、WebUI 构建及 DSH 来源校验通过；安装和产品发布另行执行。

## 与 OPL Flow 总控的三层心智边界与防混淆规则

随着 OPL Flow 引入面向个人多载体（Codex / AntiGravity / OPL DSH）的统一零 Token 事件路由与控制塔规划（详见 [`opl-flow-workbench-plugin-plan.md`](https://github.com/gaofeng21cn/opl-flow/blob/main/docs/opl-flow-workbench-plugin-plan.md)），OPL App 侧栏「更多」菜单中可能同时存在三个与“多智能体/自动化编排”相关的可选工作面。三者解决完全不同的问题，必须保持清晰命名、条件显隐与零状态重叠：

| 侧栏「更多」/ 入口展示名称 | 实现来源 | 服务对象与核心模型 | 默认暴露策略与边界 |
| :--- | :--- | :--- | :--- |
| **运行状态**（主侧栏） | `opl-runtime-status` | **本机 Framework `Runway`** 的领域阶段任务与服务恢复状态 | 主侧栏固定入口；只看本机受管领域工作项，不接管个人跨工具总账 |
| **智能体协作**（侧栏「更多」） | `opl-team-bots`（官方 DSH Team 工作台） | **单次会话内**的多角色组队分工：`Lead → Teammates + 会话共享任务板` | 默认收于「更多」；普通 OPL 对话不受影响，关闭协作后保留成员与任务历史 |
| **OPL Flow 总控**（侧栏「更多」） | `opl-flow` Package + `@gaofeng21cn/opl-flow-workbench`（Tier 2） | **个人跨载体、跨机器**长期目标总账、防撞车与自动路由：`Objective (Bead) → Slice/Attempt → Owner 验收` | 默认收于「更多」；**仅当用户已安装并启用 `opl-flow` Package 时显示**；只做控制塔/决策看板，按只读 `jump_mode` 切换或新建原生会话，绝不自建第二套聊天框 |
| **Superagent 工单台**（侧栏「更多」） | `opl-superagent`（独立 DSH 原型 profile） | **外部来源来单**（GitHub / 飞书）无人值守自动接单值班：`Source → Policy → Ticket → Assignment` | 默认收于「更多」；默认停机、按需启停，未配置来源与授权策略时不接单 |

防混淆硬性约束：
1. **禁止裸露易混淆英文简称**：面向用户界面一律使用带场景定语的中文名称（「运行状态」「智能体协作」「OPL Flow 总控」「Superagent 工单台」），并在各工作面空态或页头用一句话说明适用场景与相邻入口；同时对跨载体会话严格遵循只读 `jump_mode`（`native_switch | launch_new | external_focus_only`），不渲染无反应的假切换按钮。
2. **数据真相彻底正交**：`运行状态` 归本机 `opld` `Runway`；`智能体协作` 数据归 `$DSH_HOME/opl-collaboration` 与 Codex 线程；`Superagent 工单台` 数据归 `$DSH_HOME/opl-superagent`；`OPL Flow 总控` 数据归用户绑定的 Beads/Dolt Ledger，四者不得互相复制或同步第二份状态库。
