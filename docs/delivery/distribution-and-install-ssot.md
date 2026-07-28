# OPL App 分发与安装 SSOT

Owner: `one-person-lab-app`
State: `active_support`
Machine owners:
[`contracts/app-release-channel.json#distribution_semantics`](../../contracts/app-release-channel.json)
和
[`contracts/app-install-exposure-policy.json#distribution_install_model`](../../contracts/app-install-exposure-policy.json)

本文是 OPL App 发布、安装、运行形态和一致终态的唯一人类可读维护入口。
机器事实仍由上述两份合同分别拥有；本文不替代 Release Bundle、发布 receipt、
远端 readback 或 Framework package lifecycle。

跨目标并发、objective owner和开发清洁规则统一消费
[`../active/parallel-delivery-and-clean-development-ssot.md`](../active/parallel-delivery-and-clean-development-ssot.md)
及其机器快照
[`../active/active-objective-ledger.json`](../active/active-objective-ledger.json)，本文不复制
易漂移的 thread heartbeat、run id或worktree清单。

## 执行协调与开发清洁

- 最新直接用户目标是当前SSOT；旧合同、ledger、callback或失败operation与其冲突时，
  先修订流程和实现，不得用旧记录拒绝用户终态。
- Desktop Stable/Latest、WebUI GHCR `stable/latest`、Native/Homebrew exposure、managed
  install和GUI same-artifact acceptance可以独立并行；一个载体的失败不阻止另一个已经
  具备权限和输入的载体继续交付。
- 依赖只约束最终消费顺序：GUI必须等待fresh immutable published artifact，installer
  readback必须等待对应公开carrier；但source、fixture、compatibility bridge和本地测试
  可以先行。
- 小范围write-set overlap不阻止独立worktree开发；每个repo最终main mutation串行，
  后吸收owner按fresh SSOT semantic replay并解决冲突。
- 手工开发local-first/push-last；远端Actions只补hosted OS、受保护secret/public mutation
  和owner-authoritative readback，不作为第一轮调试器。
- 开发清洁以`stale=0 / ownerless=0 / duplicate_writer=0 / unexpected_dirty=0 / git_locks=0`
  为终态。活跃owner lane可以保留；已吸收lane必须由原owner完成worktree/ref/receipt/temp
  的guarded close，不能按标题或clean状态批量删除。

## 结论

“OPL 有多少条路径”不能只给一个总数，因为发布载体、生产发布路径、用户安装
入口、运行形态和载荷密度是不同层。当前统一口径是：

| 层 | 当前数量 | 当前成员 |
| --- | ---: | --- |
| 发布载体族 | 3 | App GitHub Releases、Homebrew Tap、WebUI GHCR |
| 生产发布路径 | 5 | Desktop Stable GitHub Release、Native WebUI GitHub Release assets、Standard Homebrew Cask、Full Homebrew follower、Container WebUI GHCR `:latest`（`:stable` 为兼容 alias） |
| 普通安装入口族 | 4 | 直接 GitHub Release 资产、Homebrew Cask、Release `opl-install.sh`、Container WebUI helper/Compose |
| 已支持 App 运行形态 | 3 | Desktop、Native WebUI、Container WebUI |
| 批准目标运行形态 | 3 | Desktop、Native WebUI、Container WebUI |
| 载荷密度 | 2 | Standard、Full |

因此：

- Standard/Full 是同一产品和 Official Profile 的两种首装密度，不是两套产品，
  也不应被重复计作发布频道或运行形态。
- `Latest` 是某个载体命名空间内供自动更新器消费的可变指针，不是质量、频道或
  “最新构建”的同义词。
- Desktop GitHub `Latest` 与 WebUI GHCR `:latest` 是两个载体各自的指针；生产
  默认由各自新发布的合格 Stable 接管。用户明确确认后，任一载体也可以把自己的
  `latest` 指向一个已经发布、身份和 digest 均可核验的 exact Stable 或 Preview
  版本；这不会改变该版本的质量，也不会改动其他载体的指针。
