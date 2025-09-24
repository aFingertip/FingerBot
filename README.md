# 智能QQ群聊机器人 - FingerBot

基于 TypeScript 和 Google Gemini 的智能QQ群聊助手，集成 NapCat 协议，支持多用户对话、上下文记忆和**智能队列批处理系统**，具备群组白名单管理、实时日志监控和现代化 WebUI 界面。

## ✨ 核心特性

### 🚀 智能队列处理系统
- **5种混合触发策略**：高优先级触发、静默触发、队列大小触发、消息年龄触发、手动触发
- **60-80% API调用减少**：通过智能批处理大幅降低成本
- **增强上下文理解**：完整对话片段提供更好的AI理解能力
- **响应式时机控制**：在节约成本的同时保持快速响应

### 🎯 体力管理系统
- **概率回复机制**：基于体力值控制回复频率，营造自然对话流
- **自动恢复机制**：每分钟自动恢复体力值
- **多级体力状态**：高(💚)、中(💛)、低(🧡)、危急(❤️)四个等级
- **休息模式支持**：管理员可暂停体力消耗

### 🌐 现代 WebUI 监控面板
- **Vue 3 + TypeScript + Vite 7**：现代化单页应用架构
- **实时日志查看**：JSON语法高亮、可折叠详细内容
- **对话历史浏览**：交互式消息详情展开
- **群组白名单管理**：动态添加/删除群组界面
- **系统状态监控**：WebSocket 和 AI 连接状态实时显示

### 🔧 多重API密钥管理
- **智能密钥轮换**：触发速率限制时自动切换
- **错误追踪监控**：5分钟滑动窗口监控429错误
- **智能阻断恢复**：临时阻断后1小时自动恢复
- **每日重置调度**：午夜自动重置所有错误计数

### 🛡️ 专业错误处理
- **管理员私信通知**：处理失败时自动发送详细错误报告
- **异步任务处理**：后台任务队列处理非阻塞操作
- **重试机制**：指数退避重试策略

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量模板并编辑：

```bash
# 本地开发环境
cp .env.development .env.development.local

# Docker生产环境  
cp .env.docker .env.docker.local
```

在 `.env.development.local` 或 `.env.docker.local` 中配置：

```env
# 核心配置
NODE_ENV=development
PORT=8080
LOG_LEVEL=info

# Google Gemini API (支持多密钥轮换)
GEMINI_API_KEY=your-primary-api-key,backup-key-1,backup-key-2
GEMINI_API_KEYS_BACKUP=backup-key-3,backup-key-4
GEMINI_MODEL=gemini-2.5-flash

# AI参数
MAX_TOKENS=2000
TEMPERATURE=0.7

# WebSocket配置
WS_SERVER_PATH=/ws

# 群组白名单 (逗号分隔的群ID，留空允许所有群)
GROUP_WHITELIST=253631878,123456789

# 管理员用户ID (接收错误通知)
ADMIN_USER_ID=2945791077

# 可选：机器人QQ号 (精确@检测)
# BOT_QQ_ID=123456789

# 体力管理系统 ⭐
STAMINA_MAX_STAMINA=100                   # 最大体力值
STAMINA_REPLY_COST=10                     # 每次回复消耗体力
STAMINA_REGEN_RATE=5                      # 体力恢复速率/分钟
STAMINA_REGEN_INTERVAL=60000              # 体力恢复间隔(毫秒)
STAMINA_LOW_THRESHOLD=30                  # 低体力阈值
STAMINA_CRITICAL_THRESHOLD=10             # 极低体力阈值
STAMINA_REST_MODE=false                   # 休息模式

# 队列处理配置 ⭐
QUEUE_SILENCE_SECONDS=8                   # 静默触发时间(秒)
QUEUE_MAX_SIZE=10                         # 队列大小触发阈值
QUEUE_MAX_AGE_SECONDS=30                  # 消息年龄触发阈值(秒)
BOT_NAME=FingerBot                        # 机器人名称(用于优先级检测)

# 任务处理配置
TASK_QUEUE_MAX_SIZE=1000                  # 最大任务队列大小
TASK_RETRY_MAX_ATTEMPTS=3                 # 最大重试次数
```

