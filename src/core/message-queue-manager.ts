import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { staminaManager, StaminaStatus } from '../utils/stamina-manager';
import {
  QueuedMessage,
  QueueConfig,
  FlushReason,
  QueueStatus,
  QueueProcessResult,
  IMessageProcessor,
  QueueEventListener,
  QueueMessageLog
} from './message-queue-types';
import { Message } from './types';

/**
 * 智能消息队列管理器
 *
 * 负责将消息进行队列化处理，通过混合触发策略决定何时处理队列中的消息批次。
 * 这样可以减少API调用次数，提供更好的上下文理解，优化系统性能。
 */
interface QueueState {
  messages: QueuedMessage[];
  silenceTimer: NodeJS.Timeout | null;
  isProcessing: boolean;
  lastFlushTime?: number;
  lastFlushReason?: FlushReason;
}

export class MessageQueueManager {
  private readonly queueConfig: QueueConfig;
  private readonly queues: Map<string, QueueState> = new Map();
  private readonly processingContexts: Set<string> = new Set();
  private totalProcessed: number = 0;
  private lastFlushTime?: number;
  private lastFlushReason?: FlushReason;

  // 依赖注入
  private readonly messageProcessor: IMessageProcessor;
  private readonly eventListener?: QueueEventListener;

  constructor(
    messageProcessor: IMessageProcessor,
    queueConfig?: Partial<QueueConfig>,
    eventListener?: QueueEventListener
  ) {
    this.messageProcessor = messageProcessor;
    this.eventListener = eventListener;

    // 合并默认配置
    this.queueConfig = {
      botName: config.botName || 'FingerBot',
      silenceSeconds: 8, // 8秒静默后处理
      maxQueueSize: 10,  // 最多10条消息
      maxQueueAgeSeconds: 30, // 最老消息30秒后必须处理
      ...queueConfig
    };

    logger.info('📦 MessageQueueManager 初始化完成', {
      config: this.queueConfig
    });
  }

  /**
   * 添加消息到队列
   * 这是外部调用的主要入口点
   */
  public async addMessage(message: Message): Promise<void> {
    const contextId = this.getContextId(message);
    const queueState = this.getOrCreateQueue(contextId);
    const queuedMessage = this.convertToQueuedMessage(message, contextId);

    logger.debug('📨 收到新消息', {
      contextId,
      message: this.createMessageLog(queuedMessage)
    });

    this.eventListener?.onMessageQueued?.(queuedMessage);

    queueState.messages.push(queuedMessage);

    if (queuedMessage.isHighPriority) {
      logger.info('🚨 检测到高优先级消息，立即处理', {
        contextId,
        message: this.createMessageLog(queuedMessage)
      });
      await this.flushQueue(contextId, 'high_priority_trigger');
      return;
    }

    this.resetSilenceTimer(contextId, queueState);
    await this.checkAndTriggerFlush(contextId, queueState);
  }

  /**
   * 获取队列状态
   */
  public getStatus(): QueueStatus {
    const queueStates = Array.from(this.queues.values());
    const currentSize = queueStates.reduce((sum, state) => sum + state.messages.length, 0);
    const isProcessing = queueStates.some(state => state.isProcessing);
    const silenceTimerActive = queueStates.some(state => state.silenceTimer !== null);

    return {
      currentSize,
      isProcessing,
      lastFlushTime: this.lastFlushTime,
      lastFlushReason: this.lastFlushReason,
      totalProcessed: this.totalProcessed,
      silenceTimerActive,
      queueCount: this.queues.size
    };
  }

  /**
   * 手动触发队列处理
   */
  public async flush(contextId?: string): Promise<QueueProcessResult[]> {
    if (contextId) {
      return [await this.flushQueue(contextId, 'manual_trigger')];
    }

    const results: QueueProcessResult[] = [];
    const contextIds = Array.from(this.queues.keys());

    for (const id of contextIds) {
      results.push(await this.flushQueue(id, 'manual_trigger'));
    }

    return results;
  }