- `one-person-lab-nightly` 的产品语义保留：它是 Standard 密度的自动预发布，
  不是 Full。当前实现每天自动复用与 Stable 相同的物理 Standard build，
  发布不可变 GitHub prerelease，再由独立 digest-bound follower 更新 Nightly Cask；
  schedule 默认不改变 Latest，也不进入 Stable Bundle 或重型 VM 门禁。用户可以
  通过独立的 protected single-use pointer operation 临时让某个 exact Nightly
  接管 Latest；该操作不改变 Preview 质量。低频 clean-VM 只作发布后抽样、失败
  不阻塞该次 Nightly。
- `one-person-lab-full` 的目标是可正常 Homebrew 安装。当前公开 Cask 仍是旧版且
  额外依赖 Formula `opl`；本仓生成器已能生成“不装 Formula、直接消费 Full DMG
  内嵌 Base/seeds”的正确 Cask，但尚未公开晋升和 clean-host readback。
- Linux Native WebUI 已是公开运行形态：`v26.7.28-r3` 首次公开 Linux x86_64
  tarball、校验文件、版本选择式 `install-web.sh` 和资格回执；回执覆盖 non-root 首装、幂等、
  跨版本更新、回滚、数据保留、HTTP health 与 Official Profile。Linux 个人电脑
  默认走 Native WebUI，Container WebUI 保留为显式隔离/服务器选择和失败回退。
- macOS arm64 Native WebUI 的构建、qualification、additive publish、follower
  readback 与安装器路由已经实现；在首次同 cohort 公开资产和 readback 出现前，
  普通 `--webui` 对旧 Release 仍回退 Container，且不得写成当前已支持。
- `install.sh --stable-macos-install` 与 `install-stable.sh` 只保留兼容；Homebrew、
  直接 DMG 和版本冻结的公共 `opl-install.sh` 覆盖同类用户需求后应退休重复实现。

## 用户认知模型

用户不需要先理解 GitHub、Homebrew、GHCR、Standard 或 Full。第一层只选择体验：

| 用户选择 | 含义 | 当前平台 |
| --- | --- | --- |
| Desktop | 独立应用窗口和系统集成 | macOS 已支持；Linux Desktop 可构建但尚未完成公开资产与 clean-host 资格；Windows 仍是目标 |
| Browser WebUI | 在浏览器使用同一工作台 | Linux x86_64 个人电脑默认 Native；macOS arm64 Native 已实现待首发，旧 Release 回退 Container；Windows 与服务器/隔离部署当前使用 Container |
| Headless | 只装 OPL Base/CLI，不启动 App 工作台 | 高级用户和自动化 |

第二层才选择安装载体：

| 载体 | 用户何时选择 |
| --- | --- |
| `opl-install.sh` | Unix-like shell 的默认统一入口；同一份按 Release 冻结的脚本按平台和显式模式路由，并固定 App/Shell/Framework cohort、Release tag 与版本化 Container tag |
| Homebrew | 已使用 Homebrew，希望由包管理器安装和更新 |
| 直接 Release 资产 | 离线、固定版本或人工安装 |
| Docker/Compose | 隔离、服务器、NAS 或跨平台浏览器部署 |

开发者只维护三个公开载体族：

```text
GitHub Release -> Desktop + Native WebUI + manifests + frozen installer
Homebrew Tap   -> GitHub Release 的包管理器索引/follower
GHCR           -> Container WebUI
```

Standard/Full 是 Desktop 首装密度；Native/Container 是 Browser WebUI 的部署载体。
它们都不是额外产品或额外质量频道。

## 正交语义

过去的主要混乱来自把频道、指针、载荷和运行形态混在同一个名字里。以后按
以下七个维度表达：

