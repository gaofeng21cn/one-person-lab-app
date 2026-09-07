# OPL App 像素验收协议

Owner: `one-person-lab-app`
Purpose: `app_visual_evidence_acceptance_protocol`
State: `active`
Machine boundary: 场景、阈值、批准状态和证据格式归
`contracts/app-gui-visual-reference-cohort.json`；本文只解释如何取得和判断视觉证据。

## 职责

本文负责像素比较与验收，不定义产品能力、视觉 token、上游升级流程或当前完成度。
设计值见 [视觉系统](visual-system.md)，上游来源推进见
[GUI 维护政策](gui-maintenance-policy.md)，当前证据入口见
[Shell conformance](shell-conformance-matrix.md)。

固定 DeepSeek Harness cohort 提供普通图标、theme token 与 primitive geometry；
ChatGPT Codex 观察只提供历史工作流、空间关系与交互位置参考。正式像素 reference 来自
OPL App 自有、经人工批准的 baseline。外部 App 安装包或历史 build 不构成
Pixel、Install、Release 或 Stable 的依赖。

## Reference 准入

每次比较读取当前 machine cohort 的场景清单、viewport、主题、语言、阈值和 mask policy，
不在本文复制一份数值。Reference 目录必须包含 `baseline-approval-receipt.json`，其 SHA-256
匹配 cohort，且绑定 baseline ID、reviewer、reviewed-at、`human_visual_review`、总 verdict
及全部 scene 的 PNG 名称、SHA-256 和逐场景 verdict。

只有所有要求场景均获 `accepted` 且图片字节未漂移，reference 才可用于正式比较。
Comparator 验证 receipt 和 PNG 的完整性；它不能自动生成或替代人工批准。
缺少批准时可以采集和检查候选图，但不能声明 parity。

## 采集与比较

1. 绑定 exact App contract、Shell commit、package 或 dev build identity、OS、架构、系统缩放、
   字体偏好、viewport、DPR、theme、locale、route、fixture 和交互状态。
2. 确认 requested/resolved route 与 expected/visible title 一致，页面非空、资源已渲染，
   再采集原图；不把错误页面归入目标场景。
3. 以同名 reference/candidate PNG 做同尺寸比较。缺图、尺寸不同、未声明动态区域、
   mask 超出合同范围或原图 SHA 不符均使该场景失败。
4. 使用合同阈值运行 pixel diff，并逐场景人工检查层级、截断、重叠、对比度、入口保留和尺寸稳定性。
   数值通过只是必要条件，人工 verdict 与 exact PNG SHA 必须同时存在。
5. 按声明的 scope 检查 light/dark、zh-CN/en-US、desktop/narrow，以及 hover、focus、disabled、
   loading、error、streaming 等状态。Runtime 是核心 Agent 工作入口，应按当前页面合同纳入受影响场景。

重点保护 rail、Home、timeline、composer 与 Environment 的主工作流。
Settings 按全部受影响 route 检查单一选中态、对象附近动作、flat rows、图标与文字对比度，
不能用 Settings 截图替代核心工作区证据。

## 证据结论

| 证据 | 可证明 | 尚不能证明 |
| --- | --- | --- |
| Contract / source / focused DOM | 结构约束和被执行的行为检查 | 实际像素、安装或发布 |
| Source screenshot | 指定 source 在指定环境渲染的状态 | Packaged 或 installed 行为 |
| Package-bound screenshot | 指定 package 的场景与布局 | 安装路径、完整 parity 或发布 |
| Approved baseline + pixel diff + human verdict | Exact scene 的 visual parity | 未覆盖场景、安装或发布 |
| Installed user-path evidence | Exact 安装包在目标环境的可见与交互结果 | 独立 release admission |

真实 keyboard traversal、screen-reader、rendered contrast 与安装版 readback 分别取证；
CSS、单元测试或单张截图不能外推这些结果。发布结论仍使用 release owner 的公开制品与运行回读。

## 生命周期

本协议随比较器和机器 cohort 的语义变化更新。每轮采集结果写入独立 exact-cohort manifest，
不把候选 SHA、测试计数、task ID、待办或固定 `pending/complete` 值追加到本文。
旧 manifest 保留原始 bytes 和历史身份；source 或合同改变后，它不再代表 current pixels。
