import Fastify from 'fastify';
import path from 'path';
import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import { EnhancedQQChatAgentServer } from './core/enhanced-qq-agent-server';
import { WhitelistManager } from './utils/whitelist-manager';

const fastify = Fastify({
  logger: false, // 使用自定义日志
});

// 注册静态文件服务 - 优先使用Vite构建的现代WebUI
const publicViteDir = path.join(__dirname, '..', 'public-vite');
const publicLegacyDir = path.join(__dirname, '..', 'public');

// 检查是否存在Vite构建的文件
const fs = require('fs');
const useViteUI = fs.existsSync(publicViteDir);

fastify.register(require('@fastify/static'), {
  root: useViteUI ? publicViteDir : publicLegacyDir,
  prefix: '/',
});

// 如果使用Vite UI，添加SPA回退支持
if (useViteUI) {
  fastify.setNotFoundHandler(async (request, reply) => {
    // 如果请求的是API路径，返回404
    if (request.url.startsWith('/api') || request.url.startsWith('/ws') || request.url.startsWith('/whitelist')) {
      reply.status(404).send({ error: 'API endpoint not found' });
      return;
    }
    // 否则返回index.html以支持Vue Router
    const indexPath = path.join(publicViteDir, 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    reply.type('text/html').send(indexContent);
  });
}

// 始终使用增强型队列代理
const chatAgent = new EnhancedQQChatAgentServer();

logger.info('🤖 使用增强型聊天代理 (队列模式)', {
  queueConfig: config.messageQueue
});

// 健康检查端点
fastify.get('/health', async (request, reply) => {
  const connectionStatus = chatAgent.getConnectionStatus();
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: connectionStatus
  };
});

// WebSocket状态检查
fastify.get('/ws/status', async (request, reply) => {
  const connectionStatus = chatAgent.getConnectionStatus();
  return {
    connected: connectionStatus.websocket,
    ai_ready: connectionStatus.ai,
    connections: connectionStatus.connections,
    timestamp: new Date().toISOString()
  };
});

// 注释掉旧的WebSocket端点，将使用独立WebSocket服务器
// fastify.register(async function (fastify) {
//   (fastify as any).get('/ws', { websocket: true }, (connection: any, req: any) => {
//     // 旧的WebSocket处理逻辑
//   });
// });

// 聊天接口
fastify.post<{
  Body: {
    userId: string;
    message: string;
    groupId?: string;
  }
}>('/chat', async (request, reply) => {
  const { userId, message, groupId } = request.body;

  if (!userId || !message) {
    return reply.status(400).send({
      error: 'userId and message are required'
    });
  }

  try {
    const response = await chatAgent.processMessage(userId, message, groupId);
    
    return {
      success: true,
      data: {
        response: response.content,
        timestamp: response.timestamp,
        tokensUsed: response.tokensUsed
      }
    };
  } catch (error) {
    logger.error('Chat endpoint error', error);
    return reply.status(500).send({
      error: 'Failed to process message'
    });
  }
});

// 获取对话历史
fastify.get<{
  Querystring: {
    userId: string;
    groupId?: string;
  }
}>('/conversation', async (request, reply) => {
  const { userId, groupId } = request.query;

  if (!userId) {
    return reply.status(400).send({
      error: 'userId is required'
    });
  }

  // 通过反射访问私有方法（仅用于MVP演示）
  const conversation = (chatAgent as any).messageHandler.getConversation(userId, groupId);
  
  return {
    success: true,
    data: {
      messages: conversation,
      count: conversation.length
    }
  };
});

// 清除对话历史
fastify.delete<{
  Body: {
    userId: string;
    groupId?: string;
  }
}>('/conversation', async (request, reply) => {
  const { userId, groupId } = request.body;

  if (!userId) {
    return reply.status(400).send({
      error: 'userId is required'
    });
  }

  // 通过发送 /clear 命令来清除对话
  await chatAgent.processMessage(userId, '/clear', groupId);
  
  return {
    success: true,
    message: 'Conversation cleared'
  };
});

// 获取白名单状态
fastify.get('/whitelist/status', async (request, reply) => {
  const whitelist = WhitelistManager.getInstance();
  return {
    success: true,
    data: whitelist.getWhitelistStatus()
  };
});

// 获取白名单群组列表
fastify.get('/whitelist/groups', async (request, reply) => {
  const whitelist = WhitelistManager.getInstance();
  return {
    success: true,
    data: {
      groups: whitelist.getWhitelistedGroups()
    }
  };
});

// 添加群组到白名单
fastify.post<{
  Body: {
    groups: string[];
  }
}>('/whitelist/groups', async (request, reply) => {
  const { groups } = request.body;

  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return reply.status(400).send({
      error: 'groups array is required'
    });
  }

  const whitelist = WhitelistManager.getInstance();
  const result = whitelist.addGroups(groups);
  
  return {
    success: true,
    data: result
  };
});

