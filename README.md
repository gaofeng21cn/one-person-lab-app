<p align="center">
  <img src="assets/branding/opl-app-logo.png" alt="One Person Lab App logo" width="132" />
</p>

<p align="center"><strong>English</strong> | <a href="README.zh-CN.md">中文</a></p>

# One Person Lab App

A local-first AI workbench for complex knowledge work: start or continue Codex
tasks, enter professional work exposed by installed Packages, inspect progress
and open deliverables.

<!--
Owner: one-person-lab-app
Purpose: public_product_and_installation_entry
State: active_public_entry
Machine boundary: Current contracts, source and exact release/installed evidence.
-->

![One Person Lab App user journey](assets/branding/opl-app-user-journey-v2.png)

## Workbench

The App brings conversation, project context, files, long-running work and
professional entry points into one workspace. Home entries come dynamically
from Framework projections of installed Agent Packages. Each Package keeps its
own domain judgment, task lifecycle and deliverable authority.

Codex owns conversations and execution. A project is optional context and
organization metadata; ordinary work can start without selecting a directory.
Runtime presents owner-projected business progress and execution state, while
Settings handles software, connections and maintenance.

The desktop product supports Standard and Full payload densities. macOS/Linux
Desktop also exposes its built-in browser mode, including on headless hosts.
Docker WebUI is an independently published container product. Cloud capabilities
appear through their actual owner projections; availability is determined by
the selected deployment and its evidence.

## Download And Install

Start with the [installation guide](docs/delivery/install/README.md) for platform
selection, trusted download, digest verification, first launch and updates.
Current desktop assets are on the
[Latest Release](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest).
The exact platform manifest identifies available files and their digests.

For a new macOS arm64 installation, prefer the Full DMG when available on that
release. It includes offline seed bytes; Standard is suitable for upgrades or
well-connected installations. Full and Standard use the same Official Profile.
Model service access still requires the selected account/provider connection.

| Platform or deployment | Guide |
| --- | --- |
| macOS desktop | [Illustrated installation](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install.html) |
| Windows x64 desktop | [Download, verification and WSL2 boundary](https://gaofeng21cn.github.io/one-person-lab-app/latest/windows-app-install/windows-app-install.html) |
| Linux desktop / built-in browser mode | [Installation guide](docs/delivery/install/README.md) |
| Docker on a server, NAS or isolated host | [Container installation](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html) |

Homebrew users can install the Standard desktop carrier:

```bash
brew install --cask gaofeng21cn/one-person-lab/one-person-lab
open -a "One Person Lab"
```

Update with the carrier that installed the App. Full seed contents are not a
parallel update channel. Base, App and Packages keep separate lifecycle owners;
user data and artifacts are a separate storage boundary. Product support and
public asset presence do not by themselves prove installed runtime acceptance.
The [distribution reference](docs/delivery/distribution-and-install-ssot.md)
owns the precise platform and delivery model.

## Privacy And Trust

Read the [privacy policy](docs/security/privacy-policy.md) and
[code-signing policy](docs/security/code-signing-policy.md). Windows Authenticode
is an optional trust enhancement. An approved integration may use
[SignPath.io](https://about.signpath.io/) and
[SignPath Foundation](https://signpath.org/), or another verified provider.
Every artifact must state its actual signing status and pass its download and
release-integrity checks.

## Project

This repository owns App product behavior, packaging and release qualification.
[One Person Lab Framework](https://github.com/gaofeng21cn/one-person-lab) owns
runtime and Package projections; domain Packages own professional decisions and
artifacts. AionUI is the active Shell implementation, and OPL Studio is the
foreground candidate. Both remain external checkouts with independent source
history. AionCore is an unmodified official dependency.

The [App whitepaper](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/opl-app-whitepaper.html)
explains the product rationale. Maintainers start at the
[documentation index](docs/README.md), then the
[command reference](scripts/README.md) or [testing guide](docs/testing/README.md).
Current source/evidence routing is in [status](docs/status.md), and authorized
release operations are documented in the [release guide](docs/delivery/release/README.md).