| 维度 | 取值 | 含义 |
| --- | --- | --- |
| `quality_status` | Stable / Preview | 唯一质量轴；Stable 是完整生产资格，Preview 尚未取得或尚未声明该资格 |
| `build_trigger` | Manual / Automated | 构建如何触发；不单独决定质量或 Latest |
| `preview_kind` | Dev / Nightly / `null` | 只读派生值：Preview + Manual = Dev，Preview + Automated = Nightly，Stable = `null` |
| 更新指针 | Latest | 自动更新器当前选择的 exact published version；可移动且不改变质量 |
| 载荷密度 | Standard / Full | 在线收敛或预置离线 seed |
| 运行形态 | Desktop / Native WebUI / Container WebUI | 用户如何运行 App |
| 任务模式 | Development Validation / Production Release | 验证路径或正式生产编排 |

必须遵守：

1. `quality_status`、`build_trigger` 和 Latest 是互相独立的轴；Nightly 只是当前
   产品中的 automated Preview，Dev 只是 manual Preview，不是第三、第四种质量。
2. `preview_kind` 只能由前两轴派生，不得由调用方独立写入或制造非法组合。
3. `promote_quality` 只把同一 exact artifact digest 的 Preview 晋升为 Stable；
   它必须消费与直接 Stable 完全相同的门禁和 qualification receipt，不移动 Latest，
   也不得回写不可变 build manifest 来伪造质量。
4. `move_latest_pointer` 只移动自动更新指针。目标可以是任一 exact published
   Stable、Dev Preview 或 Nightly Preview，质量必须保持不变。
5. Preview 接管 Latest 必须具备用户明确要求、protected single-use authority、
   expected-current CAS、exact digest/tag 绑定和 public readback，并持续披露
   non-Stable 与 skipped/failed gates。
6. single-use authority 只授权当前一次 CAS，不形成持久 override。最新 qualified
   Stable 默认接管 Latest；下一个 qualified Stable 默认 reclaim。
7. 任一发布、晋升或指针操作失败时，现有 Latest/LKG 保持不变。
8. Canary 和单纯的开发环境覆盖没有 exact published artifact，不能成为 Latest。
9. Full 不拥有独立版本频道、更新器或 Package currentness。

### 默认与自由

下面的两层行为同时成立，不能互相替代：

| 目标 | 默认行为 | 用户明确确认后的自由行为 |
| --- | --- | --- |
| 新合格 Stable | 该载体推进自己的 `latest`；Container WebUI 同时推进 `stable` 兼容 alias | 可以不改 `latest`，或随后按 exact CAS 指到另一个已验证版本 |
| 手工 Dev/Nightly Preview | 只发布 immutable version，不自动改 `latest` 或 `stable` | 单独 dispatch 一次 protected pointer operation，把该载体 `latest` 指向该 exact Preview |
| Docker/WebUI 紧急修复 | 不等待 Desktop Stable 或 Desktop Latest | 用 exact App/Shell/Framework refs 发布 immutable Preview，再显式只改 Docker `latest`；Docker `stable`、Desktop Latest 均保持不变 |

“自由”指选择目标版本的业务权限，不是放弃身份校验：目标必须是已经公开、不可变、
已验证并且可由 carrier receipt/source authority 反向绑定的版本。工作流不接受裸
tag、裸 digest 或 `force` 作为绕过该证据链的输入。

## 当前发布侧

