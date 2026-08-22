# 数据库设计

## 1. 核心表

| 表 | 关键字段 |
|---|---|
| organizations | id, name, status, created_at |
| users / memberships | wallet, organization_id, role |
| chains / contracts | chain_id, address, type, config |
| policies / policy_versions | status, version, config_json, hash |
| raw_attestations | provider, object_uri, content_hash, received_at |
| evidence | subject, predicate, value_json, verification, observed_at |
| evidence_relations | source_id, target_id, relation_type |
| evidence_snapshots | organization_id, manifest_hash, created_at |
| decisions | objective, policy_version_id, snapshot_id, status |
| agent_runs / agent_messages | role, model_version, input_hash, output_json |
| claims / claim_evidence | text, materiality, evidence_id |
| proposals | governor, proposal_id, state, calldata_hash |
| executions | action_id, tx_hash, simulation_json, status |
| audit_events | actor, action, object, payload_hash, created_at |

## 2. 数据规范

- 主键使用 UUIDv7/ULID，面向用户增加带前缀公共 ID。
- 链上地址保存规范化 bytes/小写检索值，同时保留 checksum 显示值。
- 大整数存 `numeric(78,0)` 或字符串，禁止浮点保存金额。
- `organization_id` 出现在所有租户数据表并参与索引/RLS。
- 时间使用 `timestamptz`；区块号和交易哈希单独保存。

## 3. 关键索引

- evidence `(organization_id, predicate, observed_at desc)`。
- evidence `(chain_id, subject_id, observed_at desc)`。
- proposals `(organization_id, state, updated_at desc)`。
- audit_events `(organization_id, object_type, object_id, created_at)`。
- 链上日志唯一 `(chain_id, tx_hash, log_index)`。
- 向量索引按组织/集合先过滤，避免跨租户召回。

## 4. 留存与不可变性

Evidence、决策快照、提案内容和审计事件逻辑不可变。原始大载荷放对象存储并以哈希关联。缓存可删除；业务记录按治理/法规政策归档。备份加密并定期恢复演练。

## 5. 迁移

使用单向版本化迁移；生产变更采用 expand/migrate/contract。新增非空列先允许空值并回填；索引并发创建；发布前验证回滚或前滚方案。
