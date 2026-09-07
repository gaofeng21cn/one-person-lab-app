# Whitepapers

Owner: `one-person-lab-app`
Purpose: `whitepaper_source_root`
State: `active`
Machine boundary: Source prose for public whitepapers. Generated HTML/PDF live
under ignored local `docs/site/latest/`; immutable build artifacts and
publication receipts live in GitHub Actions, not on `main`.

The App repo owns the prose in `opl-app-whitepaper.md` and the build inputs in
`contracts/whitepaper_profile.json`. `scripts/build-opl-app-whitepaper.ts` is a
thin local entry that delegates to the canonical renderer in the OPL Framework
repo. Set `OPL_FRAMEWORK_REPO` when the Framework checkout is not at the normal
same-workspace `one-person-lab` path.

The Framework repository owns the branded family publication bundle
and its public URL. This repository remains the source owner for App prose and
the local build profile.

This repo follows the OPL-wide whitepaper pattern:

- Keep canonical Markdown source under `docs/whitepapers/`.
- Keep the machine-readable App profile at `contracts/whitepaper_profile.json`.
- Keep the renderer, release workflow, exact-byte verification, and publication
  receipt implementation in OPL Framework.
- Generate local HTML/PDF/verification previews into the ignored
  `docs/site/latest/whitepapers/` bundle with `npm run docs:whitepaper`.
- Keep App `main` free of a second whitepaper workflow or publication token.
  The former App caller could not instantiate the Framework reusable workflow
  under App's read-only permission ceiling and has been retired.
- Public App-whitepaper updates enter the Framework-owned family bundle and are
  complete only after that bundle is published and read back from the branded
  whitepaper site.
- Do not publish whitepapers through `scripts/publish-docs-latest.sh`; that
  general docs path explicitly preserves the whitepaper surface.

Current source:

- `opl-app-whitepaper.md`

Evidence routing is documented in
[`../delivery/whitepapers/README.md`](../delivery/whitepapers/README.md).
The public family entry is
[one-person-lab/latest/whitepapers](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/).
