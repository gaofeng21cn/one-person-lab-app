<p align="center">
  <a href="./README.md">English</a> | <strong>中文</strong>
</p>

# One Person Lab 安装指南

先选择运行位置，不需要先理解发布流水线：

| 需求 | 安装路径 | 当前载体 |
| --- | --- | --- |
| 在个人电脑上使用 One Person Lab | Desktop | macOS arm64 DMG/Homebrew、Linux x64 DEB、Windows x64 EXE |
| 在 macOS 或 Linux 的浏览器中使用同一个 Desktop | Desktop 内置 WebUI | 同一 Desktop 安装包，启动时选择浏览器模式 |
| 部署到服务器、NAS 或隔离环境 | Docker WebUI | 独立 GHCR 容器产品线 |
| 只安装命令行和运行基础 | Headless | OPL Framework Base，不安装 App |

`Standard` 与 `Full` 是 Desktop 安装包的载荷密度，不是两个更新频道。当前只有
macOS arm64 同时公开 Standard 与 Full；Linux x64 和 Windows x64 使用各自同 tag
Desktop 资产。Docker WebUI 使用独立版本和 GHCR 指针，不从 Desktop Stable 继承版本、
资格或更新状态。

在 macOS arm64 上，Standard 与 Full 都会默认安装、注册并启用同一个 KimiCU
Computer Use provider。Standard 在托管安装过程中下载固定归档；Full 随包携带完全
相同的归档作为离线 seed。网络正常且安装完成后，两者的 Computer Use 版本、路径、
MCP 工具、权限模型与行为完全一致；Full 只增加离线密度，不增加第二套 provider。
macOS 仍要求用户授予 Accessibility 和 Screen Recording，授权前只影响 Computer
Use readiness，不影响普通 OPL/Codex 使用。

## 当前 Stable Desktop artifact

每个 Stable 版本只有一个 GitHub Release 和一个 `v<version>` tag。macOS Stable 发布集包含
Standard 与 Full；Standard 可以先成为 Latest，Full 随后追加到同一 tag：

- `One-Person-Lab-<version>-mac-arm64.dmg`：macOS Standard；
- `One-Person-Lab-Full-<version>-mac-arm64.dmg`：macOS Full 首次安装包，可在 Standard 之后追加；
- `One-Person-Lab-<version>-linux-x64.deb`：Linux x64 Desktop；
- `One-Person-Lab-<version>-win-x64.exe`：Windows x64 Desktop；
- `opl-install.sh`、component manifest、Desktop platform manifest 和平台更新元数据。

