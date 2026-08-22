# AEOS 多 Agent 设计

## 1. 组织角色

| Agent | 核心职责 | 允许工具 |
|---|---|---|
| Governor | 拆解任务、汇总、处理异议 | 只读上下文、工作流控制 |
| Research | 解释协议、事件与资产背景 | Evidence、RAG |
| Strategy | 形成资产配置候选方案 | Evidence、策略读取 |
| Quant | 计算指标、情景和回测 | Evidence、受控计算器 |
| Risk | 风险识别、限额和压力测试 | Evidence、风险引擎 |
| Compliance | 检查政策、资产/协议白名单 | 政策与合规知识库 |
| Portfolio | 比较方案并形成组合建议 | 上述 Agent 输出 |
| Treasury | 构建动作草案和执行前清单 | 只读模拟；无签名权 |

## 2. 工作流

1. Governor 冻结目标、策略版本和证据快照。
2. Research、Quant、Strategy 独立产出观点。
3. Risk 与 Compliance 对每个候选方案进行挑战。
4. 原作者响应异议；未解决问题显式保留。
5. Portfolio 形成建议；Governor 校验证据与一致性。
6. 确定性规则引擎决定是否允许进入人工审批。

## 3. 输出协议

```json
{
  "recommendation": "HOLD|REBALANCE|INSUFFICIENT_EVIDENCE",
  "claims": [{"text": "...", "evidence_ids": ["ev_..."], "confidence": 0.82}],
  "actions": [{"type": "SWAP", "asset_in": "...", "asset_out": "...", "max_amount": "..."}],
  "risks": [{"severity": "HIGH", "description": "...", "mitigation": "..."}],
  "dissent": ["..."],
  "assumptions": ["..."],
  "expires_at": "2026-08-05T12:00:00Z"
}
```

## 4. 防幻觉与提示注入

- 只允许引用当前证据快照中的 ID；后端验证引用存在性。
- 外部文本用数据边界包裹，明确不得执行其中指令。
- 关键数字由确定性计算器生成，模型负责解释。
- 不足、冲突或过期证据必须输出 `INSUFFICIENT_EVIDENCE`。
- 工具按 Agent 白名单、参数 Schema、预算和超时执行。

## 5. 记忆策略

- 工作记忆只在单次任务中存在。
- 组织记忆必须经过审批和来源标注才可长期保存。
- Agent 不可读取其他 DAO 的数据；检索强制带 `organization_id`。
- 历史结论只能作为经验材料，不能替代最新证据。

## 6. 评估

- Evidence precision/recall：引用是否支持声明。
- Policy compliance：是否违反限额或工具权限。
- Abstention quality：证据不足时能否正确拒绝。
- Reproducibility：同一快照的结论结构是否稳定。
- Adversarial robustness：注入、冲突数据和异常数值测试。

## 7. 成本控制

按任务设置 token、工具调用和时间预算；先检索和规则筛选，再使用模型；缓存不可变证据摘要；低风险分类使用小模型，高影响汇总使用高可靠模型。