### 3. 启动开发服务器

#### 标准开发模式

```bash
npm run dev          # 启动后端服务器 (端口 8080)
```

#### 现代WebUI开发模式 (推荐)

```bash
# 双服务器设置 - 获得最佳开发体验
npm run webui:dev    # WebUI开发服务器 (端口 3000，支持HMR)
npm run dev          # 后端API服务器 (端口 8080)
```

服务器启动后访问：
- **后端API**: `http://localhost:8080`
- **现代WebUI开发**: `http://localhost:3000` (带HMR)
- **WebSocket**: `ws://localhost:8080/ws`

### 4. 配置 NapCat 连接

将你的 NapCat 客户端配置为连接到：`ws://localhost:8080/ws`

启动后你会看到类似以下的日志输出：
```
🚀 HTTP服务器运行在 http://localhost:8080
🔌 WebSocket服务器运行在 ws://localhost:8080/ws  
🤖 智能QQ机器人已就绪！
📱 请将你的NapCat连接到: ws://localhost:8080/ws
```

## 📡 API 接口

### 系统接口

```bash
GET /health              # 健康检查
GET /ws/status          # WebSocket连接状态
GET /api/logs           # 系统日志(WebUI)
```

### 对话接口

```bash
# 发送消息
POST /chat
Content-Type: application/json
{
  "userId": "user123",
  "message": "你好！",
  "groupId": "group456"  // 可选，用于群聊
}

# 获取对话历史
GET /conversation?userId=user123&groupId=group456

# 清除对话历史  
DELETE /conversation
Content-Type: application/json
{
  "userId": "user123",
  "groupId": "group456"  // 可选
}
```

### 白名单管理

```bash
GET /whitelist/status                    # 查看白名单状态
POST /whitelist/groups                   # 添加群组到白名单
DELETE /whitelist/groups                 # 从白名单移除群组
```

## 💬 管理员命令

### 基础命令
- `/help` - 显示所有可用管理员命令
- `/status` - 查看系统运行状态和对话统计
- `/clear` - 清除当前对话历史

### API密钥管理
- `/apikeys` - 查看所有API Key的详细状态
- `/resetkey <key前缀>` - 手动重置指定API Key的错误状态
- `/switchkey` - 强制切换到下一个可用的API Key

### 队列管理 ⭐
- `/queue status` - 查看消息队列状态和触发统计
- `/queue flush` - 手动触发队列处理
- `/queue clear` - 清空队列(不处理消息)

### 体力管理 ⭐  
- `/stamina` - 查看详细体力状态和统计信息
- `/stamina rest` - 切换休息模式(暂停体力消耗)
- `/stamina set <数值>` - 手动设置体力值(0-100)

## 🐳 Docker 部署

### 生产环境部署

```bash
# 1. 配置环境变量
cp .env.docker .env.docker.local
# 编辑 .env.docker.local 设置 GEMINI_API_KEY 等必要参数

# 2. 启动服务
./scripts/start.sh

# 3. 查看日志
docker-compose logs -f fingerbot

# 4. 停止服务
./scripts/stop.sh

# 代码同步重启(不重新构建镜像，适用于代码更新)
./scripts/sync-restart.sh
```

### 开发环境部署

```bash
# 配置开发环境
cp .env.development .env.development.local
# 编辑配置文件

# 启动开发环境
./scripts/start.sh

# 开发环境特性：
# - 使用 .env.development.local 配置
# - 详细日志输出
# - Redis开发实例
```

### Docker 服务组件

**生产栈**：
- `fingerbot`: 主应用服务 (端口 8080)
- `redis`: 缓存和会话存储 (端口 6379)
- `logrotate`: 自动日志轮转

**关键特性**：
- 📁 日志文件持久化到宿主机 `./logs/` 目录
- 🔄 自动健康检查和重启策略  
- 🛡️ 资源限制和安全配置
- 📋 日志轮转和自动清理
- 🐳 多架构支持 (amd64/arm64)

## 🧪 测试示例

### 使用 curl 测试

