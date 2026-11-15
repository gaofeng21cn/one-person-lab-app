# OPL Channel Weixin

`opl-channel-weixin` is the OPL App-owned Weixin iLink channel capability
Package for OPL Studio, the Shell selected by the current
[App Shell contract](../../contracts/app-shell-adapter.json). It lives under
`packages/opl-channel-weixin` in the public App repository and owns Weixin
transport lifecycle only. OPL Framework remains the composition host for this
Package route, and the Codex App Server remains the sole thread and turn authority.

The historical AionUI integration used AionCore's built-in Weixin provider and
must not activate this Package provider. Package installation through the App
Official Profile is availability only; each GUI must have exactly one active
Weixin provider path. Source presence does not establish installation, Host
attachment or a live Weixin login. See the [Package directory guide](../README.md)
for the other plugin source owners.

## Current boundary

- Stable provider identity: `opl-channel-weixin` (`0.2.0`).
- The installed entrypoint exports a zero-argument factory. Each invocation
  returns a fresh `ChannelProvider` for one host attachment. Framework injects
  only the bounded callback; the provider's explicit QR login action keeps the
  resulting account and token in memory for the active session. No environment
  or workspace inference is performed.
- The installed descriptor declares one declarative `channel_access` view.
  Its descriptor-bound controller exposes only the declared state, connect,
  and disconnect refs. QR challenges, login progress, and the active account
  remain in memory and disappear on expiry, logout, or Host teardown.
- The injected callback surface is exactly `startThread`, `resumeThread`,
  `startTurn`, and `subscribeTurn`, with callback API version `1.0.0`.
- Every inbound message forwards the exact
  `provider_id + account_id + channel_session_id` identity to `startThread`.
  Only callback-returned `canonical_thread_host` and `canonical_thread_id` are
  used for resume and turn start.
- Secrets, conversations, bindings, canonical thread IDs, and turn IDs are not
  persisted. The provider keeps only its current long-poll cursor and active
  disposables in memory and clears them on stop.
- Completed turns send their text through iLink `sendmessage`. Failed,
  cancelled, mismatched, or empty terminal events emit bounded diagnostics and
  never fabricate a successful reply.

## Host usage

This example describes the Framework-hosted Studio integration, not AionUI:

```ts
import {
  CHANNEL_CALLBACK_API_VERSION,
  createInstalledWeixinChannelProvider,
} from '@one-person-lab/opl-channel-weixin';

const weixinChannelProvider = createInstalledWeixinChannelProvider();
const lifecycle = await weixinChannelProvider.start({
  callback_api_version: CHANNEL_CALLBACK_API_VERSION,
  callback: shellInjectedCallback,
});

const session = await weixinChannelProvider.loginWithQr({
  qr: {
    onQrCode: presentQrCode,
    onStatus: presentLoginStatus,
  },
  onDiagnostic: (event) => logger.warn(event),
});

// Explicit logout clears the in-memory token while keeping the host attached.
await weixinChannelProvider.logout();

// During host teardown:
await lifecycle.dispose();
```

The low-level `createWeixinChannelProvider` and `loginWithWeixinQr` exports
remain available for direct transport tests and owner-controlled adapters. The
installed descriptor points to `createInstalledWeixinChannelProvider`. Each
factory invocation returns a new instance whose `start()` method is
intentionally dormant until the Framework-owned contribution action starts
`loginWithQr()` or an owner-controlled adapter calls it directly.

## Installation

The configured native carrier is the Codex Plugin Manager. The App repository
is a Git-backed marketplace, and its plugin source is the
`packages/opl-channel-weixin` subtree. The installed selector remains
`opl-channel-weixin@one-person-lab-app`.

Once the Package projection is present in OPL Framework, use the owner-routed
install command:

```bash
opl packages install opl-channel-weixin --json
```

For direct carrier diagnosis, the equivalent Codex commands are:

```bash
codex plugin marketplace add gaofeng21cn/one-person-lab-app --json
codex plugin add opl-channel-weixin@one-person-lab-app --json
```

This App-owned Package has no separate GHCR publication. The Git-backed
marketplace source and the configured Codex native carrier are the installation
authority. Installed Plugin bytes, a Studio Host attachment, and live
Weixin login remain separate evidence surfaces. AionUI must not attach this
provider.

## Verification status

The nested Package proves source behavior with fake HTTP and callback tests.
Its Package descriptor and marketplace file declare the carrier route, but
source bytes alone do not prove publication, installation, active Host
attachment, or a live Weixin callback. Those states require their own current
readback.

## Attribution

The iLink request/response semantics were independently adapted from AionCore
`v0.1.57`, commit `4452a3a72ebb612f3ddd4402aeb5542187a6fbdf`, tree
`a20f8a6276966c681a8e3333949915bb1cddb2b3`, under Apache License 2.0. See
`NOTICE` for the exact retained boundary.


## Official protocol compatibility

The binding transport follows Tencent's published
`@tencent-weixin/openclaw-weixin@3.0.0-beta-0` beta (npm tarball SHA-1
`912a746c80be9ca9b5a24f854891ea5c03f265fb`); `latest` remains `2.4.10`.
Use Settings → Connections & Deployment → Remote connections & web access.
Self binding directly presents the bot QR. Binding another person's bot first
asks the operator to scan the real-name authorization QR, then presents the
actual user's bot QR. Server-requested phone PINs are submitted against a
single current challenge; mismatches issue a fresh challenge and blocked
attempts stop with an actionable reason. Tokens, PINs and authorization tickets
remain transient. QR creation uses the official POST shape, and scan/IDC redirect
states follow the current protocol. Inbound messages are restricted to the
binding owner when Weixin supplies their user ID.

The official plugin is an OpenClaw host extension, not a standalone transport
SDK. Loading it would introduce OpenClaw account/session ownership. OPL therefore
adapts its public wire semantics in the existing ChannelProvider while retaining
Framework composition and Codex thread/turn ownership. The App standard renderer
owns the human binding interaction. This does not add OpenClaw as another runtime.