  /**
   * 清空队列（不处理消息）
   */
  public clear(): void {
    const clearedContexts = Array.from(this.queues.entries()).map(([contextId, state]) => {
      const messages = this.createMessageLogs(state.messages);
      const count = state.messages.length;
      this.clearSilenceTimer(contextId, state);
      return { contextId, count, messages };
    });

    this.queues.clear();
    this.processingContexts.clear();

    const totalCleared = clearedContexts.reduce((sum, item) => sum + item.count, 0);

    logger.info('📦 队列已清空', {
      totalCleared,
      contexts: clearedContexts
    });
  }

  /**
   * 优雅关闭
   */
  public async shutdown(): Promise<void> {
    logger.info('📦 MessageQueueManager 正在关闭...');

    const contextIds = Array.from(this.queues.keys());

    for (const contextId of contextIds) {
      const state = this.queues.get(contextId);
      if (!state) continue;

      this.clearSilenceTimer(contextId, state);

      if (state.messages.length > 0) {
        logger.info(`处理剩余 ${state.messages.length} 条消息`, {
          contextId,
          messages: this.createMessageLogs(state.messages)
        });
        await this.flushQueue(contextId, 'manual_trigger');
      }
    }

    this.queues.clear();
    this.processingContexts.clear();

    logger.info('📦 MessageQueueManager 关闭完成');
  }

  /**
   * 将内部消息格式转换为队列消息格式
   */
  private convertToQueuedMessage(message: Message, contextId: string): QueuedMessage {
    return {
      userId: message.userId,
      userName: message.userName,
      groupId: message.groupId,
      content: message.content,
      timestamp: Math.floor(message.timestamp.getTime() / 1000),
      messageId: message.id,
      isHighPriority: this.isHighPriorityMessage(message),
      contextId,
      receivedAt: Date.now()
    };
  }

  /**
   * 判断是否为高优先级消息
   */
  private isHighPriorityMessage(message: Message): boolean {
    const content = message.content.trim().toLowerCase();
    const botName = this.queueConfig.botName.toLowerCase();

    // 检查条件：
    // 1. @机器人
    // 2. 包含机器人名称
    // 3. 命令类型消息
    return (
      content.includes(`@${botName}`) ||
      content.includes(botName) ||
      message.type === 'command'
    );
  }

  private getContextId(message: Message): string {
    if (message.groupId) {
      return `group_${message.groupId}`;
    }

    if (message.conversationId) {
      return `conv_${message.conversationId}`;
    }

    return `private_${message.userId}`;
  }

  private getOrCreateQueue(contextId: string): QueueState {
    let state = this.queues.get(contextId);
    if (!state) {
      state = {
        messages: [],
        silenceTimer: null,
        isProcessing: false
      };
      this.queues.set(contextId, state);
    }
    return state;
  }

  /**
   * 检查并触发队列处理的兜底策略
   */
  private async checkAndTriggerFlush(contextId: string, queueState: QueueState): Promise<void> {
    const queueLength = queueState.messages.length;

    if (queueLength === 0) {
      return;
    }

    if (queueLength >= this.queueConfig.maxQueueSize) {
      logger.info(`📦 队列达到大小上限 (${this.queueConfig.maxQueueSize})，强制处理`, {
        contextId,
        queueSize: queueLength,
        messages: this.createMessageLogs(queueState.messages)
      });
      await this.flushQueue(contextId, 'max_size_trigger');
      return;
    }

    const oldestMessage = queueState.messages[0];
    const ageSeconds = (Date.now() - oldestMessage.receivedAt) / 1000;

    if (ageSeconds >= this.queueConfig.maxQueueAgeSeconds) {
      logger.info(`⏳ 队列消息过老 (${ageSeconds}s >= ${this.queueConfig.maxQueueAgeSeconds}s)，强制处理`, {
        contextId,
        queueAge: ageSeconds,
        oldestMessage: this.createMessageLog(oldestMessage),
        messages: this.createMessageLogs(queueState.messages)
      });
      await this.flushQueue(contextId, 'max_age_trigger');
    }
  }

