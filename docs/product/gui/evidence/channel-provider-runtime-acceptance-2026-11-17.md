# 微信渠道 Host 运行载体修复验收

2026-11-17，本机安装版 OPL App 的微信渠道已恢复到“未连接”，可以选择“连接本人微信”或
“连接他人微信”。通过真实 App 页面发起本人连接后，当前 App Host 返回 `status=available`、
`connection.state=qr_ready`，页面实际生成 192×192 的二维码。检查后退出扫码挑战，未绑定微信账号。

## 根因和通用修复

Full 首装包的 `contracts/full-runtime-prune-policy.json` 原来只保留
`opl/dist/host/composition-profiles.js`，却删除它静态引用的 read models、adapters 和 Host plugins。
Studio 从这个公开入口启动渠道 Host 时发生 `ERR_MODULE_NOT_FOUND`，微信业务 provider 因而未注册。
原检查只确认入口文件存在，不能证明它可加载。

App 主线 `197499407` 删除这两条错误裁剪规则。在生产依赖复制、源码 export condition 移除和
平台原生库整理后，Full builder 使用 Node 从目标包实际加载必需的公开入口。依赖缺失立即拒绝
该层，prune policy 与实现 hash 同时使旧 OPL runtime 缓存失效。该修复适用于后续使用此 builder
生成的 Full 包；既有用户需安装包含修复的新包，或通过 Framework 更新恢复完整运行载体。

18 项针对性回归通过，覆盖真实分层构建、跨模块依赖、包 export、缺入口和缺传递依赖。
随后用干净 Framework 源码 `da954d4cc493ab1591c64848f9ea9f4954aa567f` 执行真实 `buildOplLayer`，
目标目录中完整 dist 共 2,724 个目录和文件条目，公开 Host 模块实际加载通过。
App active-shell 完整验证通过。没有修改微信业务代码或强制启用其内部 Codex 入口。

## 已安装 App 回读

Framework 正式 archive builder 生成 0.3.16 运行包，通过现有 self-update 的暂存、依赖安装和
激活入口切换 `~/Library/Application Support/OPL/runtime/current/opl`；旧目录保留为 `opl.previous`。
App 退出后激活，随后重新启动。

通过安装版 App 的 `window.oplStudio.readContribution` 读取
`opl-channel-weixin / weixin.channel-access#state`，命令路由为
`opl.connect.channel-provider-host`，`exitCode=0`、`response.ok=true`，初始状态为
`available / disconnected`。真实页面的连接动作成功取得微信服务扫码挑战，随后读取为
`available / qr_ready`。二维码只在界面临时呈现，不写入本记录或验收日志。

本机更新、真实渠道 Host 和扫码挑战已验证；微信账号确认及真实消息往返尚未执行。
原始本机回执保存在 `~/Library/Caches/One Person Lab/link-host-recovery-2026-11-17/`。
