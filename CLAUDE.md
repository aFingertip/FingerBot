# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based intelligent QQ group chat agent that integrates with NapCat for QQ messaging. The system provides AI-powered responses using Google Gemini, includes group whitelist management, real-time logging with WebUI monitoring, and features an **intelligent queue-based batch processing system** with hybrid trigger strategies for optimized API usage, enhanced context understanding, and responsive message handling.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.development .env.development.local
# Edit .env.development.local with your GEMINI_API_KEY

# 3. Start development
npm run dev  # Backend server on port 8080

# 4. Modern WebUI development (optional)
npm run webui:dev  # WebUI dev server on port 3000

# 5. Connect NapCat to: ws://localhost:8080/ws
```

## Architecture

### Core Components

**Server Layer (`src/server.ts`)**
- Main HTTP server using Fastify framework
- **Modern WebUI**: Automatically serves Vite-built Vue 3 + TypeScript WebUI when available, falls back to legacy HTML
- REST API endpoints for chat, conversation history, whitelist management, and logs
- WebSocket server integration for NapCat connectivity
- SPA routing support for Vue Router with API path protection

**Enhanced QQ Chat Agent (`src/core/enhanced-qq-agent-server.ts`)**
- Primary orchestrator for queue-based message processing
- Integrates seamlessly with WebSocket server and NapCat connections
- Asynchronous reply handling with pending reply tracking
- Error handling with admin notifications via private messages
- Professional connection management and health monitoring

**Intelligent Queue Processing System** ⭐
- `src/core/message-queue-manager.ts` - Smart queue management with hybrid trigger strategies
- `src/core/batch-message-processor.ts` - Batch processing with enhanced context building
- `src/core/enhanced-agent.ts` - Unified queue-based processing interface
- **5 Hybrid Trigger Strategies**:
  - **High Priority Trigger**: Immediate processing for @mentions, questions, commands
  - **Silence Trigger**: Process queue after 8 seconds of silence (configurable)
  - **Size Trigger**: Process when queue reaches 10 messages (configurable)
  - **Age Trigger**: Force processing when oldest message exceeds 30 seconds (configurable)
  - **Manual Trigger**: Admin commands for queue management

**WebSocket Server (`src/core/ws-server.ts`)**
- Independent WebSocket server handling NapCat connections
- Professional connection management with heartbeat and dead connection cleanup
- Message routing between QQ and AI processing pipeline
- Listens on `/ws` endpoint for NapCat client connections

**AI Integration (`src/ai/gemini-client.ts`)**
- Google Gemini API client with comprehensive request/response logging
- **Multi-API Key Management**: Automatic switching when rate limits are hit
- **429 Error Handling**: 5 errors in 5 minutes triggers 1-hour key blocking
- **Auto-Retry Mechanism**: Exponential backoff with jitter (up to 3 attempts)
- **Daily Reset**: All key statuses reset at midnight
- Structured prompt building with system instructions, conversation history, and user input
- Token usage estimation and enhanced error handling
- Configurable model and parameters via environment variables

**Task Queue System (`src/core/task-queue.ts`)**
- Asynchronous task processing for sending messages and storing memories
- Handles background operations without blocking message processing
- Separate queues for different task types (SendMessage, StoreMemory, Thinking)
- Error handling and retry logic for failed tasks
- Integrates with the main queue processing pipeline

**Multi-API Key Manager (`src/ai/api-key-manager.ts`)**
- **Intelligent Key Rotation**: Automatically switches keys when rate limits hit
- **Error Tracking**: Monitors 429 errors in 5-minute sliding windows
- **Smart Blocking**: Temporarily blocks keys after 5+ rate limit errors
- **Automatic Recovery**: Blocked keys auto-recover after 1 hour
- **Daily Reset Schedule**: All error counts and blocks reset at midnight
- **Admin Management**: Manual key reset and switching via commands

**Message Processing Infrastructure**
- `src/core/qq-adapter.ts` - Converts QQ OneBot messages to internal format, handles CQ codes, whitelist filtering
- `src/core/message-handler.ts` - Conversation memory management and message formatting utilities

**Whitelist System (`src/utils/whitelist-manager.ts`)**
- Singleton pattern group whitelist management
- Environment variable configuration via `GROUP_WHITELIST` (comma-separated group IDs)
- Runtime management APIs for adding/removing groups
- Integrated with message adapter for automatic filtering

**Logging System**
- `src/utils/logger.ts` - Custom logger with structured output and memory storage
- `src/utils/log-store.ts` - In-memory log storage for WebUI access
- Real-time log viewing with JSON formatting and expandable sections in WebUI

### Data Flow

#### Intelligent Queue Processing Pipeline 🚀
1. **Connection**: NapCat connects to WebSocket server on port 8080/ws
2. **Message Ingestion**: QQ messages arrive via WebSocket as OneBot protocol
3. **Filtering & Conversion**: QQAdapter converts and filters messages through whitelist
4. **Queue Management**: **EnhancedQQChatAgentServer** receives and queues messages via **MessageQueueManager**
5. **Trigger Analysis**: **5 Hybrid triggers** determine optimal processing timing:
   - High Priority: @mentions, questions, commands → immediate processing
   - Silence: 8+ seconds quiet → batch processing
   - Size: 10+ messages → force processing
   - Age: 30+ seconds old → force processing
   - Manual: Admin commands → manual processing
6. **Batch Processing**: **BatchMessageProcessor** handles queued messages with enhanced context
7. **AI Generation**: GeminiClient generates AI responses with full request/response logging
8. **Task Processing**: Background tasks (sending messages, storing memories) are handled asynchronously
9. **Response Delivery**: Responses are sent back through WebSocket to NapCat/QQ

**Key Benefits**: 60-80% API call reduction, enhanced context understanding, responsive timing

## Development Commands

```bash
# Development
npm run dev          # Start development server with ts-node (serves legacy WebUI)
npm run build        # Build both server (TypeScript) and modern WebUI (Vite + Vue 3)
npm run build:server # Build server only (TypeScript compilation)
npm run build:webui  # Build modern WebUI only (Vite + Vue 3)
npm run start        # Run compiled JavaScript from dist/ (serves modern WebUI if built)