  /**
   * 处理并清空指定上下文队列
   */
  private async flushQueue(contextId: string, reason: FlushReason): Promise<QueueProcessResult> {
    const queueState = this.queues.get(contextId);

    if (!queueState) {
      return {
        processed: false,
        messageCount: 0,
        reason,
        messages: [],
        contextId
      };
    }

    this.clearSilenceTimer(contextId, queueState);

    if (queueState.messages.length === 0) {
      return {
        processed: false,
        messageCount: 0,
        reason,
        messages: [],
        contextId
      };
    }

    // 体力检查 - 决定是否应该处理队列
    const staminaStatus = staminaManager.getStatus();
    if (!staminaManager.canReply()) {
      logger.info('⚡ 体力不足，跳过队列处理', {
        contextId,
        reason,
        stamina: staminaStatus,
        queueSize: queueState.messages.length
      });

      // 体力不足时，根据情况决定是否保留队列
      if (staminaStatus.level === 'critical') {
        // 极低体力时清空队列，避免积压
        const clearedMessages = [...queueState.messages];
        queueState.messages = [];
        logger.warn('🔴 体力极低，清空积压队列', {
          contextId,
          clearedCount: clearedMessages.length
        });
      }

      return {
        processed: false,
        messageCount: queueState.messages.length,
        reason: 'stamina_insufficient',
        messages: this.createMessageLogs(queueState.messages),
        contextId
      };
    }

    if (queueState.isProcessing) {
      logger.warn('⚠️ 队列正在处理中，跳过本次触发', {
        contextId,
        reason,
        pendingMessages: this.createMessageLogs(queueState.messages)
      });
      return {
        processed: false,
        messageCount: queueState.messages.length,
        reason,
        messages: this.createMessageLogs(queueState.messages),
        contextId
      };
    }

    queueState.isProcessing = true;
    this.processingContexts.add(contextId);

    const messagesToProcess = [...queueState.messages];
    const messageCount = messagesToProcess.length;
    queueState.messages = [];

    logger.info(`📦 开始处理消息队列`, {
      contextId,
      reason,
      messageCount,
      timespan: this.getQueueTimespan(messagesToProcess),
      messages: this.createMessageLogs(messagesToProcess)
    });

    try {
      const context = this.formatMessagesContext(messagesToProcess);
      const response = await this.messageProcessor.processMessages(messagesToProcess, context);

      // 成功处理消息后消耗体力（传递消息数量作为强度）
      const staminaConsumed = staminaManager.consumeStamina(messageCount);
      if (staminaConsumed) {
        const status = staminaManager.getStatus();
        const levelEmoji = status.level === 'high' ? '💚' :
                          status.level === 'medium' ? '💛' :
                          status.level === 'low' ? '🧡' : '❤️';

        logger.info(`⚡ 回复完成，体力已消耗`, {
          contextId,
          messageCount,
          consumed: messageCount,
          stamina: {
            current: `${status.current}/${status.max}`,
            percentage: `${status.percentage}%`,
            level: `${levelEmoji} ${status.level.toUpperCase()}`,
            momentum: status.momentum,
            canReply: status.canReply ? '✅ 可继续回复' : '⛔ 体力不足',
            isRecovering: status.isRecovering ? '🔄 恢复中' : '⏸️ 静止',
            restMode: status.restMode ? '😴 休息' : '😊 活跃'
          }
        });
      }

      queueState.lastFlushTime = Math.floor(Date.now() / 1000);
      queueState.lastFlushReason = reason;
      this.lastFlushTime = queueState.lastFlushTime;
      this.lastFlushReason = reason;
      this.totalProcessed += messageCount;

      const result: QueueProcessResult = {
        processed: true,
        messageCount,
        response,
        reason,
        messages: this.createMessageLogs(messagesToProcess),
        contextId
      };

      this.eventListener?.onQueueFlushed?.(result);

      logger.info(`✅ 队列处理完成`, {
        contextId,
        reason,
        messageCount,
        skipReply: response.skipReply || false,
        tokensUsed: response.tokensUsed || 0,
        messages: result.messages
      });

      return result;

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));

      logger.error('❌ 队列处理失败', {
        contextId,
        reason,
        messageCount,
        error: errorObj.message,
        messages: this.createMessageLogs(messagesToProcess)
      });

      this.eventListener?.onQueueError?.(errorObj, `flush_queue_${reason}`);