| 发布路径 | 当前状态 | 产物或指针 | 维护规则 |
| --- | --- | --- | --- |
| Desktop Stable GitHub Release | Active | Standard DMG/ZIP、updater metadata、prepared notes、Latest | 唯一入口是 `release-stable.yml`；qualified Stable 默认接管 Latest；`standard` / `resume_standard` / `append_full` |
| Full additive publish | Active，属于 Desktop Stable | Full DMG + manifest | 与 Standard 同 frozen Bundle/Official Profile；只增加离线 seed，不改 Latest/updater |
| Standard Homebrew Cask | Active managed | `one-person-lab` 指向 Standard DMG | Formula `opl` 承载 Base；Cask 承载 App |
| Container WebUI GHCR | Active separate carrier | immutable OCI version、`:latest`，`:stable` 为兼容 alias | Production follower 默认把合格 Stable 同时推进 `stable`/`latest`；手工 independent Preview 可独立发布，只有用户显式 promotion 才改 Docker `latest`，且不得改 `stable` 或 Desktop 指针 |
| Manual Full Preview | Active temporary non-Stable lane | 非 `v` prerelease tag、Full preview DMG | 发布默认 `make_latest=false`；独立 protected pointer operation 可选择 exact Preview，但不能暗升 Stable 或改写 Homebrew |
| Windows x64 RC Preview | 实现中，公开发布被 WSL2-only 验收阻断 | 目标为非 `v` prerelease tag、Windows x64 NSIS EXE、SHA256SUMS、Windows RC cohort | 复用 AionUI Windows/NSIS 打包，但禁止 native Windows AionCore/Codex；专属 `OPL-Linux` 自动配置、三路统一 Linux Codex、无 fallback 和 exact-byte 验收通过前不可公开 |
| Nightly | Implemented，首个公开 readback 待完成 | 自动 Standard DMG/ZIP/updater prerelease + Nightly Cask follower | 每日 schedule 默认不改 Latest；独立 protected pointer operation 可临时选择 exact Nightly；不含 Full/WebUI、不复用 Stable mutex；抽样 VM 非阻塞 |
| Full Homebrew Cask | Generator implemented, public target not promoted | 公开旧 Cask 仍指向旧 Full DMG 并依赖 Formula；目标 Cask 不依赖 Formula | 完成 pre-publication gates、受保护 CAS 发布和 post-publication readback 前不推荐 |
| Native WebUI artifacts | Linux x86_64 已公开；macOS arm64 已实现待首次发布/readback | 与 Desktop 同 tag 的平台 tarball、SHA256、共享 `install-web.sh`、平台 qualification receipt | 两个平台各自独立 qualification 和 additive publish/readback；公开字节与 exact App/Shell/Framework cohort 绑定；不改变 Container GHCR tags |
| Canary | Validation-only，不是发布路径 | 无用户产物、无 moving tag mutation | 不继承发布 secrets，不执行公开写入 |

远端“现在具体是哪一个版本”必须从对应 owner 的 fresh receipt/readback 获取，
不能从本文、README、测试通过或本地 Cask 文件推导。

### Container WebUI 紧急路径

Docker 紧急修复使用两次明确且可独立验收的操作：

```text
exact App/Shell/Framework refs
  -> source authority
  -> immutable <YY.M.D-preview.rN> OCI publication and qualification
  -> explicit user-confirmed Latest-only promotion
  -> public Stable-unchanged + Latest-exact-digest readback
```

第一步由 `release-webui-development.yml` 执行，输入是版本和三条 exact SHA；它只
发布不可变 version tag，不能写 `:latest` 或 `:stable`。第二步由
`release-webui-development-promote.yml` 执行，输入是同一 immutable carrier 的
receipt/run identity；它只能写 `:latest`，并以预先冻结的 `:stable` prestate 做
读回证明。两步均不依赖 Desktop Stable 或 Desktop Latest。

因此，紧急 Docker 修复能在 Desktop Stable 尚未发布、正在排队或失败时独立交付；
同时不会把 Preview 伪装成 Stable，也不会用 Docker 的成功或失败重写 Desktop 发布
终态。

## 当前安装侧