# Modern WebUI Development
npm run webui:dev    # Start Vite development server on port 3000 with HMR
npm run webui:preview # Preview built WebUI locally

# Testing
npm test                      # Run unit tests  
npm run test:coverage        # Run tests with coverage
npm run test:watch          # Watch mode for tests
npm run test:ci             # CI mode with coverage, no watch

# Modern WebUI Architecture:
# - Built with Vite 7 + Vue 3 + TypeScript
# - Modular component architecture with TypeScript API client
# - Real-time log viewer with syntax highlighting
# - Reactive state management with Vue Composition API
# - Automatic fallback to legacy HTML if modern build unavailable

# Test files are located in tests/ directory with same structure as src/
# Jest config excludes server.ts from coverage
```

## Docker Deployment

### Production Deployment

#### 标准部署（传统HTML WebUI）

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

# 代码同步重启（不重新构建镜像，适用于代码更新）
./scripts/sync-restart.sh
```

#### 现代WebUI部署（Vue 3 + TypeScript + Vite 7）⭐

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

# 现代WebUI特性：
# - Vue 3 + Composition API + TypeScript
# - Vite 7 构建系统with HMR
# - 模块化组件架构
# - 响应式状态管理
# - 现代化用户体验
```

### Development Environment

#### 标准开发环境

```bash
# 配置开发环境
cp .env.development .env.development.local
# 编辑配置文件

# 启动开发环境（使用开发配置）
./scripts/start.sh

# 开发环境特性：
- 使用 .env.development.local 配置
- 详细日志输出
- Redis开发实例
```

#### 现代WebUI开发环境⭐

```bash
# 配置开发环境
cp .env.development .env.development.local
# 编辑配置文件

# 现代WebUI开发
# 现已整合到标准Docker流程中
./scripts/start.sh        # 启动包含现代WebUI的完整服务