// 从白名单移除群组
fastify.delete<{
  Body: {
    groups: string[];
  }
}>('/whitelist/groups', async (request, reply) => {
  const { groups } = request.body;

  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return reply.status(400).send({
      error: 'groups array is required'
    });
  }

  const whitelist = WhitelistManager.getInstance();
  const removed: string[] = [];
  const notFound: string[] = [];

  groups.forEach(groupId => {
    if (whitelist.removeGroup(groupId)) {
      removed.push(groupId);
    } else {
      notFound.push(groupId);
    }
  });
  
  return {
    success: true,
    data: {
      removed,
      notFound
    }
  };
});

// 日志API
fastify.get('/api/logs', async (request, reply) => {
  const { limit, offset, start, end } = request.query as {
    limit?: string;
    offset?: string;
    start?: string;
    end?: string;
  };

  const logLimit = limit ? parseInt(limit, 10) : 200;
  const logOffset = offset ? parseInt(offset, 10) : 0;

  if (Number.isNaN(logLimit) || logLimit <= 0) {
    return reply.status(400).send({ success: false, error: 'Invalid limit parameter' });
  }

  if (Number.isNaN(logOffset) || logOffset < 0) {
    return reply.status(400).send({ success: false, error: 'Invalid offset parameter' });
  }

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (start) {
    startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid start parameter' });
    }
  }

  if (end) {
    endDate = new Date(end);
    if (Number.isNaN(endDate.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid end parameter' });
    }
  }

  try {
    const { logs, total, source } = await logger.getLogsByRange({
      start: startDate,
      end: endDate,
      limit: logLimit,
      offset: logOffset
    });

    const hasMore = logOffset + logs.length < total;

    return {
      success: true,
      logs,
      count: logs.length,
      total,
      offset: logOffset,
      limit: logLimit,
      hasMore,
      range: {
        start: startDate ? startDate.toISOString() : undefined,
        end: endDate ? endDate.toISOString() : undefined,
        source
      }
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_RANGE' || error.message === 'INVALID_RANGE_ORDER') {
        return reply.status(400).send({ success: false, error: 'Invalid date range' });
      }
      if (error.message === 'RANGE_TOO_LARGE') {
        return reply.status(400).send({ success: false, error: 'Date range is too large (max 7 days)' });
      }
    }

    logger.error('获取日志失败', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({ success: false, error: 'Failed to fetch logs' });
  }
});

// 对话历史API
fastify.get('/api/conversations', async (request, reply) => {
  try {
    // 通过反射访问私有方法获取所有对话
    const conversations = (chatAgent as any).messageHandler.getAllConversations();
    
    return {
      success: true,
      conversations,
      count: conversations.length
    };
  } catch (error) {
    logger.error('获取对话历史失败', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch conversations'
    });
  }
});

// API Key 管理 API
fastify.get('/api/apikeys/status', async (request, reply) => {
  try {
    // 通过反射访问Gemini客户端的API Key管理器
    const geminiClient = (chatAgent as any).geminiClient;
    const keyManager = geminiClient.keyManager;
    
    const status = keyManager.getStatus();
    
    return {
      success: true,
      data: status
    };
  } catch (error) {
    logger.error('获取API Key状态失败', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch API key status'
    });
  }
});

fastify.post<{
  Body: {
    keyPreview: string;
  }
}>('/api/apikeys/reset', async (request, reply) => {
  const { keyPreview } = request.body;

  if (!keyPreview) {
    return reply.status(400).send({
      success: false,
      error: 'keyPreview is required'
    });
  }

  try {
    // 通过反射访问Gemini客户端的API Key管理器
    const geminiClient = (chatAgent as any).geminiClient;
    const keyManager = geminiClient.keyManager;
    
    const success = keyManager.resetApiKey(keyPreview);
    
    if (success) {
      logger.info('✅ API Key手动重置成功', { keyPreview });
      return {
        success: true,
        message: `API Key ${keyPreview} 状态已重置`
      };
    } else {
      return reply.status(404).send({
        success: false,
        error: 'API Key not found'
      });
    }
  } catch (error) {
    logger.error('重置API Key状态失败', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to reset API key'
    });
  }
});

fastify.post('/api/apikeys/switch', async (request, reply) => {
  try {
    // 通过反射访问Gemini客户端
    const geminiClient = (chatAgent as any).geminiClient;
    
    // 调用GeminiClient的强制切换方法，这会正确地重新初始化客户端
    geminiClient.forceKeySwitch();
    
    // 获取切换后的状态
    const keyManager = geminiClient.keyManager;
    const currentKey = keyManager.getCurrentApiKey();
    
    logger.info('✅ API Key手动切换成功', { 
      newKey: `${currentKey.substring(0, 10)}...` 
    });
    
    return {
      success: true,
      message: '已切换到下一个可用的API Key',
      currentKey: `${currentKey.substring(0, 10)}...`
    };
  } catch (error) {
    logger.error('切换API Key失败', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to switch API key'
    });
  }
});

