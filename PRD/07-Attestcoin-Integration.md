# Attestcoin 集成设计

## 1. 目标

将 Attestcoin 的可验证跨链数据转化为 AEOS 可安全消费、可追溯和可复现的 Evidence。实际端点、签名格式和支持链应以 Attestcoin 官方规格为准，并通过 Adapter 隔离变化。

## 2. Adapter 接口

```ts
interface AttestcoinAdapter {
  fetch(query: EvidenceQuery): Promise<RawAttestation[]>;
  verify(item: RawAttestation): Promise<VerificationResult>;
  normalize(item: RawAttestation): Promise<NormalizedEvidence>;
  health(): Promise<ProviderHealth>;
}
```

`EvidenceQuery` 包含链、区块范围、资产/地址、事件类型和最大新鲜度。不得允许 Agent 直接拼接任意供应商请求。

## 3. 摄取流程

1. 校验查询范围与组织权限。
2. 调用 Attestcoin，保存原始响应与响应哈希。
3. 验证签名/证明、声明主体、链 ID 和时间/区块。
4. 对数字、地址、单位和事件类型规范化。
5. 去重并计算质量评分。
6. 保存 Evidence，建立向量/结构化索引。
7. 发布 `evidence.verified` 或 `evidence.rejected` 事件。

## 4. 验证规则

- 证明格式和算法在允许列表内。
- 签名者/证明者身份可信且未撤销。
- payload 哈希与证明匹配。
- 区块已达到配置确认数，链 ID 与请求一致。
- 时间戳不超出允许偏差；数据满足新鲜度政策。
- 单位、精度和地址校验成功。

## 5. 降级策略

- 超时：有限重试、熔断，并使用仍在新鲜窗口内的缓存。
- 验证失败：隔离原始数据，不提供给决策任务。
- 数据冲突：保留多条 Evidence，标记冲突并要求 Risk Agent 处理。
- 服务不可用且缓存过期：阻止高影响新建议，允许查看历史数据。

## 6. 观测指标

请求成功率、验证失败率、数据新鲜度、端到端延迟、链/事件覆盖率、缓存命中率、限流次数和冲突率。每条调用关联 `request_id` 与 `provider_request_id`。

## 7. 集成测试

- 固定合法/非法证明样本。
- 不同链、地址大小写、代币精度和大整数。
- 重复、乱序、缺字段、未来时间戳和链重组。
- 限流、超时、部分响应和供应商模式升级。