| 用户入口 | 当前结果 | 状态 | 建议 |
| --- | --- | --- | --- |
| GitHub Release Standard DMG | Desktop App；首启由 Framework 补齐 Base/Packages | Supported | 不使用 Homebrew 时的直接 GUI 路径 |
| GitHub Release Full DMG | Desktop App + Base/Package offline seeds | Supported | 首次离线或希望最快达到完整能力时使用 |
| Standard Homebrew Cask | Formula `opl` Base + Standard DMG App | Supported | macOS 终端用户首选 |
| Release `opl-install.sh` | macOS Desktop；Linux Native WebUI；合格新 Release 上的 macOS Native WebUI；server/isolation Container；headless Base | Implemented for next publication | 每个 Release 生成并固定 App/Shell/Framework SHA、Release tag 和下游版本；macOS Native 缺少精确资产时回退 Container；下载后先按 component manifest 校验再执行 |
| Source `install.sh` | 与公共入口共享路由逻辑 | Developer compatibility | 仅供 reviewed checkout；不得从可变 `main` 直接管道执行 |
| Stable macOS helper/wrapper | 下载 DMG、复制、显式清 quarantine、打开 App | Compatibility | 保留兼容，不再作为新用户首选 |
| Docker/WebUI 一键安装 | Container WebUI + 挂载的数据/项目目录 | Supported browser/server path | Linux/Windows/server 当前默认浏览器路径 |
| GitHub Prerelease Windows x64 EXE | Desktop App RC Preview | 尚未公开；WSL2-only 验收通过后才可进入 Opt-in Preview | 目标 EXE 自动配置专属 WSL2 环境，所有 Codex 路径使用同一 Linux Codex；native fallback、Latest、Stable 和 Homebrew 均禁止 |
| Manual Docker/Compose | 与 Docker/WebUI 相同载体 | Advanced fallback | 只用于运维和故障排查 |
| Nightly Cask | Standard Nightly + Formula `opl` | Implemented，首个 follower readback 待完成 | 仅由成功 GitHub Nightly publication 的 digest-bound follower 更新，不得改 Stable Cask |
| Full Cask | 公开旧 Cask 为 Full DMG + Formula `opl`，存在重复 Base carrier 风险 | Legacy public / target implemented unpublished | 当前改用直接 Full DMG；目标 Cask 只安装 Full DMG，不安装 Formula |
| Native WebUI | Linux x86_64 public tarball + verifier + lifecycle qualification | Supported | 个人 Linux 默认；支持首装、同版本幂等、跨版本更新、回滚和数据保留 |
| Framework headless installer | Base-only，无 App runtime form | Supported Framework boundary | 不是 OPL App 安装路径 |

## 平台默认目标

| 场景 | 当前默认 | 批准目标 |
| --- | --- | --- |
| macOS 个人电脑 | Homebrew Standard 或直接 DMG，运行 Desktop；Browser 当前可回退 Container | 保持 Desktop 默认；`--webui` 在首次合格 macOS Native 发布后优先 Native、Container 可选 |
| Linux x86_64 个人电脑 | Native WebUI；失败时可显式选择 Container WebUI | 保持 Native 默认；完成 Linux Desktop 资格后让用户在 Desktop / Browser 间选择 |
| Windows 个人电脑 | Container WebUI | Desktop RC 仅在自动 provisioning、三路统一 Linux Codex、无 native fallback 和 clean-machine RC 验收完成后开放；Stable 另需签名、升级与正式资格 |
| Server / cloud / isolation | Container WebUI | 保持 Container WebUI |
| Headless automation | Framework Base-only | 保持 Base-only |

通用一键安装器已实现的路由策略：

```text
macOS personal       -> Desktop
Linux x86_64 personal -> Native WebUI; verified Container fallback
server / isolation   -> Container WebUI (explicit)
--headless            -> OPL Base only
```

Native WebUI 的 current support 仅覆盖公开回执已证明的 Linux x86_64。macOS
arm64 Native 的代码与工作流已实现，但当前普通 Browser 体验仍需在旧 Release 上
回退 Container；只有首次同 cohort 公开资产和 readback 后才能升级为 supported。
Linux Desktop 仍必须独立补公开资产和平台资格，不能从 Native WebUI 回执外推。

## 一致终态

“所有安全渠道最后效果一致”定义为 `official_profile_converged`：

- 只存在一个 Framework-owned active Base，`active_framework_count=1`。
- App、Base、Packages 各自保持独立版本和生命周期，不要求版本号锁步。
- 所有 App 载体消费相同产品行为合同与 Official Profile 意图。
- 每个 configured carrier / Package-declared adapter 产生 fresh terminal readback；
  Framework 只聚合完整 Package 的 installed/callable 状态；operation/release receipt
  不作为 Package installed truth。
