import { logger } from '../utils/logger';
import { GeminiClient } from '../ai/gemini-client';
import { MessageHandler } from './message-handler';
import { BotStateManager } from '../utils/bot-state-manager';
import { config } from '../utils/config';
import { QueuedMessage, IMessageProcessor } from './message-queue-types';
import { ChatResponse } from './types';

/**
 * 批量消息处理器
 * 
 * 实现 IMessageProcessor 接口，负责处理队列中的多条消息。
 * 相比单条消息处理，这里会将多条消息作为一个批次进行AI决策和回复生成。
 */
export class BatchMessageProcessor implements IMessageProcessor {
  private readonly geminiClient: GeminiClient;
  private readonly messageHandler: MessageHandler;
  private readonly botStateManager: BotStateManager;

  constructor() {
    this.geminiClient = new GeminiClient();
    this.messageHandler = new MessageHandler();
    this.botStateManager = BotStateManager.getInstance();
  }

  /**
   * 处理批量消息
   * 
   * @param messages 队列中的消息列表
   * @param context 格式化后的上下文字符串
   * @returns 处理结果
   */
  async processMessages(messages: QueuedMessage[], context: string): Promise<ChatResponse> {
    if (messages.length === 0) {
      return {
        content: '',
        timestamp: new Date(),
        skipReply: true
      };
    }

    logger.info(`🔄 开始批量处理 ${messages.length} 条消息`, {
      userIds: messages.map(m => m.userId),
      timespan: this.getTimespan(messages),
      hasHighPriority: messages.some(m => m.isHighPriority)
    });

    // 1. 将消息添加到会话历史中（用于上下文管理）
    this.addMessagesToHistory(messages);

    // 2. 检查群聊功能状态（如果是群聊消息）
    const groupId = messages.find(m => m.groupId)?.groupId;
    if (groupId && !this.botStateManager.isGroupChatActive()) {
      logger.info('🔴 群聊功能已关闭，跳过批量消息处理', { 
        groupId,
        messageCount: messages.length 
      });
      
      return {
        content: '',
        timestamp: new Date(),
        tokensUsed: 0,
        skipReply: true
      };
    }

    // 3. 生成AI回复
    try {
      // 构建增强的上下文，包含批次信息
      const conversationContext = this.getConversationContext(messages);
      const enhancedContext = this.buildBatchContext(messages, context, conversationContext);
      
      // 构建工具执行上下文
      const latestMessage = messages[messages.length - 1];
      const toolContext = {
        userId: parseInt(latestMessage.userId),
        groupId: latestMessage.groupId ? parseInt(latestMessage.groupId) : undefined,
        messageType: latestMessage.groupId ? 'group' as const : 'private' as const
      };

      const response = await this.geminiClient.generateResponse(
        this.extractMainContent(messages), 
        enhancedContext,
        toolContext
      );

      // 5. 将AI回复添加到会话历史
      const replies = response.replies ?? (response.content ? [response.content] : []);

      if (replies.length > 0) {
        const aiMessage = this.messageHandler.createMessage(
          config.botId || 'assistant', 
          replies[0], 
          latestMessage.groupId, 
          'AI助手',
          latestMessage.groupId || latestMessage.userId
        );
        this.messageHandler.addMessage(aiMessage);
      }

      logger.info(`✅ 批量消息处理完成`, {
        messageCount: messages.length,
        responseLength: replies.reduce((len, reply) => len + reply.length, 0),
        replyCount: replies.length,
        tokensUsed: response.tokensUsed || 0,
        messageIds: messages.map(m => m.messageId)
      });

      // 在响应中添加消息ID信息以支持回传机制
      return {
        ...response,
        messageIds: messages.map(m => m.messageId)
      };

    } catch (error) {
      logger.error('❌ 批量消息AI处理失败', {
        messageCount: messages.length,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 重新抛出错误，让上层处理
      throw error;
    }
  }

  /**
   * 将队列消息添加到会话历史中
   */
  private addMessagesToHistory(messages: QueuedMessage[]): void {
    messages.forEach(queuedMessage => {
      const message = this.messageHandler.createMessage(
        queuedMessage.userId,
        queuedMessage.content,
        queuedMessage.groupId,
        queuedMessage.userName
      );
      // 设置正确的时间戳
      message.timestamp = new Date(queuedMessage.timestamp * 1000);
      message.id = queuedMessage.messageId;
      
      this.messageHandler.addMessage(message);
    });
  }

  /**
   * 构建增强的批次上下文
   */
  private buildBatchContext(
    messages: QueuedMessage[],
    queueContext: string,
    conversationContext: string
  ): string {
    const summary = {
      messageCount: messages.length,
      userCount: new Set(messages.map(m => m.userId)).size,
      timespanSeconds: this.getTimespan(messages),
      hasHighPriority: messages.some(m => m.isHighPriority)
    };

    const queueMessages = this.safeParseJsonArray(queueContext);
    const recentHistory = this.safeParseJsonArray(conversationContext);

    return JSON.stringify(
      {
        summary,
        queueMessages,
        recentHistory
      },
      null,
      2
    );
  }

  private getConversationContext(messages: QueuedMessage[]): string {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) {
      return '[]';
    }

    const conversation = this.messageHandler.getConversation(latestMessage.userId, latestMessage.groupId);
    return this.messageHandler.formatConversationContext(conversation, 50);
  }

  private safeParseJsonArray(raw: string): Array<unknown> {
    if (!raw || raw.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.warn('⚠️ 队列上下文解析失败，已使用空数组回退', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * 提取主要内容用于AI处理
   * 对于批量消息，使用最后一条消息作为主要内容，其他作为上下文
   */
  private extractMainContent(messages: QueuedMessage[]): string {
    if (messages.length === 1) {
      return messages[0].content;
    }

    // 如果有高优先级消息，使用最后一条高优先级消息
    const highPriorityMessages = messages.filter(m => m.isHighPriority);
    if (highPriorityMessages.length > 0) {
      return highPriorityMessages[highPriorityMessages.length - 1].content;
    }

    // 否则使用最后一条消息
    return messages[messages.length - 1].content;
  }

  /**
   * 计算消息批次的时间跨度（秒）
   */
  private getTimespan(messages: QueuedMessage[]): number {
    if (messages.length <= 1) {
      return 0;
    }
    
    const timestamps = messages.map(m => m.timestamp);
    return Math.max(...timestamps) - Math.min(...timestamps);
  }
}