```bash
# 健康检查
curl http://localhost:8080/health

# 发送消息
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "message": "你好，我是新用户"}'

# 获取对话历史
curl "http://localhost:8080/conversation?userId=test"

# 清除对话
curl -X DELETE http://localhost:8080/conversation \
  -H "Content-Type: application/json" \
  -d '{"userId": "test"}'

# 查看白名单状态
curl http://localhost:8080/whitelist/status
```

## 🏗️ 项目结构

```
src/
├── core/                           # 核心业务逻辑
│   ├── enhanced-qq-agent-server.ts  # QQ机器人主控制器
│   ├── message-queue-manager.ts     # 智能队列管理器 ⭐
│   ├── batch-message-processor.ts   # 批处理消息处理器 ⭐  
│   ├── enhanced-agent.ts            # 统一队列处理接口
│   ├── task-queue.ts                # 异步任务队列
│   ├── ws-server.ts                 # WebSocket服务器
│   ├── qq-adapter.ts                # QQ消息格式转换
│   ├── message-handler.ts           # 消息处理和内存管理
│   └── types.ts                     # 类型定义
├── ai/                             # AI 集成
│   ├── gemini-client.ts            # Gemini API客户端
│   └── api-key-manager.ts          # 多密钥管理器 ⭐
├── utils/                          # 工具函数
│   ├── config.ts                   # 配置管理
│   ├── logger.ts                   # 日志系统
│   ├── log-store.ts               # 内存日志存储
│   ├── whitelist-manager.ts       # 白名单管理器
│   ├── thinking-logger.ts         # AI推理日志
│   ├── bot-state-manager.ts       # 机器人状态管理
│   └── text-sanitizer.ts          # 文本清理工具
├── config/                         # 配置文件
│   └── persona.ts                  # 机器人人格配置
├── webui/src/                      # Vue 3 现代WebUI ⭐
│   ├── components/                 # Vue组件
│   ├── api/                        # TypeScript API客户端
│   └── main.ts                     # WebUI入口
├── tests/                          # Jest单元测试
└── server.ts                       # Fastify HTTP服务器
```

## 🎯 智能队列处理系统详解

### 系统架构

系统采用**智能队列批处理架构**，通过5种混合触发策略优化API使用，同时保持响应式消息处理。

**核心优势**：
- **60-80% API调用减少**：智能批处理
- 增强上下文理解：完整对话片段
- 响应式时机控制：防止消息延迟的同时降低成本
- 智能优先级检测：关键消息立即响应

### 5种混合触发策略

#### 1. 高优先级触发 (立即处理)
- `@机器人` 提及
- 包含机器人名称的消息
- 以 `?` 或 `？` 结尾的问题
- 命令消息 (`/help`, `/status` 等)
- 包含关键词 (`help`, `帮助`)

#### 2. 静默触发 (默认8秒)
- 对话安静时处理队列
- 优化自然对话流
- 通过 `QUEUE_SILENCE_SECONDS` 配置

#### 3. 队列大小触发 (默认10条消息)
- 队列达到容量时强制处理
- 防止过度批处理
- 通过 `QUEUE_MAX_SIZE` 配置

#### 4. 消息年龄触发 (默认30秒)
- 确保最旧消息及时处理
- 防止活跃对话中的消息延迟
- 通过 `QUEUE_MAX_AGE_SECONDS` 配置

#### 5. 手动触发 (管理员控制)
- `/queue flush` 命令立即处理
- `/queue clear` 重置队列状态
- 管理员系统控制

### 配置示例

#### 活跃群组 (高消息量)
```env
QUEUE_SILENCE_SECONDS=10    # 更长静默时间，更好批处理
QUEUE_MAX_SIZE=15           # 更大批次提高效率
QUEUE_MAX_AGE_SECONDS=45    # 允许更长积累时间
```

#### 安静群组 (低消息量)
```env
QUEUE_SILENCE_SECONDS=5     # 更快响应
QUEUE_MAX_SIZE=5            # 更小批次
QUEUE_MAX_AGE_SECONDS=20    # 更快处理
```

#### 成本优化 (最大化API节约)
```env
QUEUE_SILENCE_SECONDS=15    # 延长批处理时间
QUEUE_MAX_SIZE=20           # 大批次大小
QUEUE_MAX_AGE_SECONDS=60    # 更长积累周期
```

