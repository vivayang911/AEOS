# AEOS 实施路线图

## Phase 0：基础与规格（1 周）

- 确认 Attestcoin 实际 API/证明规格和目标测试链。
- 建立 monorepo、CI、环境、ADR、OpenAPI 和合约接口。
- 固化 MVP 演示场景、风险参数和成功指标。

完成定义：本地环境一键启动；Mock 数据和本地链可用；核心 Schema 评审通过。

## Phase 1：Evidence MVP（2 周）

- Attestcoin Adapter、验证器、规范化与缓存。
- Evidence 数据模型、Explorer、快照和引用。
- 摄取监控、失败隔离和 fixtures。

完成定义：从两条链获取样本并生成可验证、可搜索的证据快照。

## Phase 2：Agent Decision Room（2 周）

- Governor、Research、Quant、Risk、Portfolio 工作流。
- RAG、结构化输出、证据覆盖与注入防护。
- Decision Room、异议、审批和审计。

完成定义：对固定目标产出带完整引用的建议；缺证据时可靠拒答。

## Phase 3：策略、PID 与治理（2 周）

- 策略版本、限额、PI/PID 仿真和风险检查。
- 提案构建、状态同步、calldata 解码和治理界面。
- Evidence Snapshot/Decision 哈希存档。

完成定义：建议可转换为可审议的测试网提案，描述与 calldata 一致。

## Phase 4：安全执行闭环（2 周）

- TreasuryGuard/Timelock/Safe 集成、暂停和执行 Worker。
- 执行前再模拟、幂等提交、确认和反馈。
- 合约 Fuzz/Invariant、E2E 和故障演练。

完成定义：测试网从目标到执行再到反馈完整闭环，无未授权路径。

## Phase 5：发布与演示（1 周）

- 性能、安全、Agent eval、可访问性和恢复验收。
- 仪表盘、告警、运行手册、演示数据与讲解脚本。
- 冻结版本并生成 SBOM、部署清单和已知限制。

## 优先级任务

P0：证据验证、快照、Agent 引用、策略硬限制、模拟、治理授权、Safe/Timelock、审计、暂停。

P1：通知、情景比较、多数据源冲突界面、成本仪表盘。

P2：更多协议 Adapter、委托分析、策略市场和受限自动执行。

## 团队建议

- Product/Design 1–2 人
- Frontend 1–2 人
- Backend/Data 2 人
- AI/Agent 1–2 人
- Smart Contract/Security 1–2 人
- DevOps/QA 可由团队成员兼任，但上线前需明确责任人

## 项目级完成定义

代码、Schema 和文档一致；测试与安全门禁通过；测试网演示可重复；所有关键结论可追溯到 Evidence；任何资产动作都有策略、模拟、治理和链上授权；已知限制公开记录。
