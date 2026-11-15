# App-Owned Packages

This directory contains independently installable capability Packages whose
source owner is One Person Lab App. It is not the complete list of plugins used
by the application. The App marketplace publishes these local source subtrees
through [its native carrier manifest](../.agents/plugins/marketplace.json).

The current Package is [OPL Channel Weixin](opl-channel-weixin/README.md).
Its [Package descriptor](opl-channel-weixin/opl-package.json) defines its
entrypoint, contributions, carrier and ownership boundary.

This is the current App-owned Package source in this repository. It is not the only independent Package source in OPL: Framework descriptors point to domain owner repositories. Those domain Packages are Framework capabilities, not DSH Host plugins.

Other plugin implementations live with their owning component:

| Component | Source location | Delivery |
| --- | --- | --- |
| Studio Host plugins | `opl-studio/plugins/<plugin-id>/`; implementation in each package src/ | Built into the App/Shell release |
| Studio client integration | `opl-studio/plugins/opl-studio-client/` | Built into the App/Shell release |
| DSH UI dependencies | Studio npm dependencies and pinned official vendor sources under `shells/opl-studio/src/vendor/deepseek-harness/` | Built into the App/Shell release |
| Framework services | `one-person-lab/src/host/` and `one-person-lab/packages/` | Framework runtime |
| Domain Agent/capability Packages | The corresponding domain repository and its declared plugin source subtree | The configured native Package carrier |

Use the [plugin organization reference](../docs/product/gui/dsh-plugin-and-settings-map.md#0-源码安装位置与开发归口)
for physical installation paths and development routing. The active Shell
checkout is selected by [the App Shell contract](../contracts/app-shell-adapter.json),
not by the presence of a sibling checkout.

Add a Package here only when App owns the capability itself. Keep domain logic
in its domain repository and Shell adapters in Studio. Each independently
installable Package must use its owner-maintained descriptor and native carrier
metadata; do not add an App-local copy of the global Package registry, installed
versions or lifecycle state. Framework supplies those projections.
