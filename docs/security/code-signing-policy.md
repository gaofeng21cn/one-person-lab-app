# One Person Lab App Code Signing Policy

Authenticode is an optional trust enhancement, not a Windows publication gate.
The project may use [SignPath.io](https://about.signpath.io/) with a certificate
from [SignPath Foundation](https://signpath.org/), or another verifiable
HSM-backed provider, after approval. Provider review timelines do not block
Preview, the macOS primary Stable release, Latest, or a Windows additive
delivery. Every artifact states its actual signing status; unsigned artifacts
must never be represented as signed.

This policy covers Windows artifacts built from the public
[`gaofeng21cn/one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app)
repository. A signature identifies the certificate's actual publisher and binds
the signed artifact to the verified build. When SignPath Foundation is the
approved provider, its certificate identity does not imply that it authored
the software.

## Project Roles

- Committer and reviewer: [gaofeng21cn](https://github.com/gaofeng21cn)
- Signing approver: [gaofeng21cn](https://github.com/gaofeng21cn)

Changes from contributors who do not have direct commit authority require
review before merge. Every signing request requires an explicit manual approval
from the signing approver. Build success alone never authorizes signing or
publication, and signing approval is independent from release authority.

## Source And Build Integrity

- Signing inputs must be produced by a GitHub-hosted runner from the reviewed
  source and build scripts in this repository.
- The unsigned input is uploaded as an immutable GitHub Actions artifact before
  submission to the approved signing provider.
- A SignPath integration must verify the GitHub workflow origin before signing.
- Rerunning an old workflow does not make it a current signing candidate. A new
  candidate must bind fresh source, workflow, artifact, and approval identities.
- No Authenticode private key or exportable certificate is stored in GitHub
  Actions secrets or on a maintainer workstation.

## What We Sign

The project signs only One Person Lab application executables and installers
built from source maintained by this project. Third-party and upstream
open-source binaries may be included in an installer under their own licenses,
but they are not re-signed as if One Person Lab authored them.

Nested project-owned executables are signed before packaging when the artifact
configuration supports it. The final Windows installer is signed and RFC 3161
timestamped after packaging. Authenticode changes executable bytes, so updater
metadata, blockmaps, checksums, manifests, and release receipts must be
generated from and verified against the final signed bytes.

## Verification And Publication

A Windows candidate is publishable when immutable source and release authority,
exact SHA-256/SHA-512 and size bindings, updater metadata, blockmap, manifest,
and channel qualification pass. Its machine-readable updater receipt must say
either `unsigned` or `valid_timestamped_authenticode`. An unsigned candidate
retains the documented SmartScreen warning but is not blocked on a certificate
provider.

When a signature is present, it is accepted only when all of the following are
true:

1. Windows reports a valid Authenticode signature and timestamp chain.
2. The signer identity matches the certificate approved for that signing operation.
3. The signed file digest and size match updater metadata, checksums, manifests,
   and the candidate receipt.
4. The candidate passes the required clean-install and upgrade qualification for
   its release channel.
5. Publication uses a separately authorized, immutable operation. Signing does
   not move Stable, Latest, or any release pointer by itself.

Self-signed, expired, revoked, digest-mismatched, or unapproved signatures fail
closed and must not be represented as production-signed. An honestly declared
unsigned artifact is allowed only through the unsigned channel policy above.

## Privacy And User Safety

The [One Person Lab App privacy policy](privacy-policy.md) describes network
transfers, support flows, local data, and official crash-reporting behavior.
Installers must announce system changes and provide an uninstall path. Default
uninstall preserves user projects and separately owned runtime data unless the
user explicitly chooses a documented owner-specific cleanup operation.

## Reporting A Concern

Report project security or signing concerns through
[One Person Lab App issues](https://github.com/gaofeng21cn/one-person-lab-app/issues)
or to `support@signpath.io` when the concern involves a SignPath signature.
Verified policy violations can pause signing and can require certificate or
artifact revocation.

## 中文摘要

Windows Authenticode 是可选信誉增强，不再是 Preview、Stable 基础发布、Latest 或显式
Windows 同 tag 追加交付的阻断条件。SignPath Foundation 或其他 HSM 托管服务获批后仍可
接入；有签名时继续严格校验身份、时间戳和最终字节，无签名时 receipt 必须明确写 `unsigned`，
并保留 SmartScreen 风险提示。两种路径都必须校验 immutable Release、来源、摘要、size、
blockmap、updater metadata、manifest 和安装结果；任何未签名产物都不得冒充已签名。
