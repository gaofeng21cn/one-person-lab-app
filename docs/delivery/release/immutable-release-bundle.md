# Immutable Release Bundle

This document explains the artifact boundary consumed by the App release executor.
The [release guide](README.md) owns operator commands, recovery and publication;
[`contracts/app-release-channel.json`](../../../contracts/app-release-channel.json)
owns App product policy. Framework owns Bundle identity, storage, checkpoints and
operation receipts.

A Bundle freezes the exact App, Shell and Framework source, version, prepared
notes, selected Desktop platforms, Standard inputs and any Full package closure.
Later source advancement does not invalidate those bytes. Frozen-byte drift,
qualification failure or an explicit security revocation does.

## Desktop artifacts

One Stable Bundle produces one GitHub Release/tag. Signed and notarized macOS
arm64 Standard defines the primary publication and Latest gate; macOS Full,
Linux x64, Windows x64 and installer delivery converge additively on that tag.
Failure of an additive delivery does not invalidate the published primary.
Docker WebUI has independent source authority, qualification and GHCR publication.

| Manifest | Bound artifact |
| --- | --- |
| `opl-app-component-manifest.json` | Primary Desktop carrier and frozen installer |
| `opl-release-manifest.json` | Same-tag Full DMG |
| `opl-desktop-platforms-manifest.json` | Same-tag Linux and Windows assets |
| `opl-release-attestation.json` | Publication and macOS trust evidence |

## Recovery checkpoints

Standard and Full checkpoints bind the candidate bytes and build cohort. Once Full
bytes exist, terminal qualification exports `full_qualified` on success or
`full_built` on failure. Recovery can reuse the bytes only when App, Shell and
Framework content SHAs match the requested Full cohort; otherwise it returns to
the Standard checkpoint and builds the requested candidate. A verifier repair
with unchanged artifact content does not require another build.

A Bundle or checkpoint is prepublication evidence. It does not prove publication,
Latest, target-machine installation, or domain readiness. Those claims require the
corresponding owner readback described in the release guide.
