# Latest Published Docs

Owner: `one-person-lab-app`
Purpose: `latest_published_docs_output_boundary`
State: `active_support`
Machine boundary: `docs/site/latest/` is local generated output for GitHub
Pages. It is not tracked on `main`.
Source truth stays in `docs/guides/`, `docs/whitepapers/`, `docs/publishing/`,
`contracts/whitepaper_profile.json`, and `docs/delivery/` evidence routing.

The App exposes one current user-facing documentation set, not one copy per
release. Install guides can still be built locally and published with
`npm run docs:publish`. The App whitepaper is previewed locally with
`npm run docs:whitepaper`; App `main` carries no second publication workflow or
write token. Public whitepaper updates use the Framework-owned family publication at
[one-person-lab/latest/whitepapers](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/).
The App repository owns its source prose and local preview profile; it has no
independent public whitepaper target.
Generated HTML files use artifact-aligned names such as
`macos-app-install.html`, not `index.html`.

Tracked source:

- User guide prose: `docs/guides/**`.
- Whitepaper prose: `docs/whitepapers/**`.
- Publishing templates: `docs/publishing/**`.
- Generation manifests and evidence routing: `docs/delivery/**`.

Generated output:

- `docs/site/latest/macos-app-install/macos-app-install.html`
- `docs/site/latest/macos-app-install/macos-app-install-detailed-guide.pdf`
- `docs/site/latest/macos-app-install/macos-app-install-slides.pdf`
- `docs/site/latest/macos-app-install/macos-app-install-slides.pptx`
- `docs/site/latest/windows-app-install/windows-app-install.html`
- `docs/site/latest/windows-app-install/windows-app-install-detailed-guide.pdf`
- `docs/site/latest/docker-webui-install/docker-webui-install.html`
- `docs/site/latest/docker-webui-install/docker-webui-install-detailed-guide.pdf`
- `docs/site/latest/whitepapers/opl-app-whitepaper.html`
- `docs/site/latest/whitepapers/opl-app-whitepaper.pdf`

Do not commit `docs/site/latest/` on `main`. `npm run docs:latest` rebuilds local
previews, while `npm run docs:publish` publishes only the macOS, Windows, and
Docker install guide allowlist and preserves `latest/whitepapers/`. Obsolete
guide directories are removed from Pages during publication. Whitepaper publication
and exact-byte public readback belong to the Framework publisher. Remove local generated copies with
`npm run cleanup:local-artifacts -- --scope docs --execute` when they are no
longer needed for preview.