      return {
        processed: false,
        messageCount,
        error: errorObj,
        reason,
        messages: this.createMessageLogs(messagesToProcess),
        contextId
      };

    } finally {
      queueState.isProcessing = false;
      this.processingContexts.delete(contextId);

      if (queueState.messages.length === 0 && !queueState.silenceTimer) {
        this.queues.delete(contextId);
      }
    }
  }

  /**
   * 重置静默计时器
   */
  private resetSilenceTimer(contextId: string, queueState: QueueState): void {
    this.clearSilenceTimer(contextId, queueState);

    if (this.queueConfig.silenceSeconds <= 0) {
      return;
    }

    queueState.silenceTimer = setTimeout(async () => {
      const currentState = this.queues.get(contextId);
      if (!currentState || currentState.messages.length === 0) {
        return;
      }

      logger.debug(`⏰ 静默时间到达 (${this.queueConfig.silenceSeconds}s)，触发队列处理`, {
        contextId,
        messageCount: currentState.messages.length,
        messages: this.createMessageLogs(currentState.messages)
      });

      await this.flushQueue(contextId, 'silence_trigger');
    }, this.queueConfig.silenceSeconds * 1000);
  }

  /**
   * 清除指定上下文的静默计时器
   */
  private clearSilenceTimer(contextId: string, queueState?: QueueState): void {
    const state = queueState ?? this.queues.get(contextId);
    if (state?.silenceTimer) {
      clearTimeout(state.silenceTimer);
      state.silenceTimer = null;
    }
  }

  /**
   * 格式化消息上下文
   */
  private formatMessagesContext(messages: QueuedMessage[]): string {
    if (messages.length === 0) {
      return '[]';
    }

    const historyEntries = messages.map(msg => ({
      messageId: msg.messageId,
      content: msg.content,
      senderName: msg.userName || `用户${msg.userId}`,
      senderId: msg.userId,
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
      role: this.determineRole(msg.userId)
    }));

    return JSON.stringify(historyEntries, null, 2);
  }

  private determineRole(senderId: string): 'user' | 'assistant' {
    const normalizedSenderId = senderId?.toLowerCase();
    const normalizedBotId = config.botId?.toLowerCase();

    if (!senderId) {
      return 'user';
    }

    if (normalizedBotId && normalizedSenderId === normalizedBotId) {
      return 'assistant';
    }

    if (normalizedSenderId === 'assistant') {
      return 'assistant';
    }

    return 'user';
  }

  /**
   * 获取队列时间跨度（秒）
   */
  private getQueueTimespan(messages: QueuedMessage[] = []): number {
    if (messages.length === 0) {
      return 0;
    }

    const oldest = messages[0].timestamp;
    const newest = messages[messages.length - 1].timestamp;
    return newest - oldest;
  }

  /**
   * 为日志生成消息摘要
   */
  private createMessageLog(message: QueuedMessage): QueueMessageLog {
    return {
      messageId: message.messageId,
      userId: message.userId,
      userName: message.userName,
      groupId: message.groupId,
      contentPreview: this.truncateContent(message.content),
      contextId: message.contextId
    };
  }

  private createMessageLogs(messages: QueuedMessage[]): QueueMessageLog[] {
    return messages.map(msg => this.createMessageLog(msg));
  }

  private truncateContent(content: string, maxLength: number = 80): string {
    if (!content) {
      return '';
    }
    return content.length > maxLength
      ? `${content.substring(0, maxLength)}...`
      : content;
  }

  /**
   * 获取体力状态
   */
  getStaminaStatus() {
    return staminaManager.getStatus();
  }

  /**
   * 获取体力统计信息
   */
  getStaminaStats() {
    return staminaManager.getStats();
  }

  /**
   * 设置体力管理器的休息模式
   */
  setStaminaRestMode(enabled: boolean) {
    staminaManager.setRestMode(enabled);
    logger.info(`🔋 体力管理休息模式: ${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 手动调整体力值
   */
  adjustStamina(value: number) {
    const oldStatus = staminaManager.getStatus();
    staminaManager.setStamina(value);
    const newStatus = staminaManager.getStatus();

    logger.info('🔧 手动调整体力值', {
      from: oldStatus.current,
      to: newStatus.current,
      percentage: newStatus.percentage
    });

    return newStatus;
  }
}
