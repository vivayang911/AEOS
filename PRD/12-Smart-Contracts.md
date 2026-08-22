# 智能合约设计

## 1. 合约模块

- `AEOSTreasuryGuard`：执行入口、资产/目标/函数白名单和限额。
- `PolicyRegistry`：保存生效策略哈希、版本和有效期。
- `EvidenceAnchor`：可选，将决策与 Evidence Snapshot 哈希锚定链上。
- `Governor/Timelock`：优先复用 OpenZeppelin 标准实现。
- `Safe`：多签资产控制和模块化执行。
- `EmergencyPause`：Guardian 可暂停，恢复需要更高权限。

## 2. 执行约束

- 仅接受 Governor/Timelock/Safe 授权调用。
- 目标合约和 function selector 必须白名单。
- 检查 token、amount、deadline、recipient、slippage bound 和策略版本。
- 使用唯一 action ID 防重放；执行结果发出事件。
- 禁止任意 `delegatecall` 和不受控外部调用。

## 3. 角色

建议使用 `DEFAULT_ADMIN_ROLE`（Timelock/Safe）、`POLICY_ROLE`、`EXECUTOR_ROLE`、`GUARDIAN_ROLE`。Guardian 只能收紧权限或暂停；不能升级、提取资产或恢复执行。

## 4. 事件

```solidity
event PolicyActivated(bytes32 indexed policyHash, uint64 version);
event ActionExecuted(bytes32 indexed actionId, address indexed target, bytes4 selector);
event EvidenceAnchored(bytes32 indexed decisionId, bytes32 snapshotHash);
event EmergencyPaused(address indexed guardian, bytes32 reasonHash);
```

## 5. 升级策略

MVP 优先不可升级或通过治理部署新版本并迁移。若必须代理升级：使用成熟代理模式、升级时间锁、存储布局检查、独立审计和链上公告。

## 6. 安全测试

- 单元测试覆盖权限、边界、暂停和状态转换。
- Fuzz 测试金额、精度、deadline、重复 action 和恶意 token。
- Invariant：未授权调用永不转移资产；暂停时不能执行；累计限额不被绕过。
- Fork 测试目标协议真实 calldata；静态分析与独立审计。

## 7. 执行模式

推荐 Safe-first：AEOS 生成并模拟 Safe 交易，委员签名后执行。更高自治阶段才允许受限 Executor，并持续保留时间锁、金额上限和暂停能力。
