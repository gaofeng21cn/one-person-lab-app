# OPL App 分发与安装 SSOT

## 产品边界

OPL App 对用户发布的产品只有 **Desktop**。浏览器访问不是第二个 App 产品：
macOS 与 Linux Desktop 可在无图形会话中运行，并通过 Desktop 自带的 WebUI 提供同一工作台。

`--headless` 只安装 Framework Base/CLI，不安装 App，因此不属于 Desktop 发布产品。
Docker WebUI 保留为独立容器产品线，使用 GHCR 自己的版本、资格与移动标签；它不是
Desktop GitHub Release 的附加资产。Stable 自动以同一 App/Framework cohort 和日期版本
发布 Docker；它独立验收与恢复，不阻塞 macOS 主发布。完整入口见
[发布路径与矩阵](release/release-paths.md)。

## 名称、帮助与运行环境

正式界面统一使用 One Person Lab App；发布渠道单独显示，不把“预览版”写入固定产品名称。
帮助和反馈指向 App 的公开教程与问题入口。安装教程的文字、按钮路径和截图必须对应当前
Studio 界面，历史 AionUI 截图只保留在历史记录中。恢复提示说明受影响功能、保留状态和
用户可执行的下一步，不要求普通用户操作内部更新源。

Codex CLI 以官方 npm `latest` 的稳定版本为升级来源。每次升级同时更新 App 验收清单中的
精确版本与摘要、Windows/WSL 引导投影和 Docker 默认值；发布构建读取冻结清单，不能在
恢复时追逐移动标签。桌面端仍由 Framework 管理安装与更新，并尊重用户显式设置的路径。

## Codex 插件安装范围

安装器按 Package owner descriptor 区分交互式入口和内部能力。只有直接供用户使用的
交互式入口安装到用户的系统 Codex；`headless_internal` Package 使用 Framework state
下的 `internal-package-carrier`，由同一个原生插件管理器负责生命周期，Framework 聚合
实际安装状态。App 不另建插件清单，也不复制认证、Profile 或会话。

Scholar Skills 是 MAS/MAG 按任务消费的能力包；微信通道、Fleet Agent 和 Link Connector
是内部模块。它们应保留 OPL 能力，而不出现在系统 Codex 的已安装插件列表中。

升级后的 App 通过既有启动维护入口迁移旧安装：核验并复用已安装文件，验证内部安装和
Framework descriptor 可读取，再原生卸载系统 Codex 的旧条目。历史下载地址不可用不妨碍
同版本迁移；文件冲突或内部安装失败时保留原安装。后续启动没有旧条目时不重复写入。

## GUI 演进与升级路线

机器真值位于
`contracts/app-release-channel.json#shell_transition_policy`。当前正式 Desktop、Nightly 和
Docker WebUI 均使用 Studio。正式 App 保留既有安装身份与 Stable feed；旧 Aion Shell
已归档，仅保留迁移基线、历史发布与固定测试夹具。

| 身份 | Bundle ID / 安装路径 | 更新 authority | 当前用途 |
| --- | --- | --- | --- |
| 历史 OPL App（AionUI） | `cn.onepersonlab.opl` / `/Applications/One Person Lab.app` | App Stable feed | 自动升级到 Studio 实现 |
| 历史 OPL Studio Preview | `cn.onepersonlab.opl.studio.preview` / `/Applications/One Person Lab Preview.app` | Studio Preview feed | terminal handoff 转入正式 App |
| 正式 OPL App（Studio） | `cn.onepersonlab.opl` / `/Applications/One Person Lab.app` | App Stable feed | 唯一正式 Desktop 身份 |

因此有两条不同但最终汇合的升级路线：

1. **AionUI 主线用户原地自动升级。** 第一版 Studio 内核的正式 App 必须继续使用现有
   Bundle ID、安装路径、Stable repository、updater metadata 命名和严格递增版本。更新后
   第一次启动先执行幂等数据迁移，再进入正常 renderer。实现必须直接支持 cutover manifest
   声明的全部仍受支持 AionUI 版本，不能把用户曾经安装某个中间桥接版本作为正确性前提。
2. **Studio Preview 用户自动 handoff。** 不同 Bundle ID 和 feed 不能冒充原地更新。
   最后一个 Preview 更新只能下载并校验 exact version、URL、SHA-256、Developer ID、
   notarization 和 Gatekeeper 均通过的正式 App，导出 Preview 的允许迁移状态，退出后安装或
   激活正式 App，由正式 App 完成导入并回写 receipt。Preview feed 永远不变成 Stable feed；
   正式 App 成功启动、迁移和 owner readback 前不得删除 Preview 或源数据。

状态分两类处理：

- Codex 对话、Gateway 凭据/账户、Framework Package/runtime/receipt、Workspace source 与
  domain artifact 继续从原 owner 读取。同一 `CODEX_HOME` 下直接读取
  Codex App Server 的同一批线程和消息，不创建副本或自动导入其他后端会话。旧 OPL 数据
  只提供可确认原生线程的置顶、排序和偏好；不扫描独立 AionUI/AionUi 数据目录。
- 只有 Shell 私有且不可重建的配置需要版本化迁移：语言、主题与无障碍偏好，非敏感的
  模型/推理/权限偏好，工作区选择与标签，canonical thread keyed UI metadata，未发送草稿，
  通知与日志位置。迁移清单不得包含密码、API key、token、cookie、Keychain material、
  AionCore/AionUI backend database、Codex 消息正文、Framework 状态或 Electron cache。

