# 公开仓库 GitHub Actions 混合 Runner 发布标准

本标准适用于能够使用 GitHub 托管 Runner 构建，又需要自有硬件验收的公开仓库。One Person Lab App 采用云端构建和制品交接，自有 Mac 负责 Tart 首装验收。评估时以实际 job、runner、制品和耗时为依据。

---

## 1. Runner 分工与实测

原流程在同一台自有 Mac 构建和验收，但独立 job 仍通过 GitHub Actions 交换制品。DMG、ZIP 和构建缓存先从本机上传，封存后再由同一台 Mac 下载。一次运行仅 Electron 和 Bun 缓存保存就用了 52 分 20 秒，随后制品上传在 29 分 02 秒时报 `Upload progress stalled.`。这段上行位于 VM 启动之前。改造将大文件生产和交接移入托管 Runner，Tart 主机以下载待测包和回传小型验收回执为主。 [原运行日志](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45643539781)

| 阶段 | App 默认运行位置 | 交接与职责 |
| --- | --- | --- |
| 源码验证、准入、预取 | GitHub 托管 Ubuntu | 冻结版本和依赖，下载并验证 VM 输入 |
| macOS 构建、签名、公证 | GitHub 托管 macOS | 生成并上传签名制品和生产者回执 |
| 制品封存、发布控制 | GitHub 托管 Ubuntu | 绑定摘要和候选身份，形成供验收和发布使用的制品 |
| 首次启动 | 自有 ARM Mac 的 Tart runner | 验证源码交接、下载已封存制品、克隆干净 VM 并回传验收证据 |
| 公开发布及附加渠道 | GitHub 托管池，按目标平台选择 | 验证验收回执，发布并回读正式渠道 |

11 月 26 日首个云端候选的 macOS 构建 job 含签名、公证及上传共耗时 32 分钟。两次缓存保存合计 3 秒，主制品和 DMG 专用制品分别上传 11 秒和 5 秒。封存通过后，本机 runner 下载源码交接包用时 15 秒，随后在导入 Studio 验收脚本时因 npm 依赖缺失退出，尚未创建 VM。这次运行验证了云端构建与交接的耗时，并定位了一个独立的源码交接故障。 [云端候选](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45731928065) · [Tart 作业](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45731928065/job/139630485097)

---

## 2. 混合 Runner 五大工程标准

### 标准 1：公开仓“云端编译默认、硬件刚需才落地、变量显式容灾”

- 确认仓库能使用适合目标操作系统和架构的 GitHub 托管 Runner。评估队列、相同制品的实际传输时间和托管池的计费条件。 [GitHub 托管 Runner](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
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

### 标准 3：已压缩制品上传选用 `compression-level: 0`

对 DMG、ZIP、DEB、TGZ 等已压缩制品显式设为 0，减少归档时的重复压缩。其他输入按实测体积与上传时间选择。 [GitHub upload-artifact 压缩参数](https://github.com/actions/upload-artifact#altering-compressions-level-speed-v-size)

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

1. 本机实测某个网络路径不稳定时，分别记录 IPv4、IPv6 的 DNS、TLS 和同尺寸传输表现。OPL 的 Tart runner 已将 Node.js DNS 结果设为 IPv4 优先。其他仓库可依据本机证据在 Runner 的 `LaunchAgent` 添加同一选项。
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
- [ ] 本机 runner 是否能下载待测制品，并在干净交接环境导入和执行实际验收脚本？
- [ ] 执行是否分别记录排队、构建、签名、公证、制品传输、VM 启动和公开渠道完成时间？