## 📊 数据流程

### 智能队列处理流水线 🚀

1. **连接建立**: NapCat连接到WebSocket服务器 (端口8080/ws)
2. **消息接入**: QQ消息通过WebSocket以OneBot协议到达
3. **过滤转换**: QQAdapter转换并通过白名单过滤消息
4. **队列管理**: **EnhancedQQChatAgentServer** 通过 **MessageQueueManager** 接收并排队消息
5. **触发分析**: **5种混合触发器** 确定最优处理时机：
   - 高优先级：@提及、问题、命令 → 立即处理
   - 静默：8+秒安静 → 批处理
   - 大小：10+消息 → 强制处理
   - 年龄：30+秒旧消息 → 强制处理  
   - 手动：管理员命令 → 手动处理
6. **批处理**: **BatchMessageProcessor** 处理排队消息并增强上下文
7. **AI生成**: GeminiClient生成AI响应并完整记录请求/响应日志
8. **任务处理**: 后台任务(发送消息、存储记忆)异步处理
9. **响应交付**: 响应通过WebSocket发送回NapCat/QQ

## 📝 开发说明

### 开发命令

```bash
# 开发模式
npm run dev          # ts-node启动开发服务器(服务传统WebUI)
npm run build        # 构建服务器(TypeScript)和现代WebUI(Vite + Vue 3)
npm run build:server # 仅构建服务器(TypeScript编译)
npm run build:webui  # 仅构建现代WebUI(Vite + Vue 3)
npm run start        # 从编译的dist/运行(如果已构建，自动服务现代WebUI)

# 现代WebUI开发
npm run webui:dev    # 启动Vite开发服务器(端口3000，支持HMR)
npm run webui:preview # 本地预览构建的WebUI

# 测试
npm test                      # 运行单元测试
npm run test:coverage        # 运行覆盖率测试
npm run test:watch          # 监视模式测试  
npm run test:ci             # CI模式，带覆盖率，无监视

# 现代WebUI架构：
# - 使用 Vite 7 + Vue 3 + TypeScript 构建
# - TypeScript API客户端的模块化组件架构
# - 语法高亮的实时日志查看器
# - Vue Composition API响应式状态管理
# - 如现代构建不可用自动回退到传统HTML
```

### 代码质量检查

**重要**: 完成任何任务后，必须运行 `npm run build:server` 确保TypeScript编译成功。项目当前缺少ESLint/Prettier - 如需代码检查请先配置这些工具。

### 测试覆盖

使用Jest进行全面测试覆盖。运行 `npm test` 进行单元测试，`npm run test:coverage` 生成覆盖率报告。测试文件在 `tests/` 目录中镜像 `src/` 结构。Jest配置从覆盖率报告中排除 `server.ts`。

## 🔐 环境变量说明

详细的环境变量配置请参考快速开始部分的配置示例。

**必需变量**：
- `GEMINI_API_KEY` - Google Gemini API密钥(支持多密钥)
- `PORT` - 服务端口号(默认 8080)
- `ADMIN_USER_ID` - 管理员用户ID(接收错误通知)

**可选变量**：
- `GROUP_WHITELIST` - 群组白名单(逗号分隔，留空允许所有)
- `BOT_QQ_ID` - 机器人QQ号(精确@检测)
- 体力管理系统配置
- 队列处理系统配置  
- 任务处理配置

## 🚧 后续开发计划

- 数据库持久化存储
- 用户权限管理系统
- 插件系统架构
- 向量搜索和RAG集成
- 性能监控仪表板
- Kubernetes部署支持
- 多实例负载均衡

## 🤝 贡献指南

1. Fork 项目仓库
2. 创建功能分支 (`git checkout -b feature/新功能`)
3. 提交更改 (`git commit -m '添加某个功能'`)
4. 推送到分支 (`git push origin feature/新功能`)
5. 创建Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件。

## 📞 支持与反馈

如有问题或建议，请通过以下方式联系：

- 创建 [Issue](https://github.com/yourusername/FingerBot/issues)
- 发起 [Discussion](https://github.com/yourusername/FingerBot/discussions)

---

**FingerBot** - 让QQ群聊更智能 🤖✨