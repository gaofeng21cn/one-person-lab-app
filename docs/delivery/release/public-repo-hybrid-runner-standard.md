# 公开仓库 GitHub Actions 混合 Runner 与零跨洋回环发布标准方案

本标准沉淀自 One Person Lab App 在真实公开仓（`PUBLIC`）发布过程中针对「自托管 Mac 编译 + 本地 Tart VM 验收 + 美东 Azure Blob 制品流转」跨洋上行瓶颈的根因剖析与优化闭环，适用于所有**代码开源/公开、且仅少部分硬件虚拟化或真机测试必须跑在自有 Mac/Windows 机器**的 OPL 家族与外部公共仓库。

---

## 1. 核心背景：为什么“同机编译 + 同机 VM”会被跨洋网络拖死？

在 GitHub Actions 默认编排中，`actions/cache` 与 `actions/upload-artifact` 的存储后端是**美国东部的 Azure Blob Storage**（`*.blob.core.windows.net`）。如果同一台家庭/办公宽带下的自托管 Mac 既承担重型编译与打包，又要在多个独立 Job 之间通过 Artifact/Cache 接力传给另一台或同一个本地 Tart VM Job，就会产生致命的**跨洋大文件大回环**：

1. **大缓存反复上云**：本地持久化硬盘原本就有缓存，但工作流照搬一次性云端 Runner 逻辑，把上百 MB 乃至 GB 级 Electron / Bun / Vite / Python 运行时缓存反复打包上传至美东 Azure Blob（实测低带宽夜间窗口仅 Electron + Bun 缓存保存就烧掉 **52 分钟**）。
2. **大制品先传美东再拉回本机**：本地 Mac 编出 DMG/ZIP 后必须 `upload-artifact` 上传到美东 Azure，云端 `ubuntu-latest` 校准摘要，最后本地 Tart VM Job 又 `download-artifact` 把自己刚编的 DMG 从美东拉回来启动 VM，合计造成 GB 级重复上下行。
3. **重复 zlib 二次压缩撞死 300s 停滞看门狗**：对 `.dmg`（ULFO/UDZO）、`.zip`、`.tar.gz` 等已高压缩归档若未显式设置 `compression-level: 0`，`actions/upload-artifact` 默认 `compression-level: 6` 会先做流式 zlib 再分块，一旦叠加跨境高 RTT（实测至 `*.blob.core.windows.net` TLS 握手达 700–880 ms）或抖动，极易触发 `@actions/artifact` 硬编码的 **300 秒无字节进步（`Upload progress stalled.`）** 失败退出。
4. **辅助预热 Job 反向抢占单机自托管资源**：把纯粹只需 `curl` 下载与 SHA-256 校验 npm tarball 的预热任务（如 `_prepare-clean-vm-inputs.yml`）绑死在稀缺的 Tart Mac 标签上，既堵住真正需要 Mac 的构建排队 10 分钟，又因为往美东回传 160 MB tarball 频繁撞上超时。

### 实测对照数据（`gaofeng21cn/one-person-lab-app`）

| 发布形态与物理选路 | Standard `Build macos-arm64`（含签名+公证+产物上传） | Full 构建/收尾总耗时 | 典型阻塞风险 |
| --- | --- | --- | --- |
| **反模式**：本机 Mac 承担构建+缓存上云+跨洋传 DMG | 编包公证 25m + 缓存/制品上传 85m → **110m 失败**（Run `45643539781`） | **76m**（Run `44704631673`） | 跨洋上行波动导致 `Upload progress stalled.` |
| **标准形态**：云端 `macos-latest` 构建上传 + 本机 `opl-cert-mac-tart` 专跑 VM | **23m**（含秒传 1.27 GB 至 Azure 内网，Run `43447258346`） | **18m–26m**（Run `43721482019` / `43528572234`） | 消除本机大体积上行，稳定性极高 |

---

## 2. 混合 Runner 五大工程标准

### 标准 1：公开仓“云端编译默认、硬件刚需才落地、变量显式容灾”

- **适用前提**：仓库为 GitHub Public 仓库，享有免费且与 Azure Blob 同机房内网直连的托管 Runner（`ubuntu-latest` / `macos-latest` / `windows-latest`）。
- **职责切分**：
  - **控制面 / 测试 / Docker 构建 / Linux & Windows 编译 / 摘要封印 / GitHub Release 写入**：全部默认使用 GitHub 托管池（如 `ubuntu-latest`、`windows-latest`），允许通过仓库变量覆盖。
  - **macOS 构建、Developer ID 签名与 Apple 公证**：**默认直接选 `macos-latest`**（即使线上存在在线自托管 macOS Runner 也不主动抢占本地带宽）；仅当托管池发生已知网络故障或需要大盘应急时，才显式配置仓库变量 `OPL_MACOS_RELEASE_RUNNER=opl-release-macos-arm64`（见 [macos-release-runner.ts](../../../scripts/macos-release-runner.ts)）或 `OPL_FULL_BUILD_RUNNER=macos-15-xlarge` 切入自有池。
  - **硬件虚拟化门禁（Tart clean-VM）**：专用标签（如 `["self-hosted", "macOS", "ARM64", "opl-cert-mac-tart"]`）**只运行必须真机虚拟化的 Clean-VM 任务**，不兼职前端/npm 预热或常规编译，做到单向下行拉取包体、零 GB 级上行。