# WebUI开发说明：
# - 使用 npm run webui:dev 进行本地WebUI开发 (端口3000)  
# - 使用 npm run dev 进行后端开发 (端口8080)
# - 生产环境自动使用构建好的现代WebUI
```

### Docker Services

**Production Stack:**
- `fingerbot`: 主应用服务 (端口 8080)
- `redis`: 缓存和会话存储 (端口 6379) 
- `logrotate`: 自动日志轮转

**现代WebUI生产栈** (docker-compose.webui.yml)⭐:
- `fingerbot`: 主应用with Vue 3 + TypeScript WebUI (端口 8080)
- `redis`: 缓存和会话存储 (端口 6379)
- `logrotate`: 自动日志轮转
- **特色**: 内置现代WebUI，单一容器部署，生产级性能优化

**开发模式**: 
- 使用相同的Docker配置文件，通过不同的环境变量文件区分开发/生产环境
- 开发时使用 `.env.development.local` 配置文件

**代码同步模式** (docker-compose.sync.yml):
- 使用现有镜像，避免重新构建
- 挂载源代码和编译后的代码目录
- 适合代码更新时的快速部署
- 通过 `./scripts/sync-restart.sh` 启动

**Key Features:**
- 📁 日志文件持久化到宿主机 `./logs/` 目录
- 🔄 自动健康检查和重启策略
- 🛡️ 资源限制和安全配置  
- 📋 日志轮转和自动清理
- 🐳 多架构支持 (amd64/arm64)

### Log Management

```bash
# 实时查看应用日志
docker-compose logs -f fingerbot

# 查看宿主机日志文件
tail -f logs/app-$(date +%Y-%m-%d).log

# 日志文件自动按日期轮转
# 格式: logs/app-YYYY-MM-DD.log
```

## Environment Configuration

**System Requirements**
- Node.js >= 20.19.0

**Code Quality Checks**
- 项目当前没有配置 ESLint 或 Prettier
- 使用 TypeScript 进行类型检查：`npm run build:server` 
- 如需添加 lint 命令，请先配置 ESLint 并更新此文档

**Environment Setup**
Use template files for configuration:
- `.env.docker` - Production Docker environment template
- `.env.development` - Local development environment template

Copy and customize the appropriate template:
```bash
# For Docker deployment
cp .env.docker .env.docker.local
# Edit .env.docker.local with your values

# For local development  
cp .env.development .env.development.local
# Edit .env.development.local with your values
```

Required `.env` variables:
```env
# Core Configuration
NODE_ENV=development
PORT=8080
LOG_LEVEL=info

# Google Gemini API (支持多API Key轮换)
# 可以配置单个Key或逗号分隔的多个Key，系统会自动合并和去重
GEMINI_API_KEY=your-primary-api-key,backup-key-1,backup-key-2
# 可选：额外的备用Keys（会与GEMINI_API_KEY合并）
GEMINI_API_KEYS_BACKUP=backup-key-3,backup-key-4
GEMINI_MODEL=gemini-2.5-flash

# AI Settings
MAX_TOKENS=2000
TEMPERATURE=0.7

# WebSocket Configuration  
WS_SERVER_PATH=/ws

# Security
WEBHOOK_SECRET=your-secret

# Group Whitelist (comma-separated group IDs, empty = all groups allowed)
GROUP_WHITELIST=253631878,123456789

# Admin Configuration (user ID to receive error notifications)
ADMIN_USER_ID=2945791077

# Bot QQ ID (optional, for precise @bot detection)
# BOT_QQ_ID=123456789

# Stamina Management Configuration ⭐
STAMINA_MAX_STAMINA=100                   # 最大体力值 (default: 100)
STAMINA_REPLY_COST=10                     # 每次回复消耗体力 (default: 10)
STAMINA_REGEN_RATE=5                      # 体力恢复速率/分钟 (default: 5)
STAMINA_REGEN_INTERVAL=60000              # 体力恢复间隔毫秒 (default: 60000 = 1分钟)
STAMINA_LOW_THRESHOLD=30                  # 低体力阈值，低于此值降低回复频率 (default: 30)
STAMINA_CRITICAL_THRESHOLD=10             # 极低体力阈值，低于此值几乎不回复 (default: 10)
STAMINA_REST_MODE=false                   # 休息模式，暂停体力消耗 (default: false)

# Queue Processing Configuration ⭐
QUEUE_SILENCE_SECONDS=8                 # Silence trigger: seconds to wait before processing queue (default: 8)
QUEUE_MAX_SIZE=10                       # Size trigger: maximum messages in queue before force processing (default: 10)
QUEUE_MAX_AGE_SECONDS=30                # Age trigger: maximum age of oldest message before force processing (default: 30)
BOT_NAME=FingerBot                      # Bot name for high-priority message detection (default: FingerBot)

# Task Processing Configuration 
TASK_QUEUE_MAX_SIZE=1000                # Maximum task queue size (default: 1000)
TASK_RETRY_MAX_ATTEMPTS=3               # Maximum retry attempts for failed tasks (default: 3)

