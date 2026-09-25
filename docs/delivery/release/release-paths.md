# Studio 发布路径与矩阵

本页是发布入口索引，不保存某次发布的状态账本。平台与身份由
[`app-release-channel.json`](../../../contracts/app-release-channel.json)、
[`app-shell-adapter.json`](../../../contracts/app-shell-adapter.json) 和真实 workflow 决定；
操作顺序与恢复规则见 [SOP](stable-release-sop.md)。合同中的 `implemented` 表示入口已实现，
当前版本是否完成必须读取对应 Release、GHCR、Homebrew 或验收回执。

## 产品与平台

正式产品是 One Person Lab App，Studio 是全部当前 Desktop/WebUI 载体的实现。
Stable 与 Preview 表示质量，Nightly 是自动触发的 Preview；Latest 是分发指针。
Standard 和 Full 表示安装包内容密度。旧 Aion Shell 已归档，只用于历史迁移与固定测试夹具。

| 发布成员 | 平台 | 公开位置与更新方式 | 与主发布的关系 |
| --- | --- | --- | --- |
| Desktop Standard Stable | macOS arm64，macOS 13+ | App Stable Release；DMG、ZIP、blockmap、两个 macOS feed；保留 `cn.onepersonlab.opl` | 签名、公证、准确包首装通过后公开，再激活 GitHub Latest |
| Desktop Full Stable | macOS arm64，macOS 13+ | 同一 Stable tag 的 Full DMG 与 `opl-release-manifest.json`；安装后走 Standard 更新器 | 独立首次安装包，Standard 公开后追加；自身构建及首装合格，不重建已合格字节 |
| Desktop Linux | Linux x64 | 同一 Stable tag 的 DEB、`latest-linux.yml` 与平台 manifest | 默认附加成员；不阻塞 macOS 首次公开，不另建 Release |
| Desktop Windows | Windows x64 | 同一 Stable tag 的 NSIS EXE、blockmap、`latest.yml` 与签名状态回执；复用 WSL runtime | 默认附加成员；未签名状态必须明确，真实旧版升级认证不能由打包通过代替 |
| Docker WebUI Stable | Linux amd64、arm64 | `ghcr.io/gaofeng21cn/one-person-lab-webui:<version>`、`:stable`、`:latest` | 自动附加发布；不阻塞 macOS 首次公开，完整 Stable 交付须完成它的双架构发布与指针回读 |
| Homebrew Standard / Full | macOS arm64 | `one-person-lab` / `one-person-lab-full` Cask | 各自消费准确公开资产，独立跟随与恢复；OPL Base Formula 由 Framework 发布 |
| Desktop Nightly | macOS arm64 | App Nightly prerelease 与隔离的 updater；`one-person-lab-nightly` Cask | 不默认构建 Full、其他桌面平台或 Docker，不自动移动 Stable Latest |
| Desktop Manual Preview | macOS arm64、Linux x64 | App Preview 版本；质量与未执行的门禁显式披露 | 仅明确需要开发版时使用；Latest override 是单独的保护操作 |
| Docker WebUI Preview | Linux amd64、arm64 | 独立不可变 Preview 版本；显式 promotion 可移动 `:latest`，保留 `:stable` | 不等同于 Desktop Nightly 或历史 Studio Preview |

macOS x64/universal、Linux arm64、Windows arm64 目前只属于 `manual_all` 开发验证矩阵，
不因能构建就成为正式发布平台。Docker arm64 不表示 Linux Desktop arm64 已发布。
Docker 没有自动 Nightly 发布入口；保留标签或清理策略不能当作可执行发布路径。

查看实际生成的构建矩阵：

```bash
node --experimental-strip-types scripts/resolve-release-platform-matrix.ts --policy stable_required
node --experimental-strip-types scripts/resolve-release-platform-matrix.ts --policy stable_desktop_additional
node --experimental-strip-types scripts/resolve-release-platform-matrix.ts --policy nightly_standard
node --experimental-strip-types scripts/resolve-release-platform-matrix.ts --policy preview_standard
node --experimental-strip-types scripts/resolve-release-platform-matrix.ts --policy manual_all --platform all
```

## 正式入口和附加发布

以下为入口定位，参数从当前 CLI help 或 workflow inputs 获取，不复制旧 run 的 SHA、版本或回执。

