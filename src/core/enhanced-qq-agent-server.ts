import { EnhancedChatAgent } from './enhanced-agent';
import { WSServer } from './ws-server';
import { QQMessageAdapter } from './qq-adapter';
import { QQMessage } from './qq-types';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { appendThinkingLog } from '../utils/thinking-logger';
import { TaskQueue, SendMessageTaskPayload, StoreMemoryTaskPayload } from './task-queue';
import { ChatResponse, ChatTask, ThinkingTask, ToolCallInfo } from './types';

/**
 * 增强型QQ聊天代理服务器
 * 
 * 基于队列模式的统一实现，负责对接 NapCat WebSocket 并驱动异步批量回复。
 */
export class EnhancedQQChatAgentServer extends EnhancedChatAgent {
  private wsServer: WSServer;
  private readonly taskQueue: TaskQueue;
  
  // 用于跟踪异步回复
  private pendingReplies: Map<string, {
    qqMessage: QQMessage;
    timestamp: number;
  }> = new Map();
  
  // 清理过期的 pending replies (30分钟)
  private readonly PENDING_REPLY_TIMEOUT = 30 * 60 * 1000;

  constructor() {
    super({
      botName: config.botName,
      silenceSeconds: config.messageQueue.silenceSeconds,
      maxQueueSize: config.messageQueue.maxQueueSize,
      maxQueueAgeSeconds: config.messageQueue.maxQueueAgeSeconds
    });
    
    this.wsServer = new WSServer();
    this.taskQueue = new TaskQueue();
    this.setupMessageHandling();
    this.setupQueueCallbacks();
    this.registerTaskHandlers();
    
    logger.info(`🚀 EnhancedQQChatAgentServer 初始化完成`, {
      queueMode: 'queue',
      queueConfig: config.messageQueue
    });
  }

  async initialize(): Promise<boolean> {
    logger.info('Initializing Enhanced QQ Chat Agent Server...');
    
    // 初始化基础Agent
    const baseInitialized = await super.initialize();
    if (!baseInitialized) {
      return false;
    }
    
    logger.info('Enhanced QQ Chat Agent Server initialized successfully');
    logger.info('🎯 Ready to accept NapCat connections on WebSocket /ws endpoint');
    return true;
  }

  // 获取WebSocket服务器实例，用于HTTP服务器集成
  getWSServer(): WSServer {
    return this.wsServer;
  }

  private setupMessageHandling(): void {
    this.wsServer.onMessage(async (qqMessage: QQMessage) => {
      try {
        await this.handleQQMessage(qqMessage);
      } catch (error) {
        logger.error('Error handling QQ message', error);
      }
    });

    // 监听其他事件（如群成员变动、好友申请等）
    this.wsServer.onEvent((event) => {
      logger.debug('Received QQ event', { type: event.post_type, event });
    });
  }

  private setupQueueCallbacks(): void {
    // 重写父类的队列事件监听器以支持回传
    const originalListener = this.createQueueEventListener();
    
    // 创建增强的事件监听器
    const enhancedListener = {
      ...originalListener,
      onQueueFlushed: async (result: any) => {
        // 调用原始的日志记录
        originalListener.onQueueFlushed?.(result);
        
        // 处理队列结果回传
        await this.handleQueueFlushResult(result);
      }
    };
    
    // 更新队列管理器的事件监听器
    if (this.messageQueueManager) {
      (this.messageQueueManager as any).eventListener = enhancedListener;
    }
  }

