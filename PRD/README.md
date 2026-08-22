# AEOS 开发文档

AEOS（Autonomous Enterprise Operating System）是基于 Attestcoin 可信跨链证据的 AI 原生 DAO 国库治理系统。本目录是产品、架构、研发、测试与部署的单一文档入口。

## 文档导航

| 编号 | 文档 | 主题 |
|---|---|---|
| 01 | [项目概述](01-Project-Overview.md) | 愿景、范围、核心概念 |
| 02 | [产品需求文档](02-Product-PRD.md) | 用户、场景、功能与验收 |
| 03 | [系统架构](03-System-Architecture.md) | 分层、服务与数据流 |
| 04 | [前端设计](04-Frontend-Design.md) | 页面、状态、交互与组件 |
| 05 | [后端设计](05-Backend-Design.md) | 服务、API、任务与错误模型 |
| 06 | [Agent 设计](06-Agent-Design.md) | 多智能体组织与决策协议 |
| 07 | [Attestcoin 集成](07-Attestcoin-Integration.md) | 可信数据接入与验证 |
| 08 | [Evidence Layer](08-Evidence-Layer.md) | 证据标准化、评分与引用 |
| 09 | [RAG 与 Memory](09-RAG-and-Memory.md) | 知识检索、记忆与隔离 |
| 10 | [DAO 治理](10-DAO-Governance.md) | 提案、审议、投票与执行 |
| 11 | [PID 控制](11-PID-Control.md) | 国库闭环控制与安全边界 |
| 12 | [智能合约](12-Smart-Contracts.md) | 合约模块、权限与测试 |
| 13 | [数据库设计](13-Database-Design.md) | 数据模型、索引与留存 |
| 14 | [API 规范](14-API-Specification.md) | REST、事件与鉴权 |
| 15 | [安全与合规](15-Security-and-Compliance.md) | 威胁模型与控制措施 |
| 16 | [测试策略](16-Testing-Strategy.md) | 测试矩阵与上线门禁 |
| 17 | [部署运维](17-Deployment-and-Operations.md) | 环境、CI/CD 与可观测性 |
| 18 | [实施路线图](18-Implementation-Roadmap.md) | MVP 阶段、任务与完成定义 |

## 建议技术栈

- Web：Next.js、TypeScript、Tailwind CSS、wagmi/viem
- API：FastAPI 或 NestJS；本文档示例采用技术中立接口
- Agent：Python、结构化工具调用、工作流编排器
- 数据：PostgreSQL、pgvector、Redis、对象存储
- 链上：Solidity、OpenZeppelin、Foundry、Safe 多签
- 运维：Docker、托管容器/Kubernetes、OpenTelemetry

## 文档约定

- `Evidence`：经来源验证、标准化且可追溯的事实单元。
- `Decision`：Agent 委员会针对目标与约束生成的结构化结论。
- `Proposal`：可被 DAO 审议并投票的治理对象。
- `Execution`：经策略检查与授权后提交链上的动作。
- 所有金额使用整数最小单位保存；显示层负责精度转换。
- 所有时间使用 UTC ISO 8601；链上时间同时记录区块号。

## MVP 成功标准

用户可连接钱包，创建国库目标，系统从 Attestcoin 获取并验证证据，多 Agent 输出带证据引用的建议，经治理流程批准后在测试网执行，并在仪表盘看到执行结果与反馈。
