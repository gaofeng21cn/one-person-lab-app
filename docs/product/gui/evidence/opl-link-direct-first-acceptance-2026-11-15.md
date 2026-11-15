# OPL Link 直连优先验收（2026-11-15）

用户已批准落地直连优先方案。产品合同先更新为 LAN/P2P 优先、现有 WSS Relay 兜底；
复用固定 DSH Remote 协议、Noise、授权和现有 Link 业务桥。用户随后明确要求同时接入 TURN，
目标顺序为 LAN/P2P→TURN→Relay；实例实际配置后才公布 TURN 能力，凭据由后台短期签发。
STUN 默认使用公开 Cloudflare STUN，仅用于获取候选地址。当前核查可复用资源，不采购新实例或付费套餐。

先前已完成的部署和公网原生验收仅证明 Relay 路径，见[原验收记录](opl-link-internet-acceptance-2026-11-15.md)。
本轮直连实现及实际选路证据尚在完成，不能从配置或候选列表推导已经选中 P2P。
