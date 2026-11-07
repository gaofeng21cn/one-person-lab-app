# OPL App MCP Apps Host

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
