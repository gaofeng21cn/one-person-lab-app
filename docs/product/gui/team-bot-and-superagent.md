# Team、Bot 与 Superagent

Owner: `one-person-lab-app`
State: `source_implemented_and_verified`

Team 与 Bot 使用官方 DSH Agent、Subagent、持久 Session 和 Team 任务板。OPL 标准插件提供 Bot 配置与持久 Codex 执行适配，官方插件源码保持不变。普通 Codex 对话继续使用原有线程；团队逻辑会话由 DSH 持有，关联的 Codex 线程持有真实执行记录。两者通过稳定引用关联，不复制成员或任务状态。

Bot 是可复用配置，包含角色、Skills、模型、权限和工作区；加入 Team 后成为独立具名成员。上下文属于成员实例，不因复用同一 Bot 配置而跨团队共享。

Superagent 独立使用原型中的 Source、Policy、Ticket、Assignment、Report 与恢复流程。其开关、配置和任务不依赖 Team；没有明确的仓库、账号与授权策略时保持未配置。真实外部消息和仓库操作需要具体配置，不以测试回执声明已接单。

验收覆盖成员持续消息、原线程续作、任务修订与认领、取消及重启恢复。源码验证、真实模型执行、安装与发布分别记录。

DSH 固定官方 `dsh-v0.2.2-rc.3`，提交 `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`。主 profile 的 Team 服务使用独立工具 registry，普通 Codex 对话不会被暴露 Team 专用工具。桌面和 WebUI 都由同一标准客户端插件注册侧栏与 main slots。

Superagent 固定原型 `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。OPL 只增加构建 wrapper 与独立 profile 的启停，不修改原型源码。数据保存在 `$DSH_HOME/opl-superagent`；停止保留配置与工单。工作台监听运行 Studio 的机器的回环地址，本机可在 App 中打开，远程 WebUI 需操作者转发端口。首次启动展示原型的 setup，引导配置独立模型、专用账号、仓库、Source 与 Policy；未经配置不会接单。

用法：保存 Bot 模板，选择模板创建 Team，再把其他模板加入团队。向协调者分派任务，可要求它创建共享任务、调用官方 subagent 工具委派、发消息和认领或完成任务。选择同一成员可继续讨论；复用模板创建的新成员拥有独立上下文。Superagent 从独立入口启动，按授权策略将外部请求转成 Ticket，每次执行形成 Assignment；失败重试和重启恢复仍由原型管理。

2026-11-15 源码验收：App `validate:active-shell` 全部通过；Studio 官方插件打包加载、DSH GUI 来源校验及升级测试通过。浏览器使用真实 Codex App Server 完成创建 Bot、创建 Team、创建共享任务和模型委派；Host 重启后同一 reviewer 沿用原 Codex 线程，认领并完成原任务，官方任务修订从 1 变为 3。取消传播、未知派发不重复发送、冷成员历史读取和继承 Bot 权限由真实官方 DSH 服务的集成测试覆盖。

Superagent 的独立进程、原始 UI、未配置状态、启停及设置重启保留已验证。未配置外部专用账号，尚未做 GitHub/飞书真实接单、交付或恢复的业务验收。此次交付为已推送的源码分支；没有安装、产品发布或主线采用。
