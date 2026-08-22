# AEOS 前端设计

## 1. 技术与原则

建议采用 Next.js、TypeScript、Tailwind CSS、TanStack Query、Zod、wagmi/viem。界面以“证据可见、风险优先、链上状态明确”为原则；禁止用单一绿色按钮暗示 AI 建议已被授权。

## 2. 信息架构

- `/dashboard`：国库总览、目标偏差、告警、决策和提案。
- `/evidence`、`/evidence/:id`：证据列表、验证细节和原始来源。
- `/decisions/new`、`/decisions/:id`：分析配置、Agent 讨论和审批。
- `/strategies`、`/strategies/:id`：策略版本、限额和 PID 参数。
- `/governance`、`/proposals/:id`：提案、投票、排队与执行。
- `/audit`：事件筛选、对象时间线和导出。
- `/settings`：组织、合约、网络、角色与集成。

## 3. 核心组件

- `WalletGate`：网络检查、SIWE 登录和权限提示。
- `EvidenceBadge`：Verified/Stale/Invalid/Unverified 状态与评分。
- `ClaimCitation`：声明到 Evidence ID 的可点击引用。
- `AgentPanel`：角色、结论、置信度、异议和引用。
- `RiskCheckList`：硬限制与软警告分组展示。
- `TransactionPreview`：calldata 解码、资产变化、gas 和滑点。
- `GovernanceTimeline`：从草稿到执行的状态时间轴。
- `EmergencyBanner`：暂停状态和恢复权限说明。

## 4. 状态管理

- 服务端状态由 TanStack Query 管理；链上状态按区块刷新并显示确认数。
- 表单使用 React Hook Form + Zod；草稿可本地保存但提交以服务端版本为准。
- DAO、网络、会话为全局上下文；不把私密令牌写入 localStorage。
- 长任务通过 SSE/WebSocket 获取进度，断线后以任务 ID 恢复。

## 5. 关键交互

- 建议审批前强制展示证据覆盖、未解决异议和模拟结果。
- 任何钱包签名前显示人类可读动作、目标合约、金额、链和风险。
- 数据过期时禁止静默使用；明确展示“重新获取证据”。
- 执行按钮根据投票、时间锁、暂停、模拟和角色共同决定可用性。

## 6. 可访问性与质量

- 状态不能只依赖颜色；所有图表提供文本摘要。
- 对话框管理焦点；异步错误使用可读提示并保留重试上下文。
- 响应式断点覆盖 360 px 至桌面；治理详情优先桌面但可移动审阅。
- 对金额、地址和哈希提供复制、完整值提示和区块浏览器链接。

## 7. 前端安全

- CSP、严格输入转义、禁止渲染 Agent 返回的原始 HTML。
- 外链添加安全属性；钱包连接不等于后台授权。
- 交易请求必须由后端返回签名摘要，前端再次解码和验证链 ID。
