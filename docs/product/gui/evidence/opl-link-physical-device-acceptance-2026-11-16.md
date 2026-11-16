# OPL Link 本机安装与 iPhone Duo 真机验收

2026-11-16，真实 iPhone Duo 已覆盖安装 OPL Link 2.0.0（build 2，`com.onepersonlab.link`），保留原设备数据。本机 `/Applications/One Person Lab.app` 已从旧版本更新为 26.11.16 本地开发版。真实桌面配对和模型续话尚在进行，`real_iphone_qualified` 保持 false。

## 手机安装与界面

设备运行 iOS 27.2.1（24B91034）。Apple Development 签名及 provisioning 已通过，安装、启动和实际应用版本均已回读。本次没有进行 TestFlight 或 App Store 发布。

身份确认、原生旋转后的草稿保留、结构化问题翻题和键盘输入共 3 项真机 UI 测试通过。用户指出回答选项的下半截被截断后，请求面板统一使用 large 高度，长选项按自然高度换行，正文滚动可收起键盘，底部动作保留在系统安全区域。修复后的 `testStructuredQuestionKeepsAnswersWithKeyboard` 在同一真机通过：1 passed、0 failed、0 skipped，18.188 秒，末个选项说明完整位于动作按钮上方。以上使用演示数据，真实桌面对话另行验证。

AppIcon 恢复为 Link Git `bd37760` 保存的“手机、电脑与连接环”原始设计；PNG SHA-256 为 `fdd99fa097ba161a752dda17fc81dd0299ab0dfe13bcbe529797df09ff9201fe`。图标与请求面板修复已进入 Link 主线 `cadfc141db7e2951ca0276b88a0ec4e6afd7cae2`。`npm test` 为 29 passed、2 环境 skip、0 failed；开发签名真机构建和未签名模拟器构建均通过。

Touch ID 请求发生在 Xcode UI 测试初始化。Link 源码未接入生物认证；用户反馈的英文标题没有有效截图或可复现原文，本次未修改系统认证文案。

## 桌面连接断点与修复

初版本地 App 更新已通过 Full 构建、启动检查、签名和原子替换，并回读正常运行。原 manual 命令在安装前因另一任务推进 RCA checkout 而停止；随后复用已冻结、已签名且摘要未变的候选，通过原 `installLocalApp` 安装入口恢复完成。该记录不等同于原 manual 命令完整成功。

实机配对准备期间，桌面报告 `Guest Host connection closed`。受控诊断确认：`readThread` 的合法响应为 62,718,978 bytes，绝大部分来自 canonical 对话的完整 turns；超过旧 stdio RPC 的 32 MiB 接收缓冲限制，导致后续登录和 Link 操作均无法通过。该断点发生于桌面父子进程私有管道，尚未进入手机或公网 Relay。

Studio 主线 `ddf6b1d872b936c0136c5615a8fa080292d144e2` 修正为逐帧 128 MiB 上限，以分片累计避免反复复制和扫描整个大响应；超限 owner 结果只拒绝该请求，后续账户调用保持可用。18 项定向回归通过，覆盖大于 32 MiB 的 canonical thread、后续账户读取、多帧合并与 UTF-8 分片、超限请求隔离和不完整帧的内存边界。

修复后的完整 App 已构建、通过 packaged Host 启动检查、签名并完成原子替换安装，当次为 `local.srca52f5ab42377`，machine version `26.11.1691`。安装入口回读 `status=completed`、`launched=true`；Full manifest SHA-256 为 `aaef1eac912da7f7fc50d6b34e361079724a3750fa9b6fd9ab933d62e6dba6f7`。外层 manual 命令再次因其他任务在构建后编辑 RCA checkout 停止；安装沿用未变化的已签名冻结候选和同一 owner 安装入口，原手工命令的终态仍为失败，安装恢复的终态为成功。

已安装 `windows-guest-rpc.mjs` 与 Studio 修复提交的 SHA-256 一致，为 `8b54734693d5c62848762b56517fbfd417fbd167bfaa784adfa106c5267abb8b`。在安装版重新打开触发故障的原长对话，再读取 Link 状态与账户页，未再出现 `Guest Host connection closed`。App 合同结构检查和 8 项 companion 合同测试通过。用户随后已完成 Gateway 登录，无需重复登录。另一项已获授权的本机更新随后安装并启动 `local.src0fdc1fd2672a`；本任务只读核对其 RPC 文件摘要仍与上述修复一致。

## 账户准入与实际 Framework 激活

用户实际账户为 active/admin，经用户明确批准，Link 已接受其有限伴侣权限。Link 主线 `1f6a8645ed4d7a90897b3b065b11d88bf67282b1` 和 App 主线 `079b1da52` 持有这一合同；手机不会获得 Gateway 管理接口权限。服务 20 项定向测试通过，普通专用账号的公网 WSS、Noise、跨账号隔离和撤销在部署 `43816887818` 后由资格运行 `43817059605` 验证。这些结果绑定当次服务镜像。

实际桌面执行路径曾仍指向旧 Framework，缺少 `authorize-companion`。本任务复用已签名 Full App 的完整 Framework payload，通过 Framework updater 在 managed update lock 内 stage 并激活；`2026-11-16T06:36:29.162Z` 回读 `status=activated`，旧 runtime 保存在 owner 的 `opl.previous` 回滚位置。激活后曾读到 Link `internet.status=ready` 并生成配对码。

桌面已完成真实只读模型对话：工作区 `/Users/gaofeng/Documents/OPL Link Test`，thread `01a1e307-aee6-7832-bc1d-5778ab1a64bd`，turn `01a1e307-af21-7d03-8719-99030d83411b`，回复 `OPL_LINK_DEVICE_OK_20261116`。这只证明桌面模型链路，不代表手机已连接。

## 相机对照与当前配对边界

用户反馈 OPL Link 扫码黑屏时，iPhone 自带相机也黑屏；退出 Device Hub 远程控制后，自带相机立即恢复。当前证据支持黑屏与远程控制状态相关，尚无官方依据将其定义为苹果明确限制。后续扫码验收停止远程查看、控制或截图手机，由用户直接操作。此前全屏扫码与权限分支调整属于界面试验，不能作为已验证的黑屏根因修复。

扫码及粘贴配对尚未成功，手机曾显示“电脑授权结果尚未确认”，桌面已信任设备仍为 0。随后桌面 `CONNECTION_FAILED` 的受控诊断捕获到 WebSocket upgrade 返回 HTTP 200，公网 `/healthz` 同样返回 200 空正文。同期独立的一体化 Link 部署任务处于工作负载就绪失败，具体部署状态由 Instance owner 回读；本任务未重复部署，也未更改其临时源码凭据。必须恢复有效 JSON 健康响应和 WSS，再生成新配对码，才能继续真机验收。

## 证据与剩余验收

本机原始 xcresult summary、真机截图、图标原图和桌面安装回执保存在 `/Users/gaofeng/.codex/visualizations/2026/11/16/opl-link-physical-device/`。证据不包含配对链接、Gateway 密码、设备私钥或业务正文。

真实手机配对、同一 canonical thread 续话、文件预览/分享、前后台恢复和移动网络切换仍需实际回读；此前公网 TURN/Relay 的模拟器资格证据沿用独立验收文档，不计作这些真机业务已通过。
