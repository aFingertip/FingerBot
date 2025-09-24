# 智能群聊 Agent - MVP 版本

基于 TypeScript 和 Google Gemini 的智能群聊助手，支持多用户对话和上下文记忆。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在 `.env` 文件中配置您的 Gemini API Key：

```env
GEMINI_API_KEY=your-gemini-api-key-here
PORT=8080
WS_SERVER_PATH=/ws
```

### 3. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:8080` 启动，WebSocket服务在 `ws://localhost:8080/ws`。

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

### 1. 健康检查
```
GET /health
```

### 2. WebSocket连接状态
```
GET /ws/status
```

### 3. 发送消息
```
POST /chat
Content-Type: application/json

{
  "userId": "user123",
  "message": "你好！",
  "groupId": "group456" // 可选，用于群聊
}
```

### 4. 获取对话历史
```
GET /conversation?userId=user123&groupId=group456
```

### 5. 清除对话历史
```
DELETE /conversation
Content-Type: application/json

{
  "userId": "user123",
  "groupId": "group456" // 可选
}
```

## 💬 支持的命令

- `/help` - 显示帮助信息
- `/status` - 显示系统状态
- `/clear` - 清除当前对话历史

## 🧪 测试示例

### 使用 curl 测试

```bash
# 健康检查
curl http://localhost:3000/health

# 发送消息
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "message": "你好，我是新用户"}'

# 获取对话历史
curl "http://localhost:3000/conversation?userId=test"

# 清除对话
curl -X DELETE http://localhost:3000/conversation \
  -H "Content-Type: application/json" \
  -d '{"userId": "test"}'
```

## 🏗️ 项目结构

```
src/
├── core/           # 核心业务逻辑
│   ├── agent.ts    # 主要 Agent 类
│   ├── message-handler.ts  # 消息处理
│   └── types.ts    # 类型定义
├── ai/             # AI 集成
│   └── gemini-client.ts    # Gemini API 客户端
├── utils/          # 工具函数
│   ├── config.ts   # 配置管理
│   └── logger.ts   # 日志系统
└── server.ts       # HTTP 服务器
```

## ✨ 功能特点

- 🤖 基于 Google Gemini 的智能对话
- 💾 简单的内存对话历史管理
- 👥 支持多用户和群聊场景
- 🎯 命令系统支持
- 📝 结构化日志记录
- 🔧 TypeScript 类型安全

## 🚧 后续开发计划

- 数据库持久化存储
- 用户权限管理
- 插件系统
- 向量搜索和 RAG
- 性能监控
- Docker 部署

## 📝 开发说明

- `npm run dev` - 开发模式启动
- `npm run build` - 构建项目
- `npm start` - 生产模式启动
- `npm test` - 运行测试（待实现）

## 🔐 环境变量说明

- `GEMINI_API_KEY` - Google Gemini API 密钥（必需）
- `PORT` - 服务端口号（默认 3000）
- `NODE_ENV` - 运行环境（development/production）
- `LOG_LEVEL` - 日志级别（error/warn/info/debug）
- `MAX_TOKENS` - AI 响应最大 token 数
- `TEMPERATURE` - AI 创造性参数（0-1）