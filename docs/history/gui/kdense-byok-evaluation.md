# K-Dense BYOK Snapshot Evaluation

Owner: `one-person-lab-app`
Purpose: `external_learning_landing`
State: `historical_external_evaluation`
Currentness boundary: This is an immutable evaluation of the recorded upstream snapshot,
not current package selection or product architecture. Implementation choices follow current owner contracts.
Machine boundary: Human-readable external learning record. It does not change
App contracts, shell code, OPL Framework runtime truth, provider truth, release
owner receipts, or domain artifact authority.

## Source Evidence

- Repository: `https://github.com/K-Dense-AI/k-dense-byok.git`
- Local source path read: `/tmp/k-dense-byok`
- Snapshot commit: `dccc7ec4d034a00d7662eaabb3f5916bc3d00602`
  (`docs: update README to include application screenshot`)
- Release context at the recorded snapshot: `v0.6.0` was the latest tag; `server/package.json` reports
  version `0.6.0`.
- File categories read: README and user docs; architecture, installation,
  MCP, sub-agent, model, workflow, and limitation docs; server package and
  selected agent/API source; web package and selected UI source; static model
  and workflow catalogues.

## Classification

| Candidate pattern | Class | Local owner surface | Landing rule |
| --- | --- | --- | --- |
| MCP server connection model: per-project config, stdio/HTTP transports, test-before-save, and official MCP SDK wrapping. | adopt | OPL Connect | Reuse `@modelcontextprotocol/sdk` and expose connector readiness as OPL Connect refs grouped by user purpose. The ordinary UI label remains External Tools / OPL Connect; MCP is technical detail. |
| Scientific specialist roster and delegation prompts. | adapt | assistant workflow starters | Map into App-owned assistant starters and packaged skill profiles only. Do not turn K-Dense specialist names into domain readiness or new App authority. |
| Workflow template library and launch forms. | adapt | assistant workflow starters, App action/confirmation | Use as a pattern for purpose-first starters with explicit required inputs and confirmation. Execution still goes through App action routes or Framework producers. |
| Inline interview/question form before ambiguous or expensive work. | adapt | App action/confirmation | Reuse the confirmation-drawer rule already in Settings: show what changes, what does not change, and which receipt or rollback ref exists before mutation. |
| Project/session cost ledger and spend cap. | adapt | OPL Console, artifact provenance refs | Display quota, spend, and cost refs when Framework or Console producers provide them. The App does not become billing authority or a ledger writer. |
| Modal compute selector and `modal_run` sandbox offload. | watch_only | OPL Fabric, OPL Console | Treat Modal as an adapter-only implementation reference for compute refs. OPL Fabric owns compute/storage/environment refs; Console owns approval, quota, billing, and policy. Do not make Modal the App runtime substrate. |
| Local file sandbox, chat tabs, project files, and session persistence. | adapt | artifact provenance refs | Keep App display refs-only: session, run, artifact, cost, and provenance refs can be shown, but artifact bodies and domain verdicts stay with Framework/domain producers. |
| Markdown rendering, Mermaid, math, code, and LaTeX editing experience. | adopt | active shell rendering surfaces | Prefer maintained OSS render/editor modules over hand-rolled parsers or renderers. Use them only inside App-owned page contracts and shell adapter boundaries. |
| Pi SDK agent runtime, Fastify API server, and Next.js web app as the application backbone. | reject | App shell adapter, OPL Framework producer refs | These are implementation material for K-Dense, not App architecture. The App keeps Codex fixed executor, AionUI shell adapter, App contracts, and Framework state/action producers. |

## Reuse-First Module List

When an App or shell implementation lane needs the same capability class, use
existing OSS modules before writing custom infrastructure:

- `@modelcontextprotocol/sdk` for MCP client transports and tool discovery.
- CodeMirror or Monaco for code/LaTeX editing surfaces.
- `streamdown` or `react-markdown` for streamed Markdown rendering.
- Mermaid for diagrams.
- KaTeX for math rendering.
- `zod` for typed input/config parsing when the implementation surface already
  carries schema validation work.

Do not add a new dependency only to satisfy this document. If a capability
already exists in the active shell or Framework producer, consume that surface
first.

## Non-Authority Rule

External learning can produce App docs, App contracts, page-state expectations,
tests, or Framework producer-ref requests. It must not create a second runtime,
domain, provider, billing, artifact, owner-receipt, or release-readiness truth.