新候选先完成签名、公证与准确字节首装验收，再公开 Standard；随后验收真实升级链路，
必要时在同一可变 tag 修复资产并递增机器版本。迁移问题须修实现，不能仅扩大测试等待。
两条用户来源的升级与数据延续都要完成验证，但不把全部历史迁移测试设为每次普通发布的
重复前置条件。涉及升级身份、数据迁移或运行时协议的改动覆盖相应路线。源数据或 Preview
清理必须在正式 App 成功启动与 owner 回读后进行，固定 handoff 依赖的资产继续保留。

## Stable Desktop artifact

每个 Stable 版本只有一个 GitHub Release 和一个 `v<version>` tag：

| 成员 | 角色 | 发布位置 |
| --- | --- | --- |
| macOS arm64 Desktop Standard | 主发布、Latest 激活门槛 | 同一 Stable Release/tag |
| macOS arm64 Desktop Full | 可追加的离线密度 | 同一 Stable Release/tag |
| Linux x64 Desktop | 同版本 Desktop 成员 | 同一 Stable Release/tag |
| Windows x64 Desktop | 同版本 Desktop 成员 | 同一 Stable Release/tag |

Linux、Windows 和 Full 不创建 optional、adjunct 或独立 Release/tag。追加操作必须对
同名资产执行 digest CAS：缺失则上传，同名同 digest 视为幂等，同名不同 digest 失败关闭。

## Computer Use 分发一致性

macOS arm64 Standard 与 Full 都默认安装、注册并启用 KimiCU。Standard 在首次
managed installation 中下载并校验固定归档；Full 把完全相同的归档作为离线 seed
放入安装包。因此 Full 的差异只有约 `1.43 MiB` 的压缩 seed 和离线可用性，不是
另一个 Computer Use 产品或运行路径。

两种载体完成安装后必须具有相同的 KimiCU `0.5.4`、归档 SHA-256、Bundle ID、
Team ID、`/Applications/KimiCU.app` 路径、MCP command/args、默认 enablement、
工具集与 TCC 状态模型。Standard 网络故障只降级 Computer Use 并提供重试，不阻塞
普通 OPL/Codex；Full 的 clean VM 必须证明不联网也能 materialize。权限提示可由用户
完成，但未授权时只能记录 `permission_required + ready=false`。

机器真值在 `contracts/app-release-channel.json#computer_use_distribution` 和
`contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu`；
人读设计与落地计划见 [`../product/gui/computer-use.md`](../product/gui/computer-use.md)。
这些追加不得改写主 macOS 资产、release body、updater identity 或 Latest。

不再发布独立 Native WebUI tarball、WebUI qualification tarball、`install-web.sh`，也不再
运行 WebUI follower、Native WebUI follower 或 optional existing-base publisher。

## 安装入口

公开分发 authority 是 exact GitHub Release 中、经名称/URL/大小/SHA-256 校验的
`opl-install.sh`。仓库 `install.sh` 只服务已审阅 source checkout 的开发与恢复，不得在
公开教程中替代 Release installer，也不得把 `main` 或未验证的 Latest 字节作为 fallback。
Docker/WebUI 子安装器可保存 exact Release 身份缓存：元数据/网络中断时重算缓存大小和
SHA-256 后继续；明确 mismatch 只拒绝新字节并保留既有缓存/安装。可选 attestation 不属于
这条必需获取链。

### macOS

Homebrew 用户安装 Desktop Standard：

```bash
brew install --cask gaofeng21cn/one-person-lab/one-person-lab
open -a "One Person Lab"
```

直接安装使用 exact Stable tag 中的 DMG，或同 tag 的 `opl-install.sh`。Full 只从该
Release 的 `opl-release-manifest.json` 解析；缺失、重复或 digest 不一致均失败关闭。

### Linux

Linux 使用 exact Stable tag 中的 `.deb`、`opl-install.sh`、
`opl-app-component-manifest.json` 与 `opl-desktop-platforms-manifest.json`。安装器必须证明
这些文件来自同一个 Release/tag，再校验 digest 并安装。Desktop 可在 headless host 上
启动内置 WebUI，用户通过浏览器访问该 Desktop 实例。

### Windows

Windows x64 installer、blockmap、`latest.yml` 与 updater receipt 均属于同一个 Stable
Release/tag。旧独立 Windows Preview/RC 发布入口已退役；当前通过同 tag 附加发布
交付 Windows。未签名状态与真实旧版升级是否通过认证须分别披露。

## 质量与指针

Stable/Preview 是质量；Manual/Automated 是触发方式；Latest 是可移动指针，三者互不替代。
Desktop GitHub Latest 只由合格的 macOS arm64 主发布激活。Full、Linux、Windows 的同 tag
追加不移动 Latest。

Docker WebUI 使用独立的 `independent_stable` 与 `independent_preview` authority：

- Stable 自动发布与主 Desktop 相同 cohort/日期版本的不可变镜像，随后以一次 CAS 同时
  移动 `:stable` 与 `:latest`；手动 Stable 修复仍使用同版本并接续 promotion；
- Preview 发布不可变版本，并在显式确认后只移动 `:latest`，保持 `:stable` 不变；
- 两者都绑定 WebUI source authority，promotion 消费 durable GHCR publication record。
  自动路径从 Stable 冻结 cohort 生成该 authority；仅有 Desktop run ID 或短期 artifact
  不能替代它。手动恢复可复用已合格镜像，但须核验其准确源码和资格来源。

## 真实完成

合同、测试、candidate、task branch 或单次 API 写入都不等于发布完成。终态至少需要：

1. canonical `main` 的 commit/tree/blob 回读；
2. 本地与 hosted 非发布门禁通过；
3. GitHub Release 的 exact asset name/size/SHA-256、Latest、draft/prerelease 状态回读；
4. 临时 Release/tag 的 exact absence；
5. 安装或公开下载的实际字节校验；
6. task-owned 临时目录、ref、worktree 与 lifecycle receipt 清理，`remaining=[]`。
