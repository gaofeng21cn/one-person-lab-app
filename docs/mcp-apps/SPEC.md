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

The product navigation treats one MiniApp resource as one UI surface. The live
catalog may expose several App-visible tools for that resource, but the host
groups them by stable `mini_app_id` and presents one switcher entry. A declared
`ui.appId`/`ui.id` is preferred; when the standard declaration has no stable ID,
the host uses `mcp:<server>:<resourceUri>`. A read-only `launch_tool` opens the
surface. Other tools remain App-visible capabilities inside that surface and
do not become additional top-level applications. Package installation and
enablement remain in Application Management; the session switcher owns only
navigation for the current thread. See [MiniApp management and workbench](../product/gui/miniapp-management.md)
for the product IA and the MiniMax/DSH reference model.

Users select a declared MiniApp, enter any required input for its read-only
launch tool, and open its
resource inside an opaque sandbox. Completed agent calls can open their canonical
results without repeating the tool. Model-only tools may present a UI, while
the UI calls only App-visible tools on the
same server, reads declared resources, receives theme/locale/size context, and
can update context for the next user turn or prepare a message in the composer.
No mutation is repeated just to display a view. Each UI call rechecks the live
server catalog for App visibility or declared resource access; closing a view
while that check is pending prevents dispatch. A Codex connection reset invalidates
its ephemeral view bindings. Reopening reads the owner again or displays the exact
completed call without repeating its mutation. View teardown releases its host
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
independent of content type and freshness. The Framework policy and source
contract define this boundary ([knowledge and memory policy](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/knowledge-source-and-memory-policy.md),
[knowledge sources](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/knowledge-sources.md)).

Four kinds of data must remain distinct. Editable business knowledge is held by
the product, user/team, topic or project owner and has one canonical source.
Domain state is the owner's current business
fact and may be projected with a date and revision; it is not promoted to
long-term knowledge by an App cache. Runtime evidence belongs to the Framework,
runtime and relevant domain owner and records what was actually consumed. Codex
executor memory is a separate Codex-home service; its correction notes are
suggestions to that owner and do not become business knowledge or authorization.

Framework owns source bindings, accepted revisions, immutable task snapshots and
mechanical writeback evidence; the user or domain owner accepts the meaning of a
change.

App views consume the Framework-owned context and review path; they do not create
another personal knowledge store, read a Vault body directly, or infer permission
from remembered preferences. A selected working directory is an execution
boundary, not a knowledge grant. Knowledge integration is qualified through the
relevant Framework and Package implementation and installed readback, not by this
host specification.

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