// Stamina management endpoints
fastify.get('/api/stamina/status', async (request, reply) => {
  try {
    const queueManager = (chatAgent as any).messageQueueManager;
    if (!queueManager) {
      return reply.status(503).send({
        success: false,
        error: 'Queue manager not initialized'
      });
    }

    const staminaStatus = queueManager.getStaminaStatus();
    const staminaStats = queueManager.getStaminaStats();
    
    return {
      success: true,
      status: staminaStatus,
      stats: staminaStats
    };
  } catch (error) {
    logger.error('获取体力状态失败', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stamina status'
    });
  }
});

fastify.post<{
  Body: {
    value: number;
  }
}>('/api/stamina/set', async (request, reply) => {
  try {
    const { value } = request.body;
    
    if (typeof value !== 'number' || value < 0 || value > 100) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid stamina value. Must be between 0 and 100.'
      });
    }

    const queueManager = (chatAgent as any).messageQueueManager;
    if (!queueManager) {
      return reply.status(503).send({
        success: false,
        error: 'Queue manager not initialized'
      });
    }

    const newStatus = queueManager.adjustStamina(value);
    
    logger.info(`🔧 通过API调整体力值: ${value}`, { newStatus });
    
    return {
      success: true,
      message: `体力值已设置为 ${newStatus.current}/${newStatus.max}`,
      status: newStatus
    };
  } catch (error) {
    logger.error('设置体力值失败', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set stamina'
    });
  }
});

fastify.post<{
  Body: {
    enabled: boolean;
  }
}>('/api/stamina/rest', async (request, reply) => {
  try {
    const { enabled } = request.body;
    
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: 'Invalid rest mode value. Must be boolean.'
      });
    }

    const queueManager = (chatAgent as any).messageQueueManager;
    if (!queueManager) {
      return reply.status(503).send({
        success: false,
        error: 'Queue manager not initialized'
      });
    }

    queueManager.setStaminaRestMode(enabled);
    const newStatus = queueManager.getStaminaStatus();
    
    logger.info(`🔧 通过API${enabled ? '启用' : '关闭'}休息模式`, { newStatus });
    
    return {
      success: true,
      message: `休息模式已${enabled ? '启用' : '关闭'}`,
      status: newStatus
    };
  } catch (error) {
    logger.error('设置休息模式失败', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set rest mode'
    });
  }
});

// 启动服务器
async function startServer() {
  try {
    // 验证配置
    if (!validateConfig()) {
      process.exit(1);
    }

    logger.info('Starting server...');

    // 初始化聊天Agent
    const initialized = await chatAgent.initialize();
    if (!initialized) {
      logger.error('Failed to initialize EnhancedChatAgent');
      process.exit(1);
    }

    // 启动HTTP服务器
    const server = await fastify.listen({
      port: config.port,
      host: '0.0.0.0'
    });

    // 启动WebSocket服务器（附加到HTTP服务器）
    const wsServer = chatAgent.getWSServer();
    wsServer.start(fastify.server);

    logger.info(`🚀 HTTP服务器运行在 http://localhost:${config.port}`);
    logger.info(`🔌 WebSocket服务器运行在 ws://localhost:${config.port}${config.websocket.serverPath}`);
    logger.info('');
    logger.info('📋 可用端点:');
    logger.info('  GET  /health - 健康检查');
    logger.info('  GET  /ws/status - WebSocket连接状态');
    logger.info('  WS   /ws - WebSocket端点 (NapCat连接)');
    logger.info('  POST /chat - 发送消息到Agent');
    logger.info('  GET  /conversation - 获取对话历史');
    logger.info('  DELETE /conversation - 清除对话历史');
    logger.info('  GET  /whitelist/status - 白名单状态');
    logger.info('  GET  /whitelist/groups - 白名单群组列表');
    logger.info('  POST /whitelist/groups - 添加群组到白名单');
    logger.info('  DELETE /whitelist/groups - 从白名单移除群组');
    logger.info('  GET  /api/logs - 获取系统日志');
    logger.info('  GET  /api/conversations - 获取对话历史');
    logger.info('  GET  /api/apikeys/status - 获取API Key状态');
    logger.info('  POST /api/apikeys/reset - 重置API Key状态');
    logger.info('  POST /api/apikeys/switch - 切换API Key');
    logger.info('  GET  /api/stamina/status - 获取体力状态');
    logger.info('  POST /api/stamina/set - 设置体力值');
    logger.info('  POST /api/stamina/rest - 设置休息模式');
    logger.info('');
    logger.info(`🌐 WebUI管理界面: http://localhost:${config.port}`);
    logger.info(`🤖 智能QQ机器人已就绪！`);
    logger.info(`📱 请将你的NapCat连接到: ws://localhost:${config.port}${config.websocket.serverPath}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  
  try {
    await chatAgent.shutdown();
    await fastify.close();
    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  
  try {
    await chatAgent.shutdown();
    await fastify.close();
    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

// 启动应用
startServer();
