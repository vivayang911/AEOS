# Evidence Intelligence Layer

## 1. Evidence 模型

Evidence 是一个不可变事实单元，包含：主体、谓词、值、单位、链/区块、观测时间、来源、证明、验证结果、质量评分和内容哈希。

```json
{
  "id": "ev_01...",
  "subject": {"type": "wallet", "id": "eip155:1:0x..."},
  "predicate": "asset.balance",
  "value": {"amount": "125000000", "decimals": 6, "symbol": "USDC"},
  "observed_at": "2026-08-05T00:00:00Z",
  "chain": {"id": 1, "block_number": 123},
  "source": {"provider": "attestcoin", "reference": "..."},
  "verification": {"status": "VERIFIED", "method": "..."},
  "content_hash": "0x..."
}
```

## 2. 生命周期

`RECEIVED → VERIFYING → VERIFIED | REJECTED → FRESH → STALE → ARCHIVED`

验证状态与新鲜度分开保存：一条证据可以“验证通过但已过期”。Evidence 不原地修改；更正产生新版本和 `supersedes` 关系。

## 3. 质量评分

建议总分 0–100：

- 证明强度 35%
- 来源可靠性 20%
- 新鲜度 20%
- 完整性 15%
- 多源一致性 10%

评分只帮助排序，不替代硬性验证。低于策略阈值的证据不得支撑高影响动作。

## 4. 快照与引用

决策创建时生成不可变 Snapshot，记录 Evidence ID、有序内容哈希、查询条件和创建时间。决策声明通过 `claim_evidence` 多对多关系引用证据；发布前检查每个关键声明至少有一条有效证据。

## 5. 冲突处理

- 相同主体/谓词/时间窗口值不同则创建冲突组。
- 不自动选择“模型更喜欢”的值；按证明强度、最终确认和新鲜度排序。
- 高影响冲突阻止执行，直到人工解决或策略允许明确降级。

## 6. 可追溯性

从提案可反向导航：Proposal → Decision → Claim → Evidence → Raw Attestation/Proof。原始载荷存对象存储，数据库保存哈希和位置；导出包包含 manifest 与校验值。
