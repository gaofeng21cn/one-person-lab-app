# OPL App MCP Apps Host

OPL Agent Apps is the shared development model for Agent-native applications.
An OPL MiniApp is an on-demand human collaboration surface within that model;
Packages remain the installation unit. The
[Framework specification](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/agent-native-app-policy.md)
owns the shared technical standard, and the
[development guide](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/mcp-apps/development.md)
owns its implementation path. This document owns the App host's navigation,
handoff and interaction acceptance. It introduces no plugin format or protocol.

The DSH capability workspace renders standard MCP Apps from the existing Codex
thread MCP catalog. Reuse the official ext-apps AppBridge and the persistent
Codex App Server connection, approval, and authentication owners.

Users select a declared read-only UI tool, enter any required input, and open its
resource inside an opaque sandbox. Completed agent calls can open their canonical
results without repeating the tool. Model-only tools may present a UI, while
the UI calls only App-visible tools on the
same server, reads declared resources, receives theme/locale/size context, and
can update context for the next user turn or prepare a message in the composer.
No mutation is repeated just to display a view. View teardown releases its host
binding. Standard text and base64 HTML resources are limited to 8 MiB, with CSP
metadata from resource listing/readback. Unsupported resources retain the
existing typed views/browser fallback. Sampling and subscriptions are not
advertised by this host.

Validate the shared OPL Apps resource and Relay's dedicated workbench, plus
synthetic read/confirm/cancel flows, server isolation and stale-session rejection.
Source, browser interaction, installed App and release evidence are separate.

## Shared service consumption

Agent tools and views use the same domain operation and canonical result. Shared
declarative views, dedicated MCP Apps and professional native applications can
coexist; the interaction selects the presentation form. View disposal releases
the host binding, while durable work remains owned by its existing runtime.

Connection access uses OPL Connect's trusted installed-Package binding and current
grants. Providers retain credential storage and renewal. A view selection or an
App-visible tool does not confer business authorization. The host supplies only
the connection references and operations actually exposed by that trusted path.

The shared knowledge design binds authorized source material and freezes the
version used by a task. User-maintained Markdown, including an Obsidian vault,
can remain the sole editable source; a workspace can supply the source when no
personal library exists. Product, user/team, topic and project ownership are
independent of content type and freshness. App views consume the Framework-owned
context and review path; they do not create another personal knowledge store or
infer permission from remembered preferences. Knowledge integration is qualified
through the relevant Framework and Package implementation and installed readback,
not by this host specification.

## Shared task workbench

`@one-person-lab/opl-mcp-apps` is a standard DSH npm plugin. Cordis injects the
existing Codex connection, owns Host service disposal, and loads the client view
through the DSH ModuleLoader. It adds no runtime or credential authority. The
plugin is bundled with all Studio carriers; publishing a separate npm service is
not required. The pinned official DSH MCP client has tools and resources but no
MCP Apps UI host; revisit this gap on an upstream upgrade.

Studio retains the cross-Agent overview and compact stage summary. Task and
research detail entries open `open_opl_apps` with the exact canonical item ID and
optional declared domain view ID. The same Framework resource runs in Codex and
Studio. Its workbench presents execution progress, declared research paths,
evidence/artifacts and pending human decisions. Missing connections or domain
views fail locally and leave the overview usable.

Research nodes and relationships retain owner-authored supporting/opposing
evidence, sources, failed routes and review references. Execution stages never
imply scientific support. Domain reads retain identity, schema and revision
checks; incompatible views are unavailable rather than rendered as opaque JSON.
The shared resource replaces the Studio research renderer after equivalent
interaction acceptance. Domain actions continue through declared owner commands
and the existing confirmation dialog; viewing or selecting evidence never writes.