| 需求 | 入口 | 后续执行 |
| --- | --- | --- |
| 新 Stable | `npm run release:stable-dispatch -- new-product-release` | `release-stable.yml` → `_release-bundle.yml`；同一冻结候选，Standard 公开前验收 |
| 恢复 Standard 公开 | controller 的 `publish-qualified-standard` | 消费既有准确检查点；不重新分配版本或重建 |
| 追加或恢复 Full | controller 的 `append-full`；自动 follower 的 `reconcile_full_addon` | `_release-full-addon.yml`；随后 `_release-homebrew-full-publish.yml` |
| Linux / Windows 附加发布 | `release-stable-post-success-followups.yml` | 每个平台独立执行 `_release-desktop-platform-addon.yml` → `build-manual.yml`，然后同 tag 追加 |
| 单个平台恢复 | 同一 follow-up workflow，`operation=reconcile_desktop_platform` | `source_run_id` 加准确 `desktop_platform`；已存在的不同字节必须走替换，不能当作追加覆盖 |
| Standard / Full Homebrew 恢复 | 同一 follow-up workflow，`reconcile_homebrew_standard` / `reconcile_homebrew_full` | 读取真实公开 manifest；Standard 支持同 tag 的机器版本修复；Full 保持自己的合格来源 |
| Docker 自动附加 | Stable workflow 的 WebUI source/carrier/promotion jobs | 双架构原生资格、不可变 OCI 版本、durable publication record、版本与移动标签回读 |
| Docker 单独验收、发布或修复 | `release-webui-development.yml`，`qualify` / `publish` / `promote` | 可用 `qualified_artifact_run_id` 复用合格镜像；Stable `publish` 已接续 promotion，成功后不重复 promote |
| 定时 Nightly | `release-nightly.yml` 的 schedule | 读取当前 Studio adapter，冻结源码，轻量资格后公开 prerelease；重构建分配新的 Nightly revision |
| 手动 Nightly | 同一 workflow，准确 `publish_nonlatest_nightly` 确认 | 与 schedule 共用实现，保持非 Latest |
| Nightly 附加恢复 | `release-nightly-followups.yml` | `reconcile_homebrew` 或 `run_sampled_vm`；消费准确成功的 Nightly publication handoff |
| Manual Standard Preview / Latest 选择 | `release-manual-preview.yml` | `preview` / `resume_preview` / `move_latest_pointer`；需要明确的 Preview 或指针操作范围 |

附加发布失败只恢复自身。已公开 Standard 不应被 Full、Docker、Windows 或 Homebrew 的失败
回写成“从未发布”；要求完整矩阵的任务也不能因为 Standard 成功就结束。

## 修复、验证和历史入口

| 需求 | 入口与边界 |
| --- | --- |
| 同标签 macOS 产品修复 | `build-manual.yml` 的 `replacement_tag` 生成签名候选并递增机器版本；首装通过后用 `replace-same-tag-release-assets.ts` 的 `--stage` / `--promote` 按资产身份替换 |
| 复用签名修复候选 | 同一入口传 `replacement_candidate_run_id`、原 `app_ref`、原 `shell_ref`、原 `framework_ref`；无脚本修复时 `verification_app_ref` 也用原 App SHA |
| 仅改验收脚本 | 保留产物源 SHA；仅通过受限的 `verification_app_ref` / `smoke_harness_ref` 指定准确验证提交，须通过现有作用域检查，不能直接用已包含其他改动的最新 main |
| 仅修复公开安装器 | follow-up 的 `repair_additive`；只适用于合同允许的 `opl-install.sh` CAS，不替代应用或平台包替换 |
| 首装、诊断及补充认证 | `opl-first-run-vm.yml`、`release-diagnostics.yml`、`release-post-publication-certification.yml`；分别按准确候选和 profile 执行；可选公开后认证不取代 Stable 必需的公开前首装 |
| Windows 升级资格 | `windows-updater-upgrade-vm-preflight.yml`；隔离环境、身份、签名状态及兼容性条件按 Windows 合同读取，未验收要明确保留缺口 |
| 本地 Full App / DMG | `npm run manual:local-app` / `npm run manual:full-dmg`；Studio native Codex 与正式 Full builder 共用；前者实际替换本机 App，仅在要求本机安装时执行 |
| 本地 Full 临时公开预览 | `release-manual-full-preview.yml` 的受保护 handoff；详见 [独立手册](manual-full-preview-handoff.md)，不自动升级为 Stable 或 Full 追加 |
| 历史 Studio Preview 桥维护 | `release-stable.yml` 的 `studio_carrier_admission` → `_release-studio.yml`；独立 Preview 身份，只在明确维护交接时使用，普通 App 发布不再走此入口 |
| 历史 Studio Full Preview 维护 | 同一 workflow 的 `studio_full_append` → `_release-studio-full.yml`；不等同于正式 App Full |
| 非发布验证 | `release-source-qualification.yml`、`release-qualification.yml`、`release-bundle-canary.yml`、`build-manual.yml` 普通模式、`docker-webui-clean-vm.yml`；产物或通过结果不授予公开资格 |

## 同标签修复后的跟随关系

显示 tag 保留，机器 updater 版本递增，版本与 digest 以新公开 manifest 为准。Standard
Homebrew follower 使用最初成功 run 定位 Release，再绑定该 Release 的当前合格 manifest，
不拿最初的 DMG 摘要覆盖新包。保留仍被 Full 引用的历史 Standard attestation；保留 Preview
桥内固定 URL 和 SHA-256 的交接资产。Full、其他平台包与 Docker 各自记录真实来源，不能把
新 macOS 源 SHA 填成它们的构建来源。

## 验收与收尾

同机 Tart 同时运行数量受 macOS 限制。派发前检查现有 VM owner；只停止本任务已不需要
并已保存状态的 VM，不停止其他任务。Tart 启动错误应直接报告进程失败原因，不能靠加大
IP 等待时间掩盖。正常首装、迁移、Docker 持久化和 Homebrew 安装使用各自最窄验证。

新包首装要在公开前通过；升级修复用公开后的同一字节核对实际版本与数据延续。测试注入的
Codex 与生产由 Framework 选用的 Codex 是不同输入；涉及协议或迁移的修复应验证实际运行时，
不能只用旧测试版本证明兼容。普通后续发布无需重跑所有历史切换基线，仅覆盖本次变更影响的路径。
