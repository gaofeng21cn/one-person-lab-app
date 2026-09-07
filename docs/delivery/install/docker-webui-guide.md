# Docker/WebUI Operator Install Guide

Owner: `one-person-lab-app`
Purpose: `docker_webui_operator_install_guide`
State: `active_support`
Machine boundary: Human-readable operator install guide and SSOT route map.
Machine policy stays in `contracts/app-install-exposure-policy.json`; readiness
evidence stays in smoke gate artifacts, release workflows, GHCR publish
receipts, shell Dockerfile/WebUI behavior, and live container smoke evidence.

This is the maintained operator entry for the Docker/WebUI beginner install
path. It does not duplicate the user guide body, public bundle, generated
Markdown, or smoke gate runbook.

## SSOT Roles

- Machine policy: [`../../../contracts/app-install-exposure-policy.json`](../../../contracts/app-install-exposure-policy.json)
  owns installer surface, data mounts, Access key transport, startup diagnostics, and
  false-ready boundaries.
- Operator guide: this file owns the maintainer-facing install route and points
  to the guide source, latest published output, and verification support.
- Verification support:
  [`docker-webui-smoke-gates.md`](docker-webui-smoke-gates.md) owns smoke gate
  commands, artifact readback, typed blockers, and completion boundaries.
- Public entry:
  [`https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html`](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html)
  is the user-facing starting point.
- Generated payload: `docs/delivery/user-guides/docker-webui-install/generated/`
  is ignored local output recreated by `npm run docs:docker-webui-guide`; it
  must not become a current truth owner.

## Canonical Entries

- Maintainer QMD source and screenshot provenance:
  [`../../guides/docker-webui-install/guide.qmd`](../../guides/docker-webui-install/guide.qmd)
- Delivery manifest, generated-output lifecycle, and verification:
  [`../user-guides/docker-webui-install/README.md`](../user-guides/docker-webui-install/README.md)
- Latest HTML:
  [`../../site/latest/docker-webui-install/docker-webui-install.html`](../../site/latest/docker-webui-install/docker-webui-install.html)
- Latest detailed PDF:
  [`../../site/latest/docker-webui-install/docker-webui-install-detailed-guide.pdf`](../../site/latest/docker-webui-install/docker-webui-install-detailed-guide.pdf)

## Operator Boundary

The beginner path is: installer, browser WebUI, account login or API key entry
in the WebUI, and first-run setup. Host `OnePersonLab/data` and
`OnePersonLab/projects` remain persistent across image updates. Credential
transport and runtime qualification belong to the smoke runbook, not the
user's installation steps.

Do not duplicate the generated guide content here. Update the Quarto body source
`../../guides/docker-webui-install/guide.qmd` for guide text, update the delivery
JSON manifest only for commands, output paths and rendering inputs,
update `../../guides/docker-webui-install/screenshots.manifest.json` for
screenshot provenance, and run `npm run docs:docker-webui-guide` instead.

Do not use this guide, generated Markdown, public README, contract tests, local
container smoke, or a clean doctor result to claim Docker/WebUI release-ready,
clean-VM-ready, production-ready, or real-install-ready status.