- Standard 可在线补齐；Full 只提供相同目标所需的离线 seed。
- Desktop、Native WebUI、Container WebUI 可使用不同平台字节、目录、
  service manager 和隔离方式。
- Package 发布 current stable 只由各 owner 的 per-Package GHCR `latest-stable`
  定义；本机 installed/callable 只由 carrier readback 经 Framework 聚合定义。
  两者都不绑定 Desktop、DMG、Homebrew、WebUI 或 App Release 版本。
- Package 的 immutable version tag 是 exact identity；`candidate` 是 Preview 指针，
  `latest-stable` 是 Stable/current 指针，bare `latest` 保持退休。Nightly 只表示
  automated build provenance，不另建消费 channel。
- 同一自动日更 digest 可以先作为 Nightly candidate，通过完整 Stable qualification
  后以同 digest 晋升 Stable 并更新 `latest-stable`；这表示三轴指向同一 digest，
  不是 `latest = stable = nightly` 的概念等号。失败或无变化时 `latest-stable`
  保持上一 LKG。
- 当前 Package 自动闭环仍未完成：daily workflow 只负责 fingerprint detection 和
  candidate evidence，immutable candidate publication、完整 qualification、protected
  automatic promotion 与 anonymous/public readback 仍需由 Framework/Package owner
  串成闭环。App 只记录该边界，不并写 Package authority。

因此“一致”不是下面任何一种错误要求：

- 所有载体 SHA256 相同；
- Base/App/Packages 使用同一个版本号；
- Full 创建独立长期更新频道；
- Docker 的 Linux 目录直接复制到 Native host；
- App Release 决定所有 Package 的 latest/current。

## Homebrew 规则

### Standard

`one-person-lab` Cask 安装 Standard DMG，依赖 Formula `opl` 提供 Base。
这是当前受管理的 macOS 终端入口。

### Linux 与 Browser WebUI

Homebrew 本身支持 macOS 和 Linux，但 Cask 是 macOS App bundle 载体；因此现有
`brew install --cask one-person-lab` 不能直接变成 Linux Desktop 安装命令。

技术上可以新增普通 Formula `one-person-lab-webui`，让 macOS 和 Linux 使用同一
命令安装 Browser WebUI。该 Formula 必须消费 GitHub Release 中同一 frozen Native
payload、digest 和 lifecycle contract，不能从 `main` 重新构建，也不能制造第二份
更新 authority。这个目标认知成本低、实现可行，但当前尚未实现。

Linux Desktop 也可以强行用 Formula 分发，但 `.deb`/AppImage 更符合桌面集成与
系统更新习惯。用户入口仍可保持统一：`opl-install.sh --desktop`；底层由平台选择
DMG、DEB/AppImage 或未来的 package manager carrier。

### Nightly

`one-person-lab-nightly` 使用 Standard Nightly DMG，并依赖 Formula `opl`；它从未
等同于 Full。每日 schedule 通过共享 `_build-reusable.yml` 生成 Standard 资产，
发布 immutable GitHub prerelease，随后独立 follower 只更新
`Casks/one-person-lab-nightly.rb`。它不进入 Stable Bundle/mutex，schedule 默认
不改变 Latest；只有独立 protected single-use pointer operation 才能临时选择某个
exact Nightly，且不得改变其 Preview 质量。每周抽样 clean-VM 是非阻塞发布后
follower。首个远端 publication、Cask 和抽样 receipt 出现前，只能称“实现完成、
公开 readback 待完成”，不能称通道终态已验证。

### Full

Homebrew Cask 不会把 Full DMG 拆成“GUI 部分”再另装 Base。它会安装整个 App
bundle，所以 Full DMG 内嵌的 Base/seeds 仍然存在。当前公开 `one-person-lab-full`
又额外声明 Formula `opl`，因此不是“特意剥离 Base”，而是同时引入两个 Base
carrier，产生重复物理字节和选择歧义。

