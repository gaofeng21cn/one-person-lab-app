# OPL Computer Use

Owner: `one-person-lab-app` for product policy and user experience; `opl-studio`
(`opl-codex-native`) for DeepSeek Harness native Computer Use integration, dynamic Codex
injection, macOS TCC checks, and settings bridge.
State: `active_ssot`.

## 结论

OPL App 默认通过 OPL Studio 随包携带的 DeepSeek Harness 原生 Computer Use
（`@deepseek-ai/dsh-cua-mcp` + `@deepseek-ai/dsh-cua-macos`）提供 macOS Desktop
Computer Use，provider 为 `dsh-cua`。OPL 不再打包、下载或注册第三方 KimiCU
独立应用，不依赖 ChatGPT App，也不自行维护屏幕识别、窗口截图或 Accessibility 输入注入内核。

Standard 与 Full 安装包包含完全一致的 Studio 应用内建原生 helper 与 CUA MCP 包，不需要单独的
Full 离线归档 seed 或额外解析源。

## 固定身份与运行时形态

| 字段 | SSOT |
| --- | --- |
| Provider | `dsh-cua` |
| Owner / Adapter | `opl-studio` (`plugins/core/opl-codex-native/src/computer-use.mjs`) |
| MCP 包 / Native Helper | `@deepseek-ai/dsh-cua-mcp` + `@deepseek-ai/dsh-cua-macos` |
| MCP Server ID | `dsh_cua` |
| 平台与架构 | macOS（arm64；预签/公证包中 `dsh-cua-macos/native/bin` 通过 `mac.signIgnore` 保留上游签名） |
| 可用工具 | `cua_get_api_reference`、`cua_run_code`、`cua_reset` |
| Codex 注入方式 | 启动 Codex App Server 时通过 `-c mcp_servers.dsh_cua.*` 动态注入（`required=false`） |
| 全局配置修改 | 禁止修改 `~/.codex/config.toml` |

## 运行时拓扑与同意模式（`elicit` vs `allow`）

```text
OPL App / Settings UI (Capabilities -> Computer Use)
  -> oplBridge.readComputerUse / setComputerUse / performComputerUseAction
  -> opl-codex-native (reads/writes opl-computer-use.json + prepares cua-mcp DSH profile)
  -> Codex App Server launch (-c mcp_servers.dsh_cua.*, required=false)
      -> dsh --profile cua-mcp (@deepseek-ai/dsh-cua-mcp)
          -> dsh-cua-native Unix socket (Accessibility & Screen Recording TCC)
```

- **默认启用且不阻塞**：macOS 默认 `enabled=true`，并在注入 Codex 时设置
  `mcp_servers.dsh_cua.required=false`。即使系统 TCC 权限尚未授予或非 macOS 环境不可用，
  也不影响普通 OPL 与 plain Codex 对话。
- **默认同意模式 `elicit`**：默认启动时 `DSH_CUA_CONSENT` 使用按应用弹窗确认（`elicit`），
  每次对目标应用操作前通过 Codex MCP elicitation（由 `CodexServerRequestPanel.tsx` 呈现）
  征求授权，授权记录可随 `@deepseek-ai/dsh-storage-json` 持久化并在设置页撤销或重试。
- **可选无人值守 `allow` 模式**：设置页提供明确选项，允许用户将授权模式切换为无人值守 `allow`（附风险提示）。
  切到 `allow` 后，`opl-codex-native` 动态注入 `DSH_CUA_CONSENT=allow` 与
  `mcp_servers.dsh_cua.tools.cua_run_code.approval_mode="approve"`，修改开关或模式后可通过重新加载或重启
  Codex App Server 生效；若当时正在执行 turn，则置位 `restartPending=true`。

## TCC 权限控制

macOS Accessibility 和 Screen Recording 属于系统 TCC，不能伪造或绕过：

- 设置页通过 native Unix socket（`permissionStatus`、`requestPermission`、`openPermissionSettings`）
  真实读取、触发授权请求或跳转系统设置。
- 缺失权限时，`Capabilities` 显示明确权限引导与系统设置入口，同时普通 Codex 对话保持可用。

## 浏览器策略

Playwright MCP 仍是结构化、可重复浏览器自动化的默认 provider，产品 id 为
`playwright-mcp`，Codex MCP registry 中的 server id 为 `playwright`。上游实现由
`microsoft/playwright-mcp` 持有，`one-person-lab`（Framework）继续作为其唯一安装、
`registerOplManagedMcpServer` 写入与健康状态 owner。App 只定义默认角色与 Standard/Full parity；
Shell 只消费 Codex 已配置的 MCP entry，不得直接写入 registry。

Standard 与 Full 使用同一个 provider id、server id、registry writer、默认启用状态、
结构化行为、system Chrome 要求和 Codex session authority。`dsh-cua` 只负责视觉桌面操作，
或在结构化路径无法表达任务时作为桌面视觉兜底，不得替代 Playwright MCP 的默认浏览器角色。

## 机器合同与验证入口

- 产品策略：`contracts/app-gui-product-contract.json#computer_use_policy`
- 产品配置：`contracts/app-product-profile.json#computer_use`
- 分发 parity：`contracts/app-release-channel.json#computer_use_distribution`
- 控制面设置：`contracts/app-settings-control-plane.json#managed_computer_use`
- 页面状态矩阵：`contracts/app-page-state-matrix.json#computer_use_state_model`
- 首次安装矩阵：`contracts/app-first-run-test-matrix.json#computer_use_qualification`
- 契约单测：`node --experimental-strip-types --test tests/release/computer-use-distribution-contract.test.ts`
