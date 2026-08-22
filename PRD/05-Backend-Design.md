# AEOS 后端设计

## 1. 模块

- Identity：SIWE nonce、会话、组织成员与 RBAC。
- Organization：DAO、网络、合约地址和集成配置。
- Evidence：摄取、验证、标准化、评分、快照与检索。
- Decision：分析任务、Agent 运行、观点、审批和输出。
- Policy：策略版本、限额、PID 配置和生效规则。
- Governance：提案构建、状态同步、投票与时间锁。
- Execution：模拟、签名请求、提交、确认和失败恢复。
- Audit：追加式事件、导出和完整性校验。

## 2. 运行模型

- 同步 API 处理查询和轻量命令。
- Worker 处理数据摄取、Agent 推理、嵌入、链上索引和模拟。
- 调度器触发周期性证据更新、反馈计算与异常检测。
- Redis 用于队列、短期缓存、分布式锁和速率限制。

## 3. 任务状态

`PENDING → RUNNING → SUCCEEDED | FAILED | CANCELLED`

任务记录尝试次数、超时、心跳、输入哈希、输出引用和错误码。只对明确可重试错误执行指数退避；超过阈值进入死信队列。

## 4. 事务与事件

- 同一数据库事务内写业务对象与 Outbox 事件。
- 发布器异步投递事件；消费者按 `event_id` 幂等。
- 资产执行使用业务幂等键 + 链上 nonce/提案 ID 双重保护。
- 审计日志采用追加写，修正通过新事件表达。

## 5. 错误模型

```json
{
  "error": {
    "code": "EVIDENCE_STALE",
    "message": "Evidence snapshot is outside the allowed freshness window",
    "request_id": "req_...",
    "details": {"evidence_id": "ev_..."}
  }
}
```

错误码分为 `AUTH_*`、`VALIDATION_*`、`EVIDENCE_*`、`AGENT_*`、`POLICY_*`、`CHAIN_*` 和 `INTERNAL_*`。

## 6. 配置与密钥

- 非敏感配置使用环境变量和版本化配置文件。
- API Key、RPC 凭证、签名材料来自密钥管理服务。
- 密钥按环境和服务隔离，支持轮换；日志自动脱敏。
- Agent 工具许可、模型和提示模板均版本化并可回滚。

## 7. 性能策略

- Evidence 按来源、链、资产和时间索引；常用快照缓存。
- 列表接口使用游标分页；大文件走对象存储预签名链接。
- 避免在 API 请求内串行调用多个 LLM 或 RPC。
- 所有外部调用设置超时、重试上限和熔断器。