# Redis Configuration (Docker)
REDIS_HOST=redis
REDIS_PORT=6379
# REDIS_PASSWORD=your-redis-password

# Advanced Configuration (Optional)
HEALTH_CHECK_INTERVAL=30000             # Health check interval in ms
LOG_DIR=./logs                          # Log directory path  
ENABLE_FILE_LOGGING=true                # Enable file-based logging
MEMORY_LIMIT=512                        # Memory limit in MB (Docker)

# Development Only
DEBUG_MODE=true                         # Enable debug mode (development)
HOT_RELOAD=true                         # Enable hot reload (development)
```

## Key Features

**Modern WebUI Monitoring Dashboard** (Vue 3 + TypeScript + Vite 7)
- **Architecture**: Modern SPA built with Vue 3 Composition API and TypeScript
- **Real-time log viewing**: Advanced syntax highlighting for JSON and API calls with collapsible sections
- **Conversation history browser**: Interactive expandable message details with user-friendly display
- **Group whitelist management**: Dynamic interface for adding/removing groups with live updates
- **System status monitoring**: Real-time WebSocket and AI connectivity status with visual indicators
- **Development experience**: Hot Module Replacement (HMR) for instant development feedback
- **TypeScript API client**: Fully typed API communication with comprehensive error handling
- **Responsive design**: Mobile-friendly interface with modern CSS Grid/Flexbox layout
- **Accessible at**: `http://localhost:8080` (production) or `http://localhost:3000` (development)
- **Auto-fallback**: Gracefully falls back to legacy HTML if modern build unavailable

**Advanced Log Formatting & Features**
- **Intelligent log parsing**: Special formatting for Gemini API calls with expandable Prompt content
- **Syntax highlighting**: JSON syntax highlighting with collapsible sections using Vue reactivity
- **Structured display**: QQ message logs and connection events with enhanced readability
- **GitHub dark theme**: Professional styling optimized for long monitoring sessions
- **Auto-refresh**: Configurable automatic log updates with manual override controls
- **Export functionality**: Download logs as text files with timestamp information

**NapCat Integration**
- Professional WebSocket server based on production-grade reference implementation
- Handles OneBot v11/v12 protocol messages
- Automatic connection health monitoring and cleanup
- Support for both group and private message processing

**Asynchronous Task Processing System** 🚀
- Background task processing for non-blocking operations
- Separate task queues for different operation types:
  - SendMessage: Handles delayed message sending via WebSocket
  - StoreMemory: Manages conversation history persistence  
  - Thinking: Processes AI reasoning and decision logging
- Error handling and retry mechanisms for failed tasks
- Integrates with queue processing to prevent blocking message flow
- Detailed task tracking and monitoring for system reliability

**Error Handling and Notifications**
- When message processing fails, no error message is sent to users
- Instead, detailed error reports are automatically sent to the configured admin user via private message
- Error reports include: timestamp, user info, message content, error details, and stack trace
- Admin user ID is configurable via `ADMIN_USER_ID` environment variable

**Stamina Management System** ⭐
- **Purpose**: Controls bot reply frequency based on stamina levels to prevent overuse and create natural conversation flow
- **Core Mechanics**:
  - **Maximum Stamina**: Configurable upper limit (default: 100)
  - **Reply Cost**: Stamina consumed per response (default: 10)
  - **Regeneration**: Automatic stamina recovery every minute (default: +5 per minute)
  - **Probability-based Replies**: Lower stamina = lower reply probability
- **Stamina Levels**:
  - **High (70-100%)**: 💚 100% reply rate, full functionality
  - **Medium (50-70%)**: 💛 Gradually reduced reply rate
  - **Low (30-50%)**: 🧡 50-75% reply probability, conservative responses
  - **Critical (<30%)**: ❤️ 20% reply probability, minimal activity
- **Rest Mode**: Admin can enable to pause stamina consumption entirely
- **Queue Integration**: 
  - Stamina checked before processing message queues
  - Critical stamina level clears message queue to prevent backlog
  - Stamina consumed only after successful message processing
- **Admin Commands**:
  - `/stamina` - View detailed stamina status and statistics
  - `/stamina rest` - Toggle rest mode on/off
  - `/stamina set <value>` - Manually set stamina level (0-100)
