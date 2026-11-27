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

#### `v26.11.26` Stable 正式发布实测分阶段耗时

以下数据采集自 `v26.11.26`（`Standard` + `WebUI` + `Linux` + `Windows` + `Full`）正式发布的 GitHub Actions 实时统计（`npm run release:actions-timing` 与 job 元数据）：

| 阶段 / 作业 | 运行标识 | Runner 池 | 实测耗时 | 关键子步骤拆解与观测 |
| --- | --- | --- | --- | --- |
| Standard macOS ARM64 构建与公证 | [45810342836](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45810342836) | `macos-latest` | `33m45s` (`2025s`) | 队列 `3s`；`electron-builder` `14m40s`，active Shell 校验 `9m21s`，Developer ID 签名/Apple 公证 `6m31s` |
| Standard Clean-VM 首启验收 | [45810342836](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45810342836) | `self-hosted` (`opl-cert-mac-tart`) | `6m14s` (`374s`) | 仅运行 VM 门禁；`Run clean VM first launch smoke` `4m24s` (`264s`) |
| Standard Release 与 Homebrew Cask 发布 | [45810342836](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45810342836) | `ubuntu-latest` | `2m53s` + `15s` | `publish-standard-nonlatest` `173s`；`publish-standard-cask` `15s` |
| WebUI / Docker 多架构构建与发布 | [45810342836](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45810342836) | `ubuntu-24.04` / `-arm` / `ubuntu-latest` | `3m30s` / `5m07s` / `3m40s` | `amd64` `210s`、`arm64` `307s` 并行构建与验证，随后 `publish-carrier` `220s` |
| Linux x64 `.deb` 构建 | [45810342836](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45810342836) | `ubuntu-latest` | `5m54s` (`354s`) | `electron-builder (Linux)` `2m56s` (`176s`) |
| Windows x64 `.exe` 构建与追加 | [45834020995](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45834020995) | `ubuntu-latest` + `windows-latest` | 墙钟 `26m47s` (`1607s`) | 队列 `4s`；Guest Host 预备 `4m47s`，`Build windows-x64` `17m44s`（`electron-builder` `14m38s`），`append-platform` `1m44s`；发布后认证 [45838497362](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45838497362) `17s` |
| Full macOS ARM64 全量构建、签名与公证 | [45930131237](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45930131237) | `macos-latest` + `ubuntu-latest` | `43m16s` (`2596s`) | Shell 依赖 `2m07s`、Full payload 打包 `17m35s`、ARM 终态校验 `2m00s`、签名/公证/staple `17m02s`；`full-qualification` `3m19s`、`checkpoint-full` `1m06s` |
| Full Checkpoint 复用恢复、Clean-VM 与发布 | [45943716661](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45943716661) | 混合池 | 墙钟 `24m15s` (`1455s`) | 队列 `3s`；`restore-standard` `1m02s`，`materialize-full-build` **`2m01s`**（较重打节省 **`~41m15s`**；[45939506164](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45939506164) 为 `54s`），`Clean VM first launch` `15m38s` (`938s`，含 7 包首装与 Temporal 生命周期），`publish-full` `1m24s`，`publish-homebrew-full` `30s`；联动 follow-up [45946149897](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45946149897) `24s` |

#### `v26.11.26` 发布实战复盘与左移改进结论

- **Harness 修复优先走 `--smoke-harness-ref` 复用已签 Checkpoint**：当 Clean-VM 失败仅源于 `shellHarnessMechanicsPaths`（如 `qualify-clean-vm.mjs`、`stable-smoke.mjs`）而非 DMG 本体时，使用 `--smoke-harness-ref` 直接复用已签名公证的 Full checkpoint（[45930131237](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45930131237) -> [45943716661](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45943716661)），单次恢复仅需 `2m01s` 恢复制品、免去 `43m16s` 重编与 Apple 公证。
- **macOS 大体积包签名必须限制并发文件句柄**：Full 包内含海量运行期小文件，`@electron/osx-sign` 并发扫描曾导致 [45924560645](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/45924560645) 在 `14m27s` 触发 `EMFILE`；统一配置 `ulimit -S -n 65536` 与 `graceful-fs`/`p-limit(32)` 预加载后，签名阶段稳定通过。
- **将种子载荷与序列化驱动校验前置到本地**：打包阶段新增 `assertPackagedCatalogSeedPayloadsComplete` 校验 `modules/*/runtime/` 声明文件完整性，并在单测中直接以无外部依赖的 `new Function` / 独立模块形态验证传入 VM 的序列化驱动（如 `collectTemporalServiceSupervisorProof`），避免跑完 40 分钟构建后才在 VM 末尾暴露静态缺漏。
- **冻结候选的 Clean-VM 必须关闭后台自动更新**：联网 Clean-VM 阶段显式注入 `OPL_STUDIO_MANAGED_UPDATES=0` 并为 `runFrameworkReadiness` 透传完整超时预算，防止远端已发布的新版 Framework 镜像在验收过程中触发后台更新并独占写锁，影响冻结候选本身的一致性判定。

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

### 标准 6：开发机兼任自托管节点的本地优先与 24/7 宿主机基线

- **本地优先推前门禁（Local-First Gate）**：日常 typecheck、lint、单测与核心契约检查应在开发机本地热缓存跑通后再 `git push`，避免把 GitHub Actions 当成试错调试器，或在自托管节点与云端之间来回传输大体积构建缓存。
- **24/7 macOS 宿主机基线**：常开宿主机保持 `sleep 0`、`disksleep 0`、`autorestart 1`、`womp 1`、`tcpkeepalive 1`（无头环境建议配 HDMI EDID 欺骗器），优先有线网络与固定内网 IP；按物理内存限制虚拟化并发度（如 64 GB 宿主机 Tart 严格单并发、单 VM 分配 8–16 GB RAM），预留 `>= 150 GB` 可用磁盘并定期清理 `_work`、临时 Tart 克隆与过期模拟器。
- **主开发机安全红线**：公开仓 `pull_request` / `pull_request_target` 严禁调度到开发机宿主机；宿主机 Runner 仅充当一次性 Tart VM 编排器，默认顶层 `permissions: contents: read`、`actions/checkout` 配置 `persist-credentials: false`，写操作与复杂发布流第三方 Action 固定 40 位 commit SHA。

---

## 3. 新公开仓库落地自检清单

- [ ] CI / 发布工作流中重型编译与打包是否默认使用 GitHub 托管 Runner（`ubuntu-latest` / `macos-latest` / `windows-latest`）？
- [ ] 是否仅硬件不可替代步骤（Tart VM、真机驱动、WSL 真机验证等）才标注 `self-hosted`？
- [ ] 所有 `.dmg` / `.zip` / `.exe` / `.deb` / `.tar.gz` 的 `actions/upload-artifact` 是否均已加上 `compression-level: 0`？
- [ ] 所有 `actions/cache/save` 与大型 `restore` 是否已限制为 `runner.environment == 'github-hosted'`，且保存步骤均带 `continue-on-error: true` 与 `timeout-minutes: 5`？
- [ ] 自托管 Runner 的持久化资产是否改为本机 `${{ runner.tool_cache }}` 目录 + `sha256` 校验复用？
- [ ] 本机 runner 是否能下载待测制品，并在干净交接环境导入和执行实际验收脚本？
- [ ] 执行是否分别记录排队、构建、签名、公证、制品传输、VM 启动和公开渠道完成时间？
- [ ] 日常变更的 typecheck、lint、单测与契约检查是否已在开发机本地热缓存跑通后再推送，避免用 GitHub 试错或双向传输大体积缓存？
- [ ] 24/7 常开 macOS 自托管宿主机是否已配置 `sleep 0`、`disksleep 0`、`autorestart 1`，并按物理内存限制 VM 并发度与保留 `>= 150 GB` 空闲空间？
- [ ] 公开仓 `pull_request` / `pull_request_target` 是否已严格隔离出开发机宿主机，且写操作/复杂工作流 Action 均已锁定 40 位 commit SHA？
