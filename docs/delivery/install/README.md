# One Person Lab 安装指南

先选择使用体验，不需要先理解发布渠道：

| 我想要 | 选择 |
| --- | --- |
| 独立应用窗口、系统菜单和桌面集成 | Desktop |
| 在浏览器使用工作台 | WebUI |
| 服务器、NAS、隔离部署 | Container WebUI |
| 只要命令行和运行基础 | Headless |

## 统一入口

从包含 `opl-install.sh` 的 GitHub Release 开始，macOS 和 Linux 使用同一个、
按版本冻结的入口。不要把可变 `main` 分支脚本直接管道执行。

```bash
VERSION=<release-version>
BASE="https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${VERSION}"

curl -fLO "${BASE}/opl-install.sh"
curl -fLO "${BASE}/opl-app-component-manifest.json"

EXPECTED="$(
  jq -r '.artifacts[] | select(.name == "opl-install.sh") | .digest | sub("^sha256:"; "")' \
    opl-app-component-manifest.json
)"
if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 opl-install.sh | awk '{print $1}')"
else
  ACTUAL="$(sha256sum opl-install.sh | awk '{print $1}')"
fi
test -n "$EXPECTED" && test "$ACTUAL" = "$EXPECTED"

chmod 0755 opl-install.sh
./opl-install.sh
```

默认路由：

```text
macOS personal        -> Desktop
Linux x86_64 personal -> Native WebUI
server / isolated     -> Container WebUI
--headless             -> OPL Base only
```

也可以显式选择：

```bash
./opl-install.sh --desktop
./opl-install.sh --webui
./opl-install.sh --native-webui
./opl-install.sh --container-webui
./opl-install.sh --headless
```

`--desktop` is currently a macOS Desktop route. Linux Desktop artifacts are
build-capable but remain outside ordinary support until the Linux package,
desktop integration, updater metadata, upgrade/rollback, and clean-host
qualification are published together.

`--webui` 是用户级选择：Linux 优先使用已验证的 Native WebUI；macOS 会在所选
Release 同时包含精确 `darwin-arm64` 资产和资格回执时优先 Native，否则回退
Container；Windows 当前使用 Container。版本冻结的入口会让 Container 使用同一
显示版本的 GHCR tag，而不是可变 `latest`。`--native-webui` 和
`--container-webui` 是需要固定部署载体时的高级选择。

## 当前支持矩阵

| 平台 | Desktop | Browser WebUI | 推荐入口 |
| --- | --- | --- | --- |
| macOS arm64 | 支持：DMG / Homebrew / `opl-install.sh` | 当前支持 Container；Native 已实现，待首次同 cohort 发布/readback | 日常个人电脑优先 Desktop |
| Linux x86_64 | 构建能力存在，公开资格尚未完成 | 支持：Native WebUI；Container 可选 | `opl-install.sh --webui` |
| Windows 11 x64 | 尚未进入普通 Stable 支持 | 支持：Docker Desktop / WSL2 container | Docker/WebUI guide |
| Server / NAS / VM | 不推荐 Desktop | 支持：Container；当前不走 Native | `--server` 或 `--container-webui` |

Linux Desktop 不是新产品。它与 macOS Desktop 共用 Electron App 和产品合同，
但仍需补齐 Linux 公开包、更新元数据、桌面集成、升级/回滚与 clean-host 资格，
完成前不能把“可构建 `.deb`”写成普通用户支持。

## 当前 Native Linux 安装

`v26.7.28-r3` 是首个公开、digest-bound 的 Linux x86_64 Native WebUI 版本。
它包含 tarball、SHA256、`install-web.sh` 和资格回执。对尚未包含
`opl-install.sh` 的版本，使用同一 Release 内的精确安装器：

```bash
TAG=v26.7.28-r3
BASE="https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${TAG}"

curl -fLO "${BASE}/install-web.sh"
curl -fLO "${BASE}/install-web.sh.sha256"
shasum -a 256 -c install-web.sh.sha256
chmod 0755 install-web.sh
./install-web.sh --version 26.7.28-r3
```

更新时重新运行同一安装入口；回滚使用：

```bash
./install-web.sh --rollback
```

该路径已验证 non-root 首装、same-version 幂等、跨版本更新、回滚、数据保留、
HTTP health 和 Official Profile。

## Homebrew

当前 Homebrew 入口：

```bash
# macOS Desktop
brew install --cask gaofeng21cn/one-person-lab/one-person-lab

# macOS / Linux 的 OPL Base/CLI
brew install gaofeng21cn/one-person-lab/opl
```

Homebrew 支持 Linux，但 Cask 是 macOS App bundle 载体，所以现有 Desktop Cask
不能在 Linux 上安装。技术上可以新增普通 Formula `one-person-lab-webui`，让
macOS/Linux 用同一命令安装 Browser WebUI；它应消费同一 GitHub Release 的
frozen Native payload，而不是重新构建一套字节。该 Formula 是已批准的可行目标，
当前尚未实现。

## 更新归属

| 安装方式 | 谁负责更新 |
| --- | --- |
| Desktop DMG | App updater |
| Desktop Homebrew Cask | Homebrew |
| Native WebUI | `opl-install.sh` / `install-web.sh` |
| Container WebUI | Docker/GHCR installer |
| OPL Base / Packages | Framework managed update |

Standard 和 Full 只表示 Desktop 首装载荷密度，不是两套更新频道。Native 和
Container 只表示 WebUI 的部署载体，不是两套产品。

产品与维护边界见
[`../distribution-and-install-ssot.md`](../distribution-and-install-ssot.md)。
