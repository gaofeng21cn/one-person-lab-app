# OPL Persona Integration

The cross-repository design authority is
`opl-persona/docs/architecture-guidance.md` in the sibling `opl-persona`
repository. This document defines the App-side consumer boundary only.

OPL Persona enters OPL App as an ordinary Package contribution. App does not
special-case `opl-persona`, treat it as a standard agent, or copy its private
state.

The fixture in
`contracts/fixtures/opl-persona-app-contributions.fixture.json` is the v1
consumer contract:

- `persona.today` is an `activity_log` backed by `personal.context.v1#today`.
- `persona.proposals` is an `approval_diff` backed by
  `personal.context.v1#proposals`.
- approval remains an explicit command with confirmation metadata.

The fixture proves schema and local reference integrity. It does not claim that
the production navigation mount, installed Persona Package, or runtime adapter
is already released; those remain separate App/Shell gates.

## App responsibilities

OPL App is the long-term user-facing host and total entry point. It owns:

- chat, navigation, page state, and standard view rendering;
- rendering Framework-discovered and validated Package contributions;
- user review and confirmation surfaces;
- App-level acceptance and accessibility behavior.

It does not own mail storage, Persona proposals, Obsidian contents, website
deployment, or domain-specific send/publish semantics. Those remain with Relay,
Persona, Obsidian, and `gflab_web` respectively.

## Integration rule

Persona enters the App through role-neutral `app_contributions`. The App must
not add `opl-persona` special cases or turn it into an OPL standard agent. A
contribution may reference a domain read model or an opaque command, while the
actual domain action remains in the owning Package/runtime.

The first production-quality mount should prove this sequence:

```text
Package discovery
  -> Persona today/proposals read models
  -> App activity_log / approval_diff views
  -> explicit approval command
  -> owner adapter and authority readback
```

A fixture or local test is a contract checkpoint, not proof that the production
navigation and Shell renderer are installed and effective.
