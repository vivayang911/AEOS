# AEOS 系统架构

## 1. 架构目标

系统采用“链下智能、链上授权、证据可追溯、执行受约束”的分层架构。AI 输出永远是建议，只有治理与合约安全层可以授权资产动作。

## 2. 逻辑分层

```text
Web / Wallet / Admin Console
          │
API Gateway + Auth + RBAC
          │
Workflow Orchestrator ─── Governance Service ─── Notification
    │          │                 │
Agent Org   Risk/PID Engine   Proposal Builder
    │          │                 │
RAG/Memory ─ Evidence Service ─ Simulation/Executor
                   │                 │
          Attestcoin Adapter     RPC / Contracts
                   │                 │
       PostgreSQL / Vector / Redis / Object Storage
```

## 3. 服务职责

| 服务 | 职责 | 不负责 |
|---|---|---|
| Web App | 展示、表单、钱包签名、实时状态 | 保存私钥、最终授权 |
| API Gateway | 会话、限流、请求追踪、路由 | 业务推理 |
| Evidence Service | 接入、验证、标准化、评分、引用 | 投资结论 |
| Agent Orchestrator | 调度 Agent、预算、超时、重试、汇总 | 绕过风控执行 |
| Risk/PID Engine | 计算建议、硬限制与策略检查 | 持有资金 |
| Governance Service | 提案状态、投票同步、时间锁 | 代替 DAO 投票 |
| Executor | 模拟、构建、提交或交付多签交易 | 自行扩大权限 |
| Indexer | 读取链上事件、确认数和重组处理 | 主动交易 |

## 4. 关键数据流

### 4.1 证据摄取

定时器/请求 → Attestcoin Adapter → 签名/证明验证 → 规范化 → 内容哈希 → 质量评分 → PostgreSQL/对象存储 → 向量索引。

### 4.2 决策生成

创建任务 → 冻结策略与证据快照 → 专业 Agent 分析 → 交叉质询 → 风险检查 → Governor 汇总 → Schema 校验 → 人工审阅。

### 4.3 治理执行

建议 → 交易模拟 → 提案 calldata 与摘要哈希 → 投票/时间锁 → 执行前再验证 → 签名或 relayer → 回执确认 → 反馈计算。

## 5. 信任边界

- 外部数据边界：Attestcoin 响应必须验证，原始载荷不可直接当作提示指令。
- LLM 边界：模型输出不可信，必须通过 Schema、证据覆盖和策略引擎。
- 链上边界：RPC 可不一致，关键读取使用确认数或多端点校验。
- 执行边界：私钥由钱包、Safe 或 KMS/MPC 管理，应用只接收最小授权。

## 6. 一致性与幂等

- 所有创建接口接受 `Idempotency-Key`。
- 链上事件以 `(chain_id, tx_hash, log_index)` 唯一标识。
- 决策绑定不可变 `policy_version` 与 `evidence_snapshot_id`。
- 长任务使用 Outbox 事件；消费方记录幂等键。
- 链重组时回滚未最终确认状态并重新索引。

## 7. 可扩展性

- Adapter 接口隔离不同 Attestcoin/链/RPC 数据格式。
- Agent 通过版本化角色配置和工具许可表扩展。
- 合约调用通过 Action Adapter 白名单支持新协议。
- 早期采用模块化单体 + 独立 Worker；负载成熟后拆分服务。

## 8. 部署拓扑

- Public：CDN/WAF、Web App、API Gateway。
- Private：业务 API、Agent Worker、Indexer、Redis、数据库。
- Restricted：KMS/MPC、执行 Worker、审计存储。
- 每个环境使用独立账户、数据库、密钥和链上地址。

## 9. 架构决策

- ADR-001：MVP 采用 PostgreSQL + pgvector，降低多存储一致性成本。
- ADR-002：治理执行优先 Safe/Timelock，不采用后端热钱包。
- ADR-003：Agent 消息只使用结构化对象，不依赖自由文本驱动执行。
- ADR-004：PID 仅产生目标调整建议，硬限制由独立规则引擎强制执行。