批准目标是：

```text
Full Cask -> Full Stable DMG -> embedded Base/seeds -> Framework activation
Formula dependency -> absent
active Framework -> exactly one
```

生成器和合同已完成第 2 项，但在切换公开 Cask 前仍必须完成全部终态：

1. Shell 对普通、状态、repair/update 操作都选择同一 Framework-owned Base。
2. Cask 生成器只为 Standard 和 Nightly 生成 Formula
   dependency，Full 不生成。
3. Tap CI、同步逻辑和 App 合同一起更新。
4. clean VM 证明 Formula 未安装、Full 首启成功、Official Profile 收敛、
   `active_framework_count=1`。
5. 新 Cask 与 DMG digest、tap commit、安装和升级 readback 精确绑定。

### Quarantine

Homebrew 当前不会自动替 OPL 清除 quarantine。现有 VM smoke 是安装后由测试
harness 额外执行 `xattr -dr`，不能代表普通用户体验。

长期目标是 Developer ID 签名和 notarization，并保留 Homebrew/Gatekeeper
默认安全行为。签名完成前如使用本地授权，必须是显式用户动作并有 readback；
不得把隐藏 `--no-quarantine` 或测试私有补丁写成公共能力。

## Native WebUI 规则

Native WebUI 表示直接在宿主系统运行浏览器工作台，不需要 Electron，也不需要
Docker。它不是“因为 Docker 里是 Linux，所以天然已经支持”的同义推导。

当前公开支持以 `v26.7.28-r3` 为首个已验证版本：

- `one-person-lab-webui-<version>-linux-x86_64.tar.gz` 与独立 SHA256；
- `install-web.sh` 与独立 SHA256；
- exact App/Shell/Framework cohort 和 Release Bundle digest；
- non-root 首装、same-version 幂等、跨版本更新、rollback、data preservation、
  HTTP health 与 Official Profile qualification；
- GitHub authenticated/anonymous digest readback。

这些历史证据证明的是 Linux x86_64 Native carrier，不外推为 macOS Native、
Linux Desktop、WSL2 或 Docker installed truth。macOS arm64 必须由自己的
qualification receipt、公开资产和 authenticated/anonymous readback 建立支持状态。
Container 仍是独立 OCI carrier，但批准目标是包装同一 frozen WebUI runtime，只
增加基础层、mount adapter 和 entrypoint；不得独立重编译成第二套产品字节。

Container 的批准目标是包装同一 frozen Linux WebUI payload，只增加 OCI
基础层、mount adapter 和 entrypoint；它不能独立重编译成第二套产品字节。

生产拓扑为：

```text
Desktop Standard Latest complete
  -> exact handoff
  -> Native Linux x86_64 qualification + additive publish
  -> Native macOS arm64 qualification + serialized additive publish
  -> per-platform authenticated/anonymous follower readback
```

Native follower 失败不能改写 Desktop 或 Container 终态；Stable operation 仍只有
`standard`、`resume_standard`、`append_full`，Container GHCR `:latest` / `:stable`
保持现状。

## Desktop 与 WebUI cohort

当前仍是开发期双轨：

- Desktop 和 Container WebUI 可以独立开发、验证和暂时使用不同版本节奏。
- 开发发布不能声称已经是同一生产 cohort。
- 两边仍必须遵守相同产品行为合同，并通过各自 carrier / Package adapter 的
  fresh terminal readback 收敛；Framework 只聚合，不拥有第二份生命周期。

Desktop 发布路径稳定后的生产目标：

```text
one App Stable cohort/version
  -> Desktop
  -> Native WebUI
  -> Container WebUI
```

三种形态独立构建、资格验证和失败隔离；同一 App Stable cohort/version 与
Official Profile 是生产要求，平台物理字节一致不是要求。Native 或 Container
follower 失败不得撤销已经完成的 Desktop Stable/Latest。