- **Environmental Control**: All thresholds and rates configurable via environment variables

## Development Notes

**Code Quality Checks**: After completing any task, MUST run `npm run build:server` to ensure TypeScript compilation succeeds. The project currently lacks ESLint/Prettier - configure these tools if code linting is needed.

**Test Coverage**: Use Jest for testing with comprehensive coverage. Run `npm test` for unit tests, `npm run test:coverage` for coverage reports. Test files mirror the `src/` structure in `tests/` directory. The Jest configuration excludes `server.ts` from coverage reporting.

**No Compatibility Principle**: When refactoring architecture, directly delete unused files and configurations without maintaining backward compatibility. Keep the codebase clean and focused on current implementation.

**Message Format**: The system expects OneBot protocol messages from NapCat. Messages are processed through QQAdapter which:
- Converts CQ codes to readable format (e.g., `[CQ:at,qq=123456]` → `@123456`)
- Preserves @mentions in the message content for AI context
- Only removes @bot mentions if BOT_QQ_ID is configured
- Converts to internal Message format

**Conversation Memory**: Currently uses in-memory storage via MessageHandler. Each user/group combination maintains separate conversation context with configurable message history limits. Message context now displays user display names (group cards or QQ nicknames) instead of user IDs for better readability.

**WebSocket Connection**: NapCat should connect to `ws://localhost:8080/ws`. The server will log connection events and message processing in real-time, viewable through the WebUI.

**API Endpoints**:
- `GET /health` - Health check with connection status
- `GET /ws/status` - WebSocket connection details  
- `POST /chat` - Direct message sending
- `GET /conversation` - Retrieve conversation history
- `DELETE /conversation` - Clear conversation history
- `GET /api/logs` - Retrieve system logs for WebUI
- `GET /whitelist/status` - Group whitelist configuration
- `POST/DELETE /whitelist/groups` - Manage whitelisted groups

**Admin Commands** (管理员专用):
- `/help` - 显示所有可用管理员命令
- `/status` - 查看系统运行状态和对话统计（显示当前处理模式）
- `/clear` - 清除当前对话历史
- `/apikeys` - 查看所有API Key的详细状态
- `/resetkey <key前缀>` - 手动重置指定API Key的错误状态
- `/switchkey` - 强制切换到下一个可用的API Key
- **Queue Management Commands** ⭐:
  - `/queue status` - 查看消息队列状态和触发统计
  - `/queue flush` - 手动触发队列处理
  - `/queue clear` - 清空队列（不处理消息）
- **Stamina Management Commands** ⭐:
  - `/stamina` - 查看详细体力状态和统计信息
  - `/stamina rest` - 切换休息模式（暂停体力消耗）
  - `/stamina set <数值>` - 手动设置体力值（0-100）

The system is designed as a production-ready MVP with comprehensive logging, monitoring, and management capabilities while maintaining clean, modular architecture.

## Common Development Tasks

**Local Development Setup**
```bash
# Install dependencies and start development
npm install
npm run dev                # Start server with ts-node (port 8080)

# Modern WebUI development (recommended dual-server setup)  
npm run webui:dev          # Start Vite dev server (port 3000) with HMR
# Run npm run dev in another terminal for backend server

# Testing and Quality Assurance
npm test                   # Run unit tests with Jest
npm run test:watch        # Watch mode for test-driven development  
npm run test:coverage     # Generate coverage report (excludes server.ts)
npm run test:ci           # CI-optimized test run without watch
npm run build:server      # TypeScript compilation and type checking
```

**Building and Production**
```bash
npm run build             # Build both server (TypeScript) and modern WebUI (Vite)
npm run build:server      # TypeScript compilation only → dist/
npm run build:webui       # Vite build only → public-vite/
npm start                 # Run from compiled dist/ (requires build first)
```

**Docker Development Workflow**
```bash
# Docker development now uses the same 3 scripts
# For development, use the standard scripts with appropriate environment files

# Essential Docker Scripts (3 scripts only)
./scripts/start.sh        # Start Docker services (build and launch containers)
./scripts/stop.sh         # Stop Docker services  
./scripts/sync-restart.sh # Sync code updates to running containers without rebuilding

# Direct Docker Commands (alternative to scripts)
docker-compose logs -f fingerbot     # View application logs
docker-compose ps                    # Check service status
docker-compose restart               # Restart services
```