  private registerTaskHandlers(): void {
    this.taskQueue.registerHandler('send_message', async task => {
      const payload = task.payload as SendMessageTaskPayload;
      const { target, message, metadata } = payload;
      const qqMessage = metadata?.qqMessage as QQMessage | undefined;
      const pendingMessageId = metadata?.pendingMessageId as string | undefined;

      let success = false;

      try {
        if (target.groupId) {
          success = await this.wsServer.sendGroupMessage(target.groupId, message, target.atUser);
        } else if (target.userId) {
          success = await this.wsServer.sendPrivateMessage(target.userId, message);
        } else {
          throw new Error('Invalid message target');
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      if (!success) {
        throw new Error('Failed to deliver message via WebSocket server');
      }

      if (pendingMessageId) {
        this.removePendingReply(pendingMessageId);
      }

      logger.info('✅ 消息发送完成', {
        target,
        message: message.length > 200 ? message.substring(0, 200) + '...' : message,
        messageLength: message.length,
        qqMessageId: qqMessage?.message_id,
        taskId: task.id,
        attempts: task.attempts
      });
    });

    this.taskQueue.registerHandler('store_memory', async task => {
      const payload = task.payload as StoreMemoryTaskPayload;

      logger.debug('🧠 记录LLM思维过程', {
        memoryType: payload.memoryType,
        contentPreview: payload.content.slice(0, 80),
        metadata: payload.metadata
      });

      try {
        await appendThinkingLog({
          memoryType: payload.memoryType,
          content: payload.content,
          metadata: payload.metadata,
          recordedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.warn('⚠️ 思维链日志持久化失败', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  /**
   * 处理队列处理完成的结果
   */
  private async handleQueueFlushResult(result: any): Promise<void> {
    if (!result.processed || !result.response || result.response.skipReply) {
      logger.debug('📦 队列处理完成但无需发送回复', {
        processed: result.processed,
        skipReply: result.response?.skipReply || false,
        messages: result.messages
      });
      return;
    }

    const response = result.response as ChatResponse;
    const chatTasks = this.normalizeChatTasks(response);

    // 从批处理结果中提取消息ID（需要从BatchMessageProcessor传递）
    const messageIds = this.extractMessageIdsFromResult(result);
    
    // 获取对应的pending replies
    const pendingReplies = this.getPendingRepliesForMessages(messageIds);
    
    if (pendingReplies.length === 0) {
      logger.warn('📦 队列处理完成但找不到对应的待处理回复', {
        messageIds,
        pendingRepliesCount: this.pendingReplies.size,
        messages: result.messages
      });
      return;
    }

    if (chatTasks.length === 0) {
      for (const pending of pendingReplies) {
        this.removePendingReply(pending.messageId);
      }

      logger.debug('📦 队列处理完成但未生成任何任务', {
        messages: result.messages
      });
      return;
    }

    const replyTasks = chatTasks.filter((task): task is Extract<typeof chatTasks[number], { type: 'reply' }> => task.type === 'reply');
    const replyMessageCount = replyTasks.reduce((count, task) => count + task.content.length, 0);

    logger.info(`📤 开始处理队列任务`, {
      messageCount: pendingReplies.length,
      replyCount: replyTasks.length,
      replyMessageCount,
      tokensUsed: response.tokensUsed || 0,
      messages: result.messages
    });

    await this.enqueueChatTasks(chatTasks, pendingReplies, response, result.contextId);
  }

  /**
   * 从批处理结果中提取消息ID
   */
  private extractMessageIdsFromResult(result: any): string[] {
    // 优先使用响应中的消息ID列表
    if (result.response?.messageIds && Array.isArray(result.response.messageIds)) {
      return result.response.messageIds;
    }

    // 其次使用结果携带的消息摘要
    if (Array.isArray(result.messages) && result.messages.length > 0) {
      const ids = result.messages
        .map((msg: { messageId?: string }) => msg.messageId)
        .filter((id: string | undefined): id is string => !!id);
      if (ids.length > 0) {
        return ids;
      }
    }
    
    // 备选：使用结果中的消息ID列表
    if (result.messageIds && Array.isArray(result.messageIds)) {
      return result.messageIds;
    }
    
    // Fallback: 返回所有当前的pending reply keys
    // 这确保在没有明确关联时也能发送回复
    const allKeys = Array.from(this.pendingReplies.keys());
    logger.warn('使用fallback策略提取消息ID', {
      fallbackCount: allKeys.length,
      pendingRepliesSize: this.pendingReplies.size,
      messages: result.messages
    });
    return allKeys;
  }

  private normalizeChatTasks(response: ChatResponse): ChatTask[] {
    if (Array.isArray(response.tasks) && response.tasks.length > 0) {
      return response.tasks
        .map(task => {
          if (task.type === 'thinking') {
            const trimmed = task.content.trim();
            return trimmed.length > 0 ? { type: 'thinking', content: trimmed } : null;
          }

          const replies = task.content.map(reply => reply.trim()).filter(reply => reply.length > 0);
          return replies.length > 0 ? { type: 'reply', content: replies } : null;
        })
        .filter((task): task is ChatTask => task !== null);
    }

    const tasks: ChatTask[] = [];

    if (response.thinking && response.thinking.trim().length > 0) {
      tasks.push({ type: 'thinking', content: response.thinking.trim() });
    }

    const fallbackReplies = (response.replies ?? [])
      .concat(response.content ? [response.content] : [])
      .map(reply => reply.trim())
      .filter(reply => reply.length > 0);

    if (fallbackReplies.length > 0) {
      tasks.push({ type: 'reply', content: fallbackReplies });
    }

    return tasks;
  }

  private async enqueueChatTasks(
    tasks: ChatTask[],
    pendingReplies: Array<{ messageId: string; qqMessage: QQMessage }>,
    response: ChatResponse,
    contextId?: string
  ): Promise<void> {
    const primaryPending = pendingReplies[pendingReplies.length - 1];
    const associatedMessageIds = pendingReplies.map(item => item.messageId);

    const aggregateReplies = this.collectRepliesFromTasks(tasks);

    for (const task of tasks) {
      if (task.type === 'thinking') {
        await this.enqueueThinkingTask(task, associatedMessageIds, contextId, aggregateReplies);
        continue;
      }

      if (!primaryPending) {
        logger.warn('⚠️ 无可用的待处理消息，跳过回复任务', {
          task,
          contextId
        });
        continue;
      }

      for (const replyContent of task.content) {
        try {
          const replyPayload: ChatResponse = {
            content: replyContent,
            timestamp: response.timestamp || new Date(),
            tokensUsed: response.tokensUsed,
            replies: task.content
          };

          const replyText = QQMessageAdapter.formatReply(replyPayload, primaryPending.qqMessage);
          await this.sendReply(primaryPending.qqMessage, replyText, primaryPending.messageId, response.toolCalls);
        } catch (error) {
          logger.error(`❌ 队列回复发送失败 - ID:${primaryPending.qqMessage.message_id}`, error);
          await this.notifyAdminError(primaryPending.qqMessage, error);
        }
      }
    }

    // 清理除主消息之外的pending记录，避免重复发送
    const primaryId = primaryPending?.messageId;
    for (const pending of pendingReplies) {
      if (!primaryId || pending.messageId === primaryId) {
        continue;
      }
      this.removePendingReply(pending.messageId);
    }
  }

  private async enqueueThinkingTask(
    task: ThinkingTask,
    associatedMessageIds: string[],
    contextId: string | undefined,
    aggregateReplies: string[]
  ): Promise<void> {
    const payload: StoreMemoryTaskPayload = {
      memoryType: 'thinking',
      content: task.content,
      description: 'LLM思维链记录',
      metadata: {
        contextId,
        associatedMessageIds,
        createdAt: new Date().toISOString(),
        finalReplies: aggregateReplies
      }
    };

    try {
      await this.taskQueue.enqueue('store_memory', payload);
    } catch (error) {
      logger.warn('⚠️ 思维链任务入队失败', {
        error: error instanceof Error ? error.message : String(error),
        contextId
      });
    }
  }

  private collectRepliesFromTasks(tasks: ChatTask[]): string[] {
    return tasks
      .filter((task): task is Extract<ChatTask, { type: 'reply' }> => task.type === 'reply')
      .flatMap(task => task.content)
      .map(reply => reply.trim())
      .filter(reply => reply.length > 0);
  }

  private async handleQQMessage(qqMessage: QQMessage): Promise<void> {
    // 记录消息信息
    QQMessageAdapter.logMessageInfo(qqMessage);
    
    // 检查是否需要回复
    if (!QQMessageAdapter.shouldReply(qqMessage)) {
      logger.info(`🚫 消息已忽略 (无需回复) - ID:${qqMessage.message_id}`);
      return;
    }

    // 转换为内部消息格式
    const message = QQMessageAdapter.fromQQMessage(qqMessage);
    
    // 如果消息内容为空，跳过处理
    if (!message.content) {
      logger.warn(`⚠️  消息内容为空，跳过处理 - ID:${qqMessage.message_id}`);
      return;
    }

    // 生成内容预览
    const preview = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
    logger.info(`🤖 开始处理消息 - ID:${qqMessage.message_id} 内容: ${preview}`);

    try {
      // 将消息添加到待处理回复队列
      this.addToPendingReplies(message.id, qqMessage);
      
      // 处理消息并获取AI回复
      const response = await this.processMessage(
        message.userId,
        message.content,
        message.groupId,
        message.userName,
        {
          messageId: message.id,
          timestamp: message.timestamp,
          messageType: message.type
        }
      );

      // 检查是否需要发送回复
      if (response.skipReply) {
        logger.debug(`📦 消息已进入队列处理 - ID:${qqMessage.message_id}`);
        return; // 静默跳过，等待队列回调处理
      }

      // 如果是立即回复（高优先级），直接发送并清理pending
      if (response.content) {
        // 格式化回复消息
        const replyText = QQMessageAdapter.formatReply(response, qqMessage);
        
        // 发送回复
        await this.sendReply(qqMessage, replyText, message.id, response.toolCalls);
        
        logger.info(`✅ 立即回复发送成功 - ID:${qqMessage.message_id} 长度:${replyText.length}字符 Token:${response.tokensUsed || 0}`);
      }
      
    } catch (error) {
      logger.error(`❌ 消息处理失败 - ID:${qqMessage.message_id} 用户:${qqMessage.user_id}`, { 错误详情: error });
      
      // 清理失败的pending reply
      this.removePendingReply(message.id);
      
      // 向管理员发送错误详情
      await this.notifyAdminError(qqMessage, error);
    }
  }

  /**
   * 将消息添加到待处理回复队列
   */
  private addToPendingReplies(messageId: string, qqMessage: QQMessage): void {
    const preview = qqMessage.raw_message && qqMessage.raw_message.length > 100
      ? `${qqMessage.raw_message.substring(0, 100)}...`
      : qqMessage.raw_message || '';

    this.pendingReplies.set(messageId, {
      qqMessage,
      timestamp: Date.now()
    });
    
    // 清理过期的pending replies
    this.cleanupExpiredPendingReplies();
    
    logger.debug('📝 已添加到待处理队列', {
      messageId,
      queueSize: this.pendingReplies.size,
      contentPreview: preview
    });
  }

  /**
   * 从待处理回复队列中移除消息
   */
  private removePendingReply(messageId: string): boolean {
    const removed = this.pendingReplies.delete(messageId);
    if (removed) {
      logger.debug('🗑️  已从待处理队列移除', {
        messageId,
        queueSize: this.pendingReplies.size
      });
    }
    return removed;
  }

  /**
   * 清理过期的待处理回复
   */
  private cleanupExpiredPendingReplies(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [messageId, entry] of this.pendingReplies.entries()) {
      if (now - entry.timestamp > this.PENDING_REPLY_TIMEOUT) {
        expiredKeys.push(messageId);
      }
    }
    
    for (const key of expiredKeys) {
      this.pendingReplies.delete(key);
      logger.warn(`⏰ 清理过期的待处理回复 - ID:${key}`);
    }
    
    if (expiredKeys.length > 0) {
      logger.info(`🧹 清理了 ${expiredKeys.length} 个过期的待处理回复`);
    }
  }

  /**
   * 获取队列中等待回复的消息
   */
  private getPendingRepliesForMessages(messageIds: string[]): Array<{messageId: string, qqMessage: QQMessage}> {
    const results: Array<{messageId: string, qqMessage: QQMessage}> = [];
    
    for (const messageId of messageIds) {
      const entry = this.pendingReplies.get(messageId);
      if (entry) {
        results.push({
          messageId,
          qqMessage: entry.qqMessage
        });
      }
    }
    
    return results;
  }

  private async sendReply(qqMessage: QQMessage, replyText: string, pendingMessageId: string, toolCalls?: ToolCallInfo[]): Promise<void> {
    const isGroup = qqMessage.message_type === 'group';
    
    // 从工具调用中提取@用户信息
    let atUser: number | undefined;
    if (toolCalls && isGroup) {
      const mentionTool = toolCalls.find(call => call.name === 'mention_user' && call.result?.action === 'mention');
      if (mentionTool && mentionTool.result?.userId) {
        atUser = mentionTool.result.userId;
        logger.info('🔧 从工具调用中提取@用户', {
          userId: atUser,
          reason: mentionTool.result.reason
        });
      }
    }

    const payload: SendMessageTaskPayload = {
      target: isGroup && qqMessage.group_id ? {
        groupId: qqMessage.group_id,
        atUser
      } : {
        userId: qqMessage.user_id
      },
      message: replyText,
      metadata: {
        qqMessage,
        pendingMessageId
      }
    };

    try {
      await this.taskQueue.enqueue('send_message', payload);
    } catch (error) {
      this.removePendingReply(pendingMessageId);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private formatErrorMessage(error: any): string {
    if (!error) {
      return '未知错误';
    }

    // 如果是 GoogleGenerativeAI 错误，提取更多信息
    if (error.message && error.message.includes('GoogleGenerativeAI Error')) {
      let errorInfo = error.message;
      
      // 如果有 cause 属性，添加原因信息
      if (error.cause) {
        errorInfo += `\n原因: ${error.cause.message || error.cause}`;
        
        // 如果是网络错误，添加更多详情
        if (error.cause.code) {
          errorInfo += `\n错误代码: ${error.cause.code}`;
        }
        if (error.cause.errno) {
          errorInfo += `\n系统错误号: ${error.cause.errno}`;
        }
        if (error.cause.syscall) {
          errorInfo += `\n系统调用: ${error.cause.syscall}`;
        }
      }
      
      return errorInfo;
    }

    // 其他错误类型的处理
    if (error.message) {
      return error.message;
    }

    // 如果error是字符串
    if (typeof error === 'string') {
      return error;
    }

    // 尝试JSON序列化
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  private async notifyAdminError(qqMessage: QQMessage, error: any): Promise<void> {
    const adminUserId = parseInt(process.env.ADMIN_USER_ID || '2945791077');
    
    // 构建错误详情消息
    const userDisplayName = qqMessage.sender?.nickname || `用户${qqMessage.user_id}`;
    const messageType = qqMessage.message_type === 'group' ? '群聊' : '私聊';
    const groupInfo = qqMessage.group_id ? `群${qqMessage.group_id}` : '';
    const messagePreview = qqMessage.raw_message?.substring(0, 50) + (qqMessage.raw_message?.length > 50 ? '...' : '');
    
    const errorMessage = `🚨 消息处理错误报告\n\n` +
      `📅 时间: ${new Date().toLocaleString('zh-CN')}\n` +
      `👤 用户: ${userDisplayName}(${qqMessage.user_id})\n` +
      `💬 消息类型: ${messageType}${groupInfo ? ` [${groupInfo}]` : ''}\n` +
      `📝 消息内容: ${messagePreview}\n` +
      `🆔 消息ID: ${qqMessage.message_id}\n` +
      '⚙️  处理模式: 队列模式\n\n' +
      `❌ 错误信息:\n${this.formatErrorMessage(error)}\n\n` +
      `🔍 错误详情:\n${error?.stack || '无堆栈信息'}`;
    
    try {
      const success = await this.wsServer.sendPrivateMessage(adminUserId, errorMessage);
      if (success) {
        logger.info(`📨 已向管理员(${adminUserId})发送错误报告`);
      } else {
        logger.warn(`⚠️  向管理员发送错误报告失败 - 连接状态:${this.wsServer.isConnected()}`);
      }
    } catch (notifyError) {
      logger.error('向管理员发送错误通知失败', notifyError);
    }
  }

  // 获取连接状态
  getConnectionStatus(): { websocket: boolean; ai: boolean; connections: any } {
    const connectionInfo = this.wsServer.getConnectionInfo();
    
    return {
      websocket: this.wsServer.isConnected(),
      ai: true, // 假设AI连接正常，实际可以添加更详细的检查
      connections: connectionInfo
    };
  }

  // 手动发送消息（用于测试或管理）
  async sendMessage(target: { userId?: number; groupId?: number }, message: string): Promise<boolean> {
    try {
      if (target.groupId) {
        return await this.wsServer.sendGroupMessage(target.groupId, message);
      } else if (target.userId) {
        return await this.wsServer.sendPrivateMessage(target.userId, message);
      }
      return false;
    } catch (error) {
      logger.error('Failed to send manual message', error);
      return false;
    }
  }

  // 广播消息到所有连接（管理功能）
  async broadcastToAllConnections(message: string): Promise<boolean> {
    logger.info('Broadcasting message to all connections', { messageLength: message.length });
    // 这里可以实现向所有活跃的群聊发送消息的逻辑
    // 暂时返回连接状态
    return this.wsServer.isConnected();
  }

  // 优雅关闭
  async shutdown(): Promise<void> {
    logger.info('Shutting down Enhanced QQ Chat Agent Server...');
    
    try {
      await this.taskQueue.shutdown();
      await this.wsServer.close();
      await super.shutdown();
      
      // 清理待处理的回复
      this.pendingReplies.clear();
      
      logger.info('Enhanced QQ Chat Agent Server shutdown complete');
    } catch (error) {
      logger.error('Error during Enhanced QQ Chat Agent Server shutdown', error);
    }
  }
}
