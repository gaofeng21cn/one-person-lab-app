# DSH 与 OPL App 的 UI、字体对照

Owner：`one-person-lab-app`。核对日期：2026-11-13。
本页记录版本与实际差异；MiniApp 的持久视觉规则仍由
[OPL Apps 视觉契约](../../../../contracts/opl-apps-miniapp-visual-contract.json)持有。

## 结论与版本

用户确认直接对齐最新版 DSH，不保留 OPL 自创的视觉系统。本轮将 Studio 固定来源升级至
最新 `0.2.2-rc.2`，自有页面的字体和尺度改为官方 token／primitive 的消费别名，三个 MiniApp
复用同一份官方样式。此前观感差异来自 OPL 的独立字号、行高、控件密度与字体回退栈。

| 对象 | 核对结果 |
| --- | --- |
| DSH 最新 master | `e8f7b93a344964de3dca1ace9e72b6e4d6de87cb`，2026-11-11，合入 `dsh-0.2.2-rc.2-to-master` |
| DSH 最新 tag | `dsh-v0.2.2-rc.2` → `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c` |
| npm 发布通道 | `@deepseek-ai/dsh`：`latest=0.2.2-rc.1`，`next=0.2.2-rc.2` |
| OPL 升级后固定来源 | `e8f7b93a344964de3dca1ace9e72b6e4d6de87cb`，cohort `0.2.2-rc.2` |
| 本机 DSH | `0.2.2-rc.2`，带用户已有 OPL 增强层 `0.2.63`；不是纯官方无扩展实例 |

上游默认分支为 `master`；GitHub 常规 `/releases/latest` 无结果不代表没有新版。
本次按用户确认升级 App 的 DSH cohort；本机独立 DSH 的个人设置未修改。

## 修复前的具体差异

| 项目 | 最新 DSH | 修复前 OPL 实现 |
| --- | --- | --- |
| 正文字体 | 系统栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif` | 官方主题源相同；OPL 外壳消费 `--dsw-font-family` |
| 会话正文 | 14px / 24px | 正文字号可配置；自有工作页另有 13px / 1.5，MiniApp 宿主 14px / 1.55 |
| 常用界面文本 | 14px / 22px；侧栏行 14px / 20px | 官方侧栏直接复用；自有基础层行高为 1.25、1.45、1.6 |
| 辅助文本 | 13px / 20px、12px / 18px | 自有字号阶梯为 11、12、13、14、16、20、24px 等 |
| 标题 | 20px / 28px，字重 500；24px / 32px，字重 600；Markdown 另有层级 | 领域页自行定义，如 Relay 的 25/27px 标题、650 字重；邮件正文 15px / 1.9 |
| 按钮／输入框 | 标准按钮 36px，小按钮 28px，输入框 32px | 官方控件相同；OPL 自有控件 token 为 30/34px，MiniApp family 保留至少 40px 命中区 |
| 字体设置 | 正文、代码、终端三角色各自可设置字体和字号 | OPL 当前只持久化正文 `fontSize`，范围 12–17；三角色设置能力尚未完整接入 |
| 本机 DSH 偏好 | 跟随系统；正文 14、代码 11、终端 13；字体列表均为空，使用默认字体 | 只读核对本机设置；不能把个人配置差异误判为上游源码差异 |
| MiniApp 字体 | 标准 MCP Apps 可由宿主提供 | 原先 Studio 只传主题。修复后通过 `styles.variables` 传实际正文和代码字体，随宿主变化同步 |

上述私有字号、行高、圆角和控件尺度已被最新指令取代，不作为需要保留的领域差异。
正文、标题、状态文字使用官方 typography 角色；领域仅保留邮件列表、编辑器、媒体时间线等布局。

## 源码核对

从[最新上游精确提交](https://github.com/deepseek-ai/deepseek-harness/tree/e8f7b93a344964de3dca1ace9e72b6e4d6de87cb)
读取 UI 源文件，与修复前 Studio 固定的 `fcc0ad4`／`0.2.2-rc.1` 比较：

| 文件（均位于 `packages/client/`） | 对比结果 |
| --- | --- |
| `ui-theme/src/styles/base.css`、`gradient-shadow-text.css`、`ui-theme/src/theme-settings.ts` | 字节一致 |
| `ui-primitives/src/Button.module.css`、`Input.module.css` | 字节一致 |
| `ui-theme/src/styles/design-platform.css` | 新增语义颜色及 macOS 玻璃侧栏 token |
| `ui-layout/src/client/AppFrame.module.css` | 原侧栏 tint/wash 改为语义 token，相关原值基本保留 |
| `ui-workspace/src/client/rows/Rows.module.css` | hovercard 颜色改为 token，字号和行高未变 |
| `ui-sidebar/src/client/SidebarRoot.module.css` | 玻璃控件颜色改为 token，新增折叠侧栏 macOS 状态 |

OPL 自定义样式来源为 Studio `src/workbench/codexWorkbenchStyleFoundation.ts`、
`src/composition/workspace.css`；设置来源为 `settingsModel.ts`、`PreferencesSettingsPage.tsx`
与 `App.tsx`。三个自有 MiniApp 使用官方 SDK 接收宿主样式，Studio 在
`plugins/opl-mcp-apps/src/client/McpAppWorkspace.tsx` 的 AppBridge 初始化及更新时传递实际字体。

## 本轮修复与验证

App 的 `resources/miniapp-dsh/dsh-theme.css` 由固定官方源生成，包含原始 base、design-platform、
gradient-shadow-text、focus、scrollbar，以及 Button/Input 的 HTML 选择器适配。生成入口
`scripts/sync-miniapp-dsh-styles.mjs` 同步三个消费仓库，并支持 `--check` 校验字节一致。
原 CSS 声明值保持上游来源，MIT 许可随界面嵌入。Studio 的操作按钮和输入框直接使用
官方 React primitives；旧控件高度别名从官方 CSS 生成至 source manifest，避免再手填一套尺度。

宿主读取正文的 computed font-family，以及官方代码字体 `--ds-font-family-code`，通过标准
`hostContext.styles.variables` 传入 iframe。主题、根元素或 body 的字体样式变化时更新同一
context；不新增通信协议。颜色、字号、圆角与控件尺寸均以同一官方 DSH 来源为准。

验证使用真实 Studio 工作台、AppBridge、opaque iframe 和 Framework renderer，并以合成
只读数据检查初始字体、动态字体变更及主题切换。安装与窗口验收记录见
[MiniApp 验收](miniapp-management-acceptance-2026-11-13.md)。

新版会话附件入口也按官方 `createComposerFileIntake` 接入 SlotRegistry；移除旧的全局捕获
监听，避免设置窗口或其他编辑控件中的粘贴被会话抢走。附件暂存仍由 OPL Codex owner 负责。
