# OPL Publishing

Owner: `one-person-lab-app`
Purpose: `opl_publishing_pipeline`
State: `active`
Machine boundary: Shared guide publishing templates and maintenance rules. Guide content, screenshots, release receipts, and runtime evidence remain in their owning guide, workflow, or release surfaces.

OPL install guides use a Quarto-first publishing pipeline:

- Human-readable body source: `docs/guides/<guide-id>/guide.qmd` and, when needed, `slides.qmd`.
- Machine metadata: guide manifest JSON.
- Screenshot provenance: `screenshots.manifest.json`.
- Published reading outputs: Quarto Book HTML and PDF under `docs/site/latest/`.
- Shared style: `docs/publishing/templates/opl-guide`.

Edit QMD for prose, manifest JSON for build paths and download inputs, screenshot
manifests for image provenance, and templates for brand or layout. Content
correctness and document structure are reviewed against current code and contracts;
keywords, minimum page counts and fixed phrases do not establish quality.

The delivery tree under `docs/delivery/user-guides/` is not the prose source.
It stores guide-specific Quarto manifests, generated Markdown/QMD snapshots, and
verification records. Do not add long-form body copy back into JSON files there.

## Templates

- [`templates/opl-guide`](templates/opl-guide/): beginner screenshot guide template for installation and onboarding manuals.
- [`templates/opl-whitepaper`](templates/opl-whitepaper/): formal whitepaper and institution-facing report template.
- [`templates/opl-quickstart`](templates/opl-quickstart/): compact setup and short guide template.

The templates are intentionally small: Quarto owns the book build, while each
template owns HTML theme selection, SCSS, and LaTeX header polish. Typst is the
preferred future PDF engine for guide-style documents, but the current stable
local engine is XeLaTeX until the OPL Typst book template is hardened and
verified with Chinese content.

## Build And Validation

Use:

```bash
npm run docs:latest
npm run docs:guides
npm run docs:whitepaper
```

The generator validates:

- QMD placeholders are resolved.
- Forbidden secret-like markers are absent.
- Referenced screenshots are declared.
- Screenshot files exist and match declared dimensions or SHA256 when provided.
- HTML and PDF are generated.
- PDF is readable, nonempty and uses the template's portrait format.

Generated HTML, Markdown, PDFs, and verification JSON are build artifacts. Do
not hand-edit them as content sources. Public HTML filenames must match the
artifact, for example `macos-app-install.html`, not `index.html`.
