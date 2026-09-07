# One Person Lab App Documentation

This is the maintainer documentation entry. App owns product and delivery;
Framework and Package owners retain runtime and domain truth. Public installation
instructions begin at the root [README](../README.md) or its [Chinese edition](../README.zh-CN.md).

## Repository

| Question | Document |
| --- | --- |
| What does this repository own? | [Project](project.md) |
| How do components and owners connect? | [Architecture](architecture.md) |
| Which cross-cutting constraints apply? | [Invariants](invariants.md) |
| Why were durable choices made? | [Decisions](decisions.md) |
| What is the current source/evidence boundary? | [Status](status.md) |
| What work remains and who owns it? | [Active gaps](active/app-ideal-state-gap-plan.md) |
| How are documents maintained and retired? | [Documentation lifecycle](docs_portfolio_consolidation.md) |

## Product And Engineering

| Topic | Entry |
| --- | --- |
| GUI function, interaction, visuals and carrier conformance | [GUI](product/gui/README.md) |
| Package and capability consumption | [Capability governance](capability-governance.md) |
| Package successor cutover and legacy deletion | [Package migration](active/opl-package-platform-composition-migration.md) |
| Product integrations | [Product docs](product/README.md) |
| AionUI runtime composition | [Codex carrier](architecture/aioncore-codex-only-carrier.md) |
| Windows execution | [Windows architecture](architecture/windows-wsl2-execution.md) |
| Verification and command reference | [Testing](testing/README.md), [Scripts](../scripts/README.md) |

## Delivery And Publication

| Topic | Entry |
| --- | --- |
| Distribution and installer identity | [Distribution reference](delivery/distribution-and-install-ssot.md) |
| Release operations, guide inputs and exact-cohort evidence | [Delivery](delivery/README.md) |
| Install routes | [English](delivery/install/README.md), [Chinese](delivery/install/README.zh-CN.md) |
| Guide rendering | [Publishing](publishing/README.md) |
| App whitepaper source and family publication | [Whitepapers](whitepapers/README.md) |
| Generated latest output | [Site](site/README.md) |
| Signing and privacy | [Signing](security/code-signing-policy.md), [Privacy](security/privacy-policy.md) |
| Retained historical evidence | [History](history/README.md) |

The App whitepaper is published by the Framework family publisher:
[HTML](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/opl-app-whitepaper.html)
and [PDF](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/opl-app-whitepaper.pdf).
Install-guide publication and generated output routing are documented in [Site](site/README.md).
An index link is not evidence that a public artifact is current or available.