### 标准 2：远端 `actions/cache` 与自托管本地盘严格隔离

- **禁止自托管节点往 GitHub Actions 远端写缓存**：所有 `actions/cache/save`（以及非必要的大体积 `actions/cache/restore`）必须显式附带：
  ```yaml
  if: ${{ github.ref == 'refs/heads/main' && runner.environment == 'github-hosted' && steps.cache.outputs.cache-hit != 'true' }}
  continue-on-error: true
  timeout-minutes: 5
  ```
- **自托管节点改用本机持久化目录 + 内容寻址校验**：利用 Runner 常驻硬盘的 `${{ runner.tool_cache }}` 或固定只读目录暂存已按 `sha256` 校验过的外部 tarball / runtime 资产（详见 [opl-first-run-vm.yml](../../../.github/workflows/opl-first-run-vm.yml)），命中即 `0 秒` 复用，彻底绕开远端 Cache 上传下载。
- **`setup-bun` / `setup-node` 关闭自托管远端缓存**：参考 `no-cache: ${{ runner.environment == 'self-hosted' }}`。

### 标准 3：所有二进制 / 压缩包 `upload-artifact` 强制 `compression-level: 0`

凡是 `.dmg`、`.zip`、`.deb`、`.exe`、`.msi`、`.tgz`、`.tar.gz`、`.blockmap` 等已压缩或不值得再做 zlib 压缩的产物上传，**必须显式声明 `compression-level: 0`**：

```yaml
- name: Upload macOS build artifacts
  uses: actions/upload-artifact@v7
  with:
    name: macos-build-arm64
    path: |
      out/*.dmg
      out/*.zip
      out/*.yml
    compression-level: 0
    retention-days: 7
```

同时避免同一 Job 对完全一致的数百 MB 大文件做无意义的多次跨 Job 冗余打包上传；控制“先上传大文件、后写轻量 manifest/receipt”时，大文件上传本身也受益于零压缩直出流。

### 标准 4：纯下载/校验型预热任务一律留在云端传输池

类似 `_prepare-clean-vm-inputs.yml` 这类「只需拉取 npm tarball 并校验 SHA-256」的预热 Job：
- 使用 `${{ fromJSON(github.ref == 'refs/heads/main' && vars.OPL_RELEASE_TRANSFER_RUNNER_LABELS || '["ubuntu-latest"]') }}`，与目标平台 `cache_key` 语义解耦（在文件名/缓存键中使用目标标签如 `macOS-ARM64`，不要写成 `${{ runner.os }}-${{ runner.arch }}`）；
- Tart VM 本地状态检查（`tart list`）留在真正的 VM Job 内部就近执行，不再提前占用自托管 Mac。

### 标准 5：自托管 macOS `launchd` 服务网络与钥匙串基线清单

对于仍需连接 GitHub Actions 下发控制流、下载待测包与回传轻量 receipt 的自托管 macOS Tart 节点，部署时遵循以下基线：

1. **强制 Node.js IPv4 优先**（规避国内/企业网络 IPv6 半通、NAT64 封装或 Happy Eyeballs 导致 Azure Blob TLS 延迟激增与流式断连）：在 Runner 的 `LaunchAgent` plist（`~/Library/LaunchAgents/actions.runner.*.plist`）`EnvironmentVariables` 中加入：
   ```xml
   <key>NODE_OPTIONS</key>
   <string>--dns-result-order=ipv4first</string>
   ```
   变更后执行 `plutil -lint` 校验并通过 `launchctl bootout` / `launchctl bootstrap` 重载生效。
2. **显式传递临时钥匙串路径**（规避无桌面解锁或锁屏态下 `default keychain locked`）：凡是把凭据写入独立 `--keychain "$RUNNER_TEMP/opl-build.keychain-db"` 的步骤，调用 `xcrun notarytool submit/wait/info --keychain-profile ...` 时必须同步显式传入 `--keychain`（参见 [notarize-macos-dmg.ts](../../../scripts/notarize-macos-dmg.ts) 与 [_build-reusable.yml](../../../.github/workflows/_build-reusable.yml)）。
3. **标签隔离**：日常自托管 VM 测试机器只挂 `["self-hosted", "macOS", "ARM64", "opl-cert-mac-tart"]`，不额外挂载重型编译池标签，除非明确要开启本地容灾构建。

---

## 3. 新公开仓库落地自检清单

- [ ] CI / 发布工作流中重型编译与打包是否默认使用 GitHub 托管 Runner（`ubuntu-latest` / `macos-latest` / `windows-latest`）？
- [ ] 是否仅硬件不可替代步骤（Tart VM、真机驱动、WSL 真机验证等）才标注 `self-hosted`？
- [ ] 所有 `.dmg` / `.zip` / `.exe` / `.deb` / `.tar.gz` 的 `actions/upload-artifact` 是否均已加上 `compression-level: 0`？
- [ ] 所有 `actions/cache/save` 与大型 `restore` 是否已限制为 `runner.environment == 'github-hosted'`，且保存步骤均带 `continue-on-error: true` 与 `timeout-minutes: 5`？
- [ ] 自托管 Runner 的持久化资产是否改为本机 `${{ runner.tool_cache }}` 目录 + `sha256` 校验复用？
- [ ] 自托管 macOS `launchd` 服务是否已配置 `NODE_OPTIONS=--dns-result-order=ipv4first` 并在线自检通过？
