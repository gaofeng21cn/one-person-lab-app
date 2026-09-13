# OPL App 分发与安装 SSOT

## 产品边界

OPL App 对用户发布的产品只有 **Desktop**。浏览器访问不是第二个 App 产品：
macOS 与 Linux Desktop 可在无图形会话中运行，并通过 Desktop 自带的 WebUI 提供同一工作台。

`--headless` 只安装 Framework Base/CLI，不安装 App，因此不属于 Desktop 发布产品。
Docker WebUI 保留为独立容器产品线，使用 GHCR 自己的版本、资格与移动标签；它不是
Desktop Stable 的 follower，也不参与 Desktop GitHub Release 的资产集合。

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
`contracts/app-release-channel.json#shell_transition_policy`。当前阶段只发布和测试
独立的 **One Person Lab Preview**，不修改 OPL App Stable 的 active shell、bundle、
安装路径、user-data 或更新 feed。最终切换必须收敛为一个正式 Desktop 身份，而不是
长期维护两个同名 App 或两个 Stable feed。

| 阶段身份 | Bundle ID / 安装路径 | 更新 authority | 终态 |
| --- | --- | --- | --- |
| 当前 OPL App（AionUI） | `cn.onepersonlab.opl` / `/Applications/One Person Lab.app` | `gaofeng21cn/one-person-lab-app` Stable feed | 保留此正式身份，未来只替换 Shell |
| OPL Studio Preview | `cn.onepersonlab.opl.studio.preview` / `/Applications/One Person Lab Preview.app` | `gaofeng21cn/opl-studio` Preview feed | 功能测试期独立更新，切换时发布 terminal handoff |
| 切换后的 OPL App（Studio） | `cn.onepersonlab.opl` / `/Applications/One Person Lab.app` | 继续使用 App Stable feed | 唯一正式身份 |

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
  domain artifact 都继续从原 owner 读取，**不复制、不迁库**。
- 只有 Shell 私有且不可重建的配置需要版本化迁移：语言、主题与无障碍偏好，非敏感的
  模型/推理/权限偏好，工作区选择与标签，canonical thread keyed UI metadata，未发送草稿，
  通知与日志位置。迁移清单不得包含密码、API key、token、cookie、Keychain material、
  AionCore/AionUI backend database、Codex 消息正文、Framework 状态或 Electron cache。

落地顺序固定为：Preview 功能基线和内测；Preview 签名、公证、公开更新链资格；两条迁移
路径实现和 supported-source window 冻结；AionUI 原地更新与 Preview handoff 的 clean-VM
验收；显式 active-shell/release authority 切换；正式 App 与 terminal Preview handoff 发布；
最后才进行旧数据和 Preview 的有界清理。任何一步的 source、candidate 或本机测试都不能
替代下一步的 public/installed/owner readback。

## Stable Desktop Release Set

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
Release/tag。Windows Preview/RC 是独立的非 Stable 验证通道，不能变成第二个 Stable
Release，也不能替代同 tag Stable 资产。

## 质量与指针

Stable/Preview 是质量；Manual/Automated 是触发方式；Latest 是可移动指针，三者互不替代。
Desktop GitHub Latest 只由合格的 macOS arm64 主发布激活。Full、Linux、Windows 的同 tag
追加不移动 Latest。

Docker WebUI 使用独立的 `independent_stable` 与 `independent_preview` authority：

- Stable 发布不可变版本，并在显式确认后以一次 CAS 同时移动 `:stable` 与 `:latest`；
- Preview 发布不可变版本，并在显式确认后只移动 `:latest`，保持 `:stable` 不变；
- 两者都消费 durable GHCR publication record 和独立 source authority，不接受 Desktop
  Stable run、短期 Actions artifact 或 recovery chain 作为发布 authority。

## 真实完成

合同、测试、candidate、task branch 或单次 API 写入都不等于发布完成。终态至少需要：

1. canonical `main` 的 commit/tree/blob 回读；
2. 本地与 hosted 非发布门禁通过；
3. GitHub Release 的 exact asset name/size/SHA-256、Latest、draft/prerelease 状态回读；
4. 临时 Release/tag 的 exact absence；
5. 安装或公开下载的实际字节校验；
6. task-owned 临时目录、ref、worktree 与 lifecycle receipt 清理，`remaining=[]`。