**Key File Locations for Development**
- `src/server.ts` - Main Fastify HTTP server with WebUI serving logic
- `src/utils/thinking-logger.ts` - AI reasoning and decision logging system
- `src/utils/bot-state-manager.ts` - Bot operational state management
- `src/utils/text-sanitizer.ts` - Text cleaning and sanitization utilities
- **Queue Processing Architecture** ⭐:
  - `src/core/enhanced-qq-agent-server.ts` - Primary QQ agent orchestrator
  - `src/core/message-queue-manager.ts` - Intelligent queue management with 5 trigger strategies
  - `src/core/batch-message-processor.ts` - Batch processing with enhanced context
  - `src/core/enhanced-agent.ts` - Unified queue-based processing interface
  - `src/core/message-queue-types.ts` - Queue system type definitions
- **AI & Processing Systems**:
  - `src/ai/gemini-client.ts` - Gemini API client with multi-key management
  - `src/ai/api-key-manager.ts` - Intelligent API key rotation and error handling
  - `src/core/task-queue.ts` - Asynchronous task processing system
  - `src/config/persona.ts` - Bot persona configuration
- **Infrastructure**:
  - `src/core/ws-server.ts` - WebSocket server for NapCat connectivity
  - `src/core/qq-adapter.ts` - QQ message format conversion and filtering
  - `src/core/message-handler.ts` - Conversation memory management utilities
  - `src/utils/` - Shared utilities (logger, config, whitelist)
  - `webui/src/` - Vue 3 + TypeScript WebUI components
  - `tests/` - Jest unit tests mirroring src/ structure
  - `scripts/` - Docker deployment and development scripts

## Intelligent Queue Processing System

### System Architecture ⭐

The system uses an **intelligent queue-based batch processing architecture** with 5 hybrid trigger strategies to optimize API usage while maintaining responsive message handling.

**Core Benefits**:
- **60-80% reduction** in API calls through smart batching
- Enhanced context understanding with complete conversation fragments
- Responsive timing prevents message delays while reducing costs
- Intelligent priority detection for immediate critical responses

### 5 Hybrid Trigger Strategies

**1. High Priority Trigger** (Immediate Processing)
- `@机器人` mentions
- Messages containing bot name
- Questions ending with `?` or `？`
- Command messages (`/help`, `/status`, etc.)
- Messages containing keywords (`help`, `帮助`)

**2. Silence Trigger** (8 seconds default)
- Processes queue when conversation goes quiet
- Optimizes for natural conversation flow
- Configurable via `QUEUE_SILENCE_SECONDS`

**3. Size Trigger** (10 messages default)
- Forces processing when queue reaches capacity
- Prevents excessive batching
- Configurable via `QUEUE_MAX_SIZE`

**4. Age Trigger** (30 seconds default)
- Ensures timely processing of oldest messages
- Prevents message delays in active conversations
- Configurable via `QUEUE_MAX_AGE_SECONDS`

**5. Manual Trigger** (Admin Control)
- `/queue flush` command for immediate processing
- `/queue clear` to reset queue state
- Administrative control for system management

### Configuration Examples

**Active Groups** (High message volume):
```env
QUEUE_SILENCE_SECONDS=10    # Longer silence for better batching
QUEUE_MAX_SIZE=15           # Larger batches for efficiency
QUEUE_MAX_AGE_SECONDS=45    # Allow longer accumulation
```

**Quiet Groups** (Low message volume):
```env
QUEUE_SILENCE_SECONDS=5     # Faster responses
QUEUE_MAX_SIZE=5            # Smaller batches
QUEUE_MAX_AGE_SECONDS=20    # Quicker processing
```

**Cost-Optimized** (Maximum API savings):
```env
QUEUE_SILENCE_SECONDS=15    # Extended batching time
QUEUE_MAX_SIZE=20           # Large batch sizes
QUEUE_MAX_AGE_SECONDS=60    # Longer accumulation periods
```

## Additional Documentation

This repository includes supplementary documentation files:
- `WEBUI.md` - Detailed WebUI development and deployment guide
- `DOCKER.md` - Comprehensive Docker setup and troubleshooting 
- `DEBUG.md` - Debugging guides and troubleshooting procedures
- `QUEUE_MODE_USAGE.md` - **NEW**: Comprehensive queue mode configuration and usage guide

Refer to these files for specific implementation details not covered in this overview.