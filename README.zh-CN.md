<p align="center">
  <img src="assets/branding/opl-app-logo.png" alt="One Person Lab App 标志" width="132" />
</p>

<p align="center"><a href="README.md">English</a> | <strong>中文</strong></p>

# One Person Lab App

面向复杂知识工作的本地优先 AI 工作台：开始或继续 Codex 任务，进入当前安装的
Package 提供的专业工作，查看进度并打开交付物。

<!--
Owner: one-person-lab-app
Purpose: public_product_and_installation_entry_zh_cn
State: active_public_entry
Machine boundary: 当前合同、源码和精确发布/安装证据。
-->

![One Person Lab App 用户旅程](assets/branding/opl-app-user-journey-v2.png)

## 工作台

App 将对话、项目上下文、文件、长期任务和专业入口放在同一个工作空间。首页入口
动态来自 Framework 对已安装 Agent Packages 的投影；各 Package 保留专业判断、
业务任务生命周期和交付物权威。

Codex 持有对话与执行。项目用于可选上下文和组织信息，普通任务无需先选择工作目录。
Runtime 展示 owner 提供的业务进度与执行状态，Settings 负责软件、连接和维护。

桌面产品提供 Standard 和 Full 两种载荷密度。macOS/Linux Desktop 同时提供内置
浏览器模式，也可在 headless host 上使用。Docker WebUI 是独立发布的容器产品。
云端能力通过真实 owner 投影接入；实际可用范围取决于所选部署和对应证据。

## 下载与安装

先阅读[安装指南](docs/delivery/install/README.zh-CN.md)，选择平台并完成可信下载、
摘要校验、首次启动和更新。当前桌面资产位于
[Latest Release](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)，
该 Release 的平台 manifest 持有实际文件名和摘要。

macOS arm64 首次安装优先选择当前 Release 已提供的 Full DMG，以减少在线下载。
Standard 适合升级或网络条件良好的安装。两种密度使用同一个 Official Profile；
Full 只增加离线 seed，模型服务仍需要所选账户或 provider 的连接。

| 平台或部署 | 教程 |
| --- | --- |
| macOS 桌面 | [图文安装教程](https://gaofeng21cn.github.io/one-person-lab-app/latest/macos-app-install/macos-app-install.html) |
| Windows x64 桌面 | [下载、校验与 WSL2 边界](https://gaofeng21cn.github.io/one-person-lab-app/latest/windows-app-install/windows-app-install.html) |
| Linux 桌面及内置浏览器模式 | [安装指南](docs/delivery/install/README.zh-CN.md) |
| 服务器、NAS 或隔离宿主上的 Docker | [容器安装教程](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html) |

已使用 Homebrew 的用户可安装 Standard 桌面载体：

```bash
brew install --cask gaofeng21cn/one-person-lab/one-person-lab
open -a "One Person Lab"
```

日常更新使用安装 App 的载体。Full seed 不是平行更新通道；Base、App 和 Packages
保留各自生命周期 owner，用户数据和交付物属于独立存储边界。产品支持和公开资产
存在本身不能证明实际安装运行已经验收。精确平台与交付模型见
[分发与安装参考](docs/delivery/distribution-and-install-ssot.md)。

## 隐私与信任

请阅读[隐私政策](docs/security/privacy-policy.md)和
[代码签名政策](docs/security/code-signing-policy.md)。Windows Authenticode 是可选
信誉增强；获批后可接入 [SignPath.io](https://about.signpath.io/) 和
[SignPath Foundation](https://signpath.org/) 或其他可验证服务。
每个产物必须如实标明签名状态，并通过相应下载与发布完整性校验。

## 项目

本仓负责 App 产品行为、打包与发布验收。
[One Person Lab Framework](https://github.com/gaofeng21cn/one-person-lab)
负责运行与 Package 投影，领域 Packages 负责专业判断和交付物。AionUI 是当前
活动 Shell，OPL Studio 是 foreground candidate；两者使用独立外部 checkout，
保留各自源码历史。AionCore 是未修改的官方依赖。

[App 白皮书](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/opl-app-whitepaper.html)
解释产品设计。维护者从[文档入口](docs/README.md)进入
[命令参考](scripts/README.md)或[测试指南](docs/testing/README.md)。当前源码与证据
入口见[状态页](docs/status.md)，已授权发布操作见
[发布指南](docs/delivery/release/README.md)。
