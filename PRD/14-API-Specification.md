# API 规范

## 1. 通用约定

- 基础路径：`/api/v1`；JSON；UTC ISO 8601。
- 钱包使用 SIWE 建立 HttpOnly/Secure 会话。
- 写请求支持 `Idempotency-Key` 和 `X-Request-ID`。
- 列表使用 `limit` + `cursor`；默认 20，最大 100。
- 乐观锁使用 `version`/`If-Match`。

## 2. 主要端点

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/auth/nonce`, `/auth/verify` | SIWE 登录 |
| GET/POST | `/organizations` | 组织查询/创建 |
| GET/POST | `/evidence` | 搜索/请求摄取 |
| GET | `/evidence/{id}` | 证据与验证详情 |
| POST | `/evidence-snapshots` | 冻结证据集合 |
| POST | `/decisions` | 创建分析任务 |
| GET | `/decisions/{id}` | 结果、进度和引用 |
| POST | `/decisions/{id}/approve` | 人工审批 |
| GET/POST | `/policies` | 策略查询/草拟 |
| POST | `/proposals` | 构建治理提案 |
| POST | `/proposals/{id}/simulate` | 执行模拟 |
| POST | `/proposals/{id}/execute` | 提交已授权动作 |
| GET | `/audit-events` | 审计查询 |

## 3. 事件主题

`evidence.verified`、`decision.started`、`decision.review_required`、`proposal.state_changed`、`execution.confirmed`、`policy.activated`、`security.paused`。

事件含 `event_id`、`type`、`occurred_at`、`organization_id`、`actor`、`object_ref`、`data` 和 `schema_version`。

## 4. 授权

每个端点同时验证成员角色、对象所属组织和资源状态。执行端点还验证链上授权、策略版本、暂停状态、模拟新鲜度和幂等键。

## 5. OpenAPI 门禁

API Schema 纳入版本控制；生成客户端；CI 检查破坏性变更；示例和错误码必须完整。敏感字段标记 `writeOnly`/不进入日志。
