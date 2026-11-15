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

DSH 固定 `dsh-v0.2.2-rc.3`，提交 `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`。协作工作台直接装配官方 `dsh-base` 与 `dsh-web-app`，不复制或改写官方 UI；主 OPL profile 不加载 base。原版 CLI 独立进程通过父 Host 的私有 IPC 复用同一个持久 Codex App Server，官方 DSH 持有逻辑会话、成员和任务，Codex 持有执行线程。执行适配将官方本轮工具目录、模型、推理和权限投影交给 Codex；不创建第二个 Codex 客户端。工作台的 Settings、热更新和退出均由原版 CLI 管理，OPL 停止工作台时中断其确切的活动轮次。Codex 内置命令的细节与 Token 用量仍以原 Codex 线程为准；当前适配展示最终回复与官方 DSH 工具卡片，尚未投影完整的 Codex 原生事件流。

旧版自制 Bot 模板、创建 Team、手工添加成员页面及其写接口已撤下。原 `$DSH_HOME/opl/sessions` 和 Codex 执行绑定继续使用；旧 `bots.json` 原文件保留供迁移参考，不再作为新角色的配置入口。

Superagent 使用独立的完整原型工作台，固定 `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。Source、Policy、Ticket、Assignment、Report、设置及恢复流程保持原样，与 Team 无依赖。OPL 只管理独立 profile 的启停；数据位于 `$DSH_HOME/opl-superagent`，停止保留配置和工单。在 Superagent 入口启动后，沿用原型 setup 配置独立模型、专用仓库账号、Source 和 Policy；未配置时不接单。

两种工作台都监听 Studio 所在机器的回环地址，本机可直接在 App 中使用；远程 WebUI 使用者需在该机器打开或显式转发工作台端口。源码验证、真实模型执行、安装、发布和外部接单分别验收；既有真实 Codex 续作和任务修订证据不替代本次官方界面交互验证。Superagent 尚未做 GitHub／飞书真实接单的业务验收。

本次验证覆盖原版 Team 开关及停用确认、成员树、右侧成员聊天和任务详情。真实 Codex 创建、认领并完成共享任务；重启工作台后，同一 reviewer 沿用原 Codex 线程，通过官方工具回读同一项任务。取消、未知派发不重发、父进程通道断开后的退出与恢复已由集成测试覆盖。App 门禁、WebUI 构建及 DSH 来源校验通过；安装和产品发布另行执行。