[打开当前 Latest Release](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

Release 上存在文件，只能证明公开载体具有这些精确字节。是否已在某台电脑完成安装、
首次启动、WSL2/Framework 运行和真实模型访问，仍需该电脑的实际回读。

## macOS arm64

macOS 首次安装推荐同 tag 的 Full DMG。它预置 Base、Package seeds 和固定的 Computer Use
归档，可减少首启在线下载；刚发布时如果 Assets 里还没有 Full，说明追加仍在进行，请等待完成后再下载。

已安装 Homebrew 且网络环境很好时，Standard 是最短的联网路径：

```bash
brew install --cask gaofeng21cn/one-person-lab/one-person-lab
open -a "One Person Lab"
```

Standard 会在托管安装和首次检查过程中下载 Base、Packages 和其他模块，需要稳定访问
GitHub、Homebrew/模块来源以及所选模型服务；例如使用 OpenAI 时，需要能够直连 OpenAI。
出现安装、首次检查或模型访问异常时，先排查网络、代理、DNS 和目标服务连通性。
Full 仍需要联网完成账户登录、模型访问和更新，但能显著降低首次安装对模块下载网络的依赖。
Full 不创建独立 Release，也不进入 Standard updater metadata。

[macOS 首次安装图文教程](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install.html)

macOS 直接安装时会先匿名读取 GitHub Release API。如果请求失败，包括 API 限流导致的
HTTP 403，只有本机已安装 `gh`，且 `gh auth` 已登录 `github.com`，安装器才会改用
`gh api` 读取同一个 `latest` 或指定标签。这个备用通道不会切换版本，也不会跳过摘要校验。
如果 GitHub CLI 不存在或登录无效，安装会在下载文件和修改目标 App 之前明确停止。

## Linux x64

Linux 使用同一 Stable tag 的 `.deb` 与 `opl-install.sh`。从 Release 下载并校验脚本后：

```bash
./opl-install.sh --desktop --standard --no-open
```

需要在 headless host 上通过浏览器访问同一个 Desktop 时：

```bash
./opl-install.sh --webui --standard --no-open
```

这里的 `--webui` 启动的是 Desktop 安装包自带的浏览器模式，不是已退役的独立 Native
WebUI tarball，也不会改用 Docker。当前没有 Linux Full 载体；显式选择 `--full` 必须停止，
不能回退到其他版本或平台。

## Windows 11 x64

Windows 从同一 Stable Release 下载 `One-Person-Lab-<version>-win-x64.exe`，并使用
Release 公布的 digest 校验文件。Windows Desktop 不要求 Docker Desktop；Docker 只在
用户明确选择独立 Container WebUI 时需要。

[Windows x64 安装与配置教程](https://gaofeng21cn.github.io/one-person-lab-app/latest/windows-app-install/windows-app-install.html)

Windows 资产公开不等于 WSL2 runtime acceptance、installed behavior、代码签名或完整
平台支持已经得到证明。教程会显示当前精确版本、SHA-256 和签名状态。

## Docker WebUI

服务器、NAS、云主机或需要容器隔离时，使用独立 Docker WebUI。普通安装默认跟随
`ghcr.io/gaofeng21cn/one-person-lab-webui:stable`；`:latest` 是显式 Preview 选择，
不会被普通安装或自动更新静默采用。

[Docker WebUI 图文安装教程](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html)

## Latest 公共安装器

macOS 与 Linux 可以使用当前 Latest Release 的 `opl-install.sh`。不要把可变 `main`
分支中的脚本直接通过管道交给 shell 执行；安装器会先把 Latest 解析为一个精确
Release，再选择平台资产：

```bash
REPO="gaofeng21cn/one-person-lab-app"
RELEASE_JSON="$(mktemp)"
trap 'rm -f "$RELEASE_JSON"' EXIT
curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" -o "$RELEASE_JSON"
TAG="$(jq -er 'if .draft or .prerelease or (.tag_name | test("^v[0-9A-Za-z._-]+$") | not) then error("Latest is not an eligible exact Release") else .tag_name end' "$RELEASE_JSON")"
BASE="https://github.com/$REPO/releases/download/$TAG"

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
```

公开安装器会从 Latest 选中的 exact Release manifest 解析平台资产、大小和 digest。缺少、重复或
身份不一致时必须停止，不能改用另一个 tag、历史文件或未经绑定的下载地址。

仓库中的 `install.sh` 只是在已审阅 source checkout 中使用的开发/恢复入口，不是公开
分发 authority。Container WebUI 由已验证的公开 `opl-install.sh` 从同一 exact Release
record 获取 Docker/WebUI installer，并保存绑定身份的本地缓存。元数据或网络中断时可以在
重新校验缓存大小/SHA-256 后继续；明确 mismatch 只拒绝本次新字节，不回退到 `main` 或未
校验的 Latest 下载。通过必需 exact Release 身份校验的字节不依赖可选 attestation 在线可用。

## Headless 与更新责任

`--headless` 只安装 OPL Framework Base/CLI，不安装 App。Headless 自动化应使用
[OPL Framework 安装说明](https://github.com/gaofeng21cn/one-person-lab#installation)，
而不是 Desktop 或 Docker WebUI 教程。

| 安装内容 | 更新责任方 |
| --- | --- |
| Desktop App | 所选 Desktop 载体；Full 仍使用 Standard 更新路径 |
| Docker WebUI | Docker WebUI host installer/管理员，默认跟随 `:stable` |
| OPL Base / Packages | Framework 与各 Package carrier |

维护侧产品边界见
[`distribution-and-install-ssot.md`](../distribution-and-install-ssot.md)。