Linux Desktop 不是架构重写。Shell 已有 Electron Linux target、`.deb` artifact
命名和 Linux updater channel 选择；真正剩余的是产品化边界：

1. 把 Linux x86_64 Desktop artifact 和 `latest-linux.yml` 纳入同一 frozen cohort。
2. 定义 `.deb`、AppImage 或二者的主次关系；若要求应用内自动更新，优先选择
   electron-updater 可完整支持的 carrier，并证明更新/回滚。
3. 完成 Linux clean-host 安装、desktop entry、权限、升级、回滚和数据保留。
4. 在上述终态出现前，Linux Desktop 保持“build capable / not supported”。

## 最优维护模型

以后只维护以下 owner 链，不再让 README、脚本或下游 Tap 各自解释产品语义：

```text
App contracts
  -> 本 SSOT
  -> build/publish/install implementation
  -> clean-host + public readback
  -> ordinary README/user guides
```

职责固定如下：

| 事实 | 唯一 owner |
| --- | --- |
| `quality_status`、`build_trigger`、派生 `preview_kind`、Latest、载体状态、cohort | `contracts/app-release-channel.json#distribution_semantics` |
| 安装入口、平台路由、Homebrew profile、统一终态 | `contracts/app-install-exposure-policy.json#distribution_install_model` |
| Base/Package 激活、installed/callable、Official Profile reconciliation | OPL Framework |
| 当前公共版本、资产、tag/digest、Tap commit | 对应远端 fresh readback/receipt |
| 普通用户说明 | README/用户指南，只消费上述事实，不自创新状态 |

维护原则：

1. 新入口优先复用 `install.sh` 路由，不新增平行的一键脚本。
2. 新载体复用同一 frozen App/WebUI payload，再增加平台 adapter；不独立编译第二套
   产品逻辑。
3. Standard 与 Full 只改变首装密度；首次启动后的管理、更新和卸载行为一致。
4. Homebrew 只负责索引和安装 App/Base carrier，不拥有 Package lifecycle。
5. 对外标记 `supported` 前必须同时具备公开不可变资产、clean-host、升级/回滚、
   数据保留、Official Profile 和 fresh public readback。
6. 临时 Dev/Nightly Preview 可以独立交付；只有独立的 protected single-use exact
   CAS operation 可以移动 Latest，且不得伪装成 Stable。下一 qualified Stable
   默认 reclaim。

## 维护与晋升规则

任何新增或变更路径必须按顺序更新：

1. 发布语义与实现状态：
   `contracts/app-release-channel.json#distribution_semantics`。
2. 用户入口、平台路由和一致终态：
   `contracts/app-install-exposure-policy.json#distribution_install_model`。
3. 本文的 current/target 表。
4. `distribution-install-ssot-validator.ts` 与 mutation tests。
5. 对应构建、安装、升级、回滚、数据保留、Official Profile、clean-host 和公开 readback。
6. 最后才可在根 README 或公共用户指南中标为当前支持。

状态晋升必须是：

```text
idea
-> approved_target
-> implementation_present
-> qualified
-> publicly_published
-> fresh_public_readback
-> supported/recommended
```

不能跳级。源码可运行、CI build、Actions artifact、测试通过、旧 Cask 存在或
文档写好都不能单独把路径晋升为 supported。

## 不在本 SSOT 中拥有的事实

- Release Bundle schema、checkpoint、receipt 与 reconcile：OPL Framework。
- Stable 的实际公共版本和 Latest：GitHub fresh readback。
- GHCR `:latest` 与 `:stable` 的实际 digest 及两者是否一致：GHCR anonymous pull readback。
- Homebrew 的实际公开 commit/Cask digest：tap publication/readback receipt。
- Package release/currentness：各 Package owner 与 Framework aggregation。
- App/Framework/Packages 的兼容关系：对应 compatibility contract。
- 历史事故与某次发布证据：`docs/delivery/release/records/` 和 incidents。
