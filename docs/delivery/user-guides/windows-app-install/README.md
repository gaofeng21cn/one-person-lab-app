# Windows App Install Guide Delivery

Owner: `one-person-lab-app`
Purpose: `windows_app_install_guide_delivery_artifacts`
State: `active_latest_release_entry`
Machine boundary: Generated artifacts, Quarto manifest, and verification records. Human-readable guide prose is maintained under `docs/guides/windows-app-install/`.

This directory is a maintenance surface. After owner-controlled publication
and public readback, the user-facing Pages targets are:

- `https://gaofeng21cn.github.io/one-person-lab-app/latest/windows-app-install/windows-app-install.html`
- `https://gaofeng21cn.github.io/one-person-lab-app/latest/windows-app-install/windows-app-install-detailed-guide.pdf`

Canonical source and machine files:

- [`../../../guides/windows-app-install/guide.qmd`](../../../guides/windows-app-install/guide.qmd):
  long-form Windows x64 install and configuration guide.
- [`source/windows-app-install.quarto.json`](source/windows-app-install.quarto.json):
  stable Latest Release entry, output paths, and rendering manifest.
- `generated/windows-app-install.md`: generated Markdown snapshot, recreated by
  `npm run docs:windows-guide` and ignored by Git.
- `verification/windows-app-install-verification.json`: generated HTML/PDF
  verification record.

Update flow:

1. Keep all user-facing download URLs on the GitHub `releases/latest` surface;
   do not copy a version-specific tag, asset name, size, or digest into the guide.
2. Edit the QMD for user-visible steps and limitations. Read current asset
   identity and signing state from the Latest platform manifest and updater receipt.
3. Run `npm run docs:windows-guide`.
4. Review the verification JSON and rendered PDF before `npm run docs:publish`.

The guide resolves the current public Windows x64 asset through the Latest Stable
Release carrier. That publication fact does not prove WSL2 runtime acceptance, installed
behavior, signing, supported-platform completion, or release-wide readiness.
