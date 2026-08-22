# DAO 治理设计

## 1. 治理对象

- Policy Proposal：调整目标、限额、白名单或 PID 参数。
- Treasury Action：交换、存取、再平衡等资产动作。
- Role Proposal：授予/撤销管理与执行权限。
- Emergency Action：暂停、撤销队列或降低风险敞口。

## 2. 生命周期

`DRAFT → REVIEW → PUBLISHED → PENDING → ACTIVE → SUCCEEDED/DEFEATED → QUEUED → EXECUTED/EXPIRED`

AEOS 映射底层 Governor/Snapshot/Safe 的状态，但不伪造链上最终性。每次同步记录区块号与确认数。

## 3. 提案内容

- 标题、摘要、动机和预期结果。
- 决策 ID、Evidence Snapshot 哈希和未解决异议。
- 人类可读动作与精确 targets/values/calldatas。
- 模拟区块、资产变化、gas、滑点和风险检查。
- 投票参数、时间锁、过期时间和回滚/应急计划。

## 4. 权限建议

- Proposer：创建草稿和提交符合门槛的提案。
- Reviewer：审批内容，不拥有执行权限。
- Executor：仅执行已通过且时间锁到期的提案。
- Guardian：只能暂停/取消，不能转移资产。
- Admin：管理配置，关键变更走多签或治理。

## 5. 防攻击措施

- 提案门槛、投票延迟、法定人数和时间锁。
- calldata 解码与目标合约/函数白名单。
- 投票权集中度、突增委托和闪电贷风险监控。
- UI 与链上哈希对照，避免描述与执行内容不一致。
- 执行前重新模拟和策略检查；参数漂移则停止。

## 6. 离线与链上治理

离线温度检查可用于筛选，但涉及资金或权限的最终授权必须由配置的链上 Governor、Timelock 或 Safe 完成。系统明确标识“建议”“离线通过”和“链上可执行”的差异。
