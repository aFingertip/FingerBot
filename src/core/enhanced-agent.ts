import { Message, ChatResponse } from './types';
import { MessageHandler } from './message-handler';
import { GeminiClient } from '../ai/gemini-client';
import { MessageQueueManager } from './message-queue-manager';
import { BatchMessageProcessor } from './batch-message-processor';
import { QueueConfig, QueueEventListener, QueueProcessResult } from './message-queue-types';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { BotStateManager } from '../utils/bot-state-manager';

/**
 * 增强型聊天代理（队列模式）
 * 
 * 统一使用异步消息队列进行批量处理，同时保留命令的即时执行能力。
 */
export class EnhancedChatAgent {
  // 传统组件
  private messageHandler: MessageHandler;
  private geminiClient: GeminiClient;
  private botStateManager: BotStateManager;
  
  // 队列组件
  protected messageQueueManager: MessageQueueManager;
  private batchProcessor: BatchMessageProcessor;
  protected queueEventListener: QueueEventListener;

  constructor(queueConfig?: Partial<QueueConfig>) {
    
    // 初始化传统组件
    this.messageHandler = new MessageHandler();
    this.geminiClient = new GeminiClient();
    this.botStateManager = BotStateManager.getInstance();
    
    // 初始化队列组件
    this.batchProcessor = new BatchMessageProcessor();
    this.queueEventListener = this.createQueueEventListener();
    
    this.messageQueueManager = new MessageQueueManager(
      this.batchProcessor,
      {
        botName: config.botName || 'FingerBot',
        silenceSeconds: 8,
        maxQueueSize: 10,
        maxQueueAgeSeconds: 30,
        ...queueConfig
      },
      this.queueEventListener
    );
    
    logger.info('🚀 EnhancedChatAgent 初始化完成 (队列模式)');
  }

  async initialize(): Promise<boolean> {
    logger.info('Initializing EnhancedChatAgent...');
    
    const isConnected = await this.geminiClient.testConnection();
    if (!isConnected) {
      logger.warn('⚠️  Gemini API connection failed, but continuing initialization...');
      logger.warn('💡 Server will start in limited mode (WebUI and logs available)');
      logger.warn('📊 AI chat features may be unavailable until API quota resets');
    } else {
      logger.info('✅ Gemini API connection successful');
    }
    
    logger.info('EnhancedChatAgent initialized successfully (队列模式)');
    return true;
  }

  /**
   * 处理消息的主入口
   * 根据配置选择处理模式
   */
  async processMessage(
    userId: string,
    content: string,
    groupId?: string,
    userName?: string,
    options?: {
      messageId?: string;
      timestamp?: Date;
      messageType?: Message['type'];
    }
  ): Promise<ChatResponse> {
    const message = this.messageHandler.createMessage(userId, content, groupId, userName);

    if (options?.messageId) {
      message.id = options.messageId;
    }

    if (options?.timestamp) {
      message.timestamp = options.timestamp;
    }

    if (options?.messageType) {
      message.type = options.messageType;
    }
    
    logger.debug('Processing message', { 
      userId, 
      userName,
      groupId, 
      messageType: message.type,
      contentLength: content.length,
      mode: 'queue'
    });

    // 处理命令（两种模式都支持）
    if (message.type === 'command') {
      try {
        return await this.handleCommand(message);
      } catch (error) {
        // 如果是权限验证失败，将命令当作普通消息处理
        if (error instanceof Error && error.message === 'COMMAND_NOT_AUTHORIZED') {
          logger.debug('Command treated as regular message due to authorization failure', { 
            userId, 
            command: content 
          });
          // 继续执行下面的普通消息处理逻辑
        } else {
          // 其他错误直接抛出
          throw error;
        }
      }
    }

    // 根据模式选择处理方式
    // 队列模式：异步处理，不直接返回结果
    await this.messageQueueManager.addMessage(message);
    
    // 返回一个占位响应，表示消息已进入队列
    return {
      content: '', // 空内容表示队列处理中
      timestamp: new Date(),
      tokensUsed: 0,
      skipReply: true // 标记为跳过发送
    };
  }

  /**
   * 处理管理员命令
   */
  private async handleCommand(message: Message): Promise<ChatResponse> {
    const command = message.content.toLowerCase();
    const adminUserId = process.env.ADMIN_USER_ID || '2945791077';
    
    // 检查是否为管理员
    if (message.userId !== adminUserId) {
      logger.warn('Non-admin user attempted to execute command', { 
        command, 
        userId: message.userId,
        adminUserId 
      });
      
      throw new Error('COMMAND_NOT_AUTHORIZED');
    }
    
    logger.info('Admin command execution', { command, userId: message.userId });

    switch (true) {
      case command.startsWith('/help'):
        return {
          content: this.getHelpText(),
          timestamp: new Date()
        };
      
      case command.startsWith('/status'):
        return this.handleStatusCommand();
      
      case command.startsWith('/clear'):
        this.clearConversation(message.userId, message.groupId);
        return {
          content: '✅ 对话历史已清除',
          timestamp: new Date()
        };

      case command.startsWith('/apikeys'):
        return this.handleApiKeysCommand();

      case command.startsWith('/resetkey'):
        return this.handleResetKeyCommand(command);

      case command.startsWith('/switchkey'):
        return this.handleSwitchKeyCommand();
      
      case command.startsWith('/start'):
        return this.handleStartCommand();
      
      case command.startsWith('/stop'):
        return this.handleStopCommand();

      case command.startsWith('/queue'):
        return this.handleQueueCommand(command);

      case command.startsWith('/stamina'):
        return this.handleStaminaCommand(command);
      
      default:
        return {
          content: '未知管理员命令，输入 /help 查看可用命令',
          timestamp: new Date()
        };
    }
  }

  /**
   * 获取帮助文本
   */
  private getHelpText(): string {
    const baseCommands = [
      '/help - 显示帮助',
      '/status - 显示状态',
      '/clear - 清除对话历史',
      '/start - 开启群聊功能',
      '/stop - 关闭群聊功能',
      '/apikeys - 查看API Key状态',
      '/resetkey - 重置API Key状态',
      '/switchkey - 强制切换API Key',
      '/queue status - 查看队列状态',
      '/queue flush - 手动触发队列处理',
      '/queue clear - 清空队列',
      '/stamina - 查看体力状态',
      '/stamina rest - 切换休息模式',
      '/stamina set <数值> - 设置体力值'
    ];

    return `管理员命令：\n${baseCommands.join('\n')}`;
  }

  /**
   * 处理状态命令
   */
  private handleStatusCommand(): ChatResponse {
    const botStatus = this.botStateManager.getStatus();
    let content = `🤖 Agent状态：运行中\n📊 对话数量：${this.getConversationCount()}\n${botStatus.groupChatEnabled ? '🟢 群聊功能：开启' : '🔴 群聊功能：关闭'}`;
    
    content += '\n🔄 处理模式：队列模式';
    
    const queueStatus = this.messageQueueManager.getStatus();
    content += `\n📦 队列状态：${queueStatus.currentSize}条消息 ${queueStatus.isProcessing ? '(处理中)' : ''}`;
    content += `\n📈 已处理批次：${queueStatus.totalProcessed}`;
    
    // 添加体力状态
    const staminaStatus = this.messageQueueManager.getStaminaStatus();
    const staminaIcon = staminaStatus.level === 'high' ? '💚' : 
                       staminaStatus.level === 'low' ? '💛' : '❤️';
    content += `\n${staminaIcon} 体力状态：${staminaStatus.current}/${staminaStatus.max} (${staminaStatus.percentage}%)`;
    content += `\n${staminaStatus.restMode ? '😴 休息模式：开启' : '😊 休息模式：关闭'}`;
    
    return {
      content,
      timestamp: new Date()
    };
  }

  /**
   * 处理队列相关命令
   */
  private handleQueueCommand(command: string): ChatResponse {
    if (!this.messageQueueManager) {
      return {
        content: '❌ 队列管理器尚未初始化',
        timestamp: new Date()
      };
    }

    const parts = command.split(' ');
    const subCommand = parts[1]?.toLowerCase();

    switch (subCommand) {
      case 'status':
        const status = this.messageQueueManager.getStatus();
        return {
          content: `📦 队列状态报告:\n` +
            `• 当前消息数: ${status.currentSize}\n` +
            `• 活跃上下文: ${status.queueCount ?? 0}\n` +
            `• 处理状态: ${status.isProcessing ? '处理中' : '空闲'}\n` +
            `• 已处理批次: ${status.totalProcessed}\n` +
            `• 静默计时器: ${status.silenceTimerActive ? '激活' : '未激活'}\n` +
            `• 最后处理: ${status.lastFlushTime ? new Date(status.lastFlushTime * 1000).toLocaleString() : '无'}\n` +
            `• 触发原因: ${status.lastFlushReason || '无'}`,
          timestamp: new Date()
        };

      case 'flush':
        // 异步执行，不等待结果
        this.messageQueueManager.flush().then(results => {
          logger.info('手动触发队列处理完成', { results });
        }).catch(error => {
          logger.error('手动触发队列处理失败', error);
        });
        
        return {
          content: '✅ 队列处理已触发',
          timestamp: new Date()
        };

      case 'clear':
        this.messageQueueManager.clear();
        return {
          content: '✅ 队列已清空',
          timestamp: new Date()
        };

      default:
        return {
          content: '队列命令用法:\n/queue status - 查看状态\n/queue flush - 手动处理\n/queue clear - 清空队列',
          timestamp: new Date()
        };
    }
  }

  // 以下方法沿用先前的命令处理逻辑
  private getConversationCount(): number {
    return this.messageHandler['conversations'].size;
  }

  private clearConversation(userId: string, groupId?: string): void {
    const conversationKey = groupId || userId;
    this.messageHandler['conversations'].delete(conversationKey);
    logger.info('Cleared conversation', { conversationKey });
  }

  private handleApiKeysCommand(): ChatResponse {
    const status = this.geminiClient.getApiKeyStatus();
    
    let content = '🔑 API Key状态报告\n\n';
    content += `📊 总计：${status.totalKeys}个Key\n`;
    content += `✅ 可用：${status.availableKeys}个\n`;
    content += `🚫 阻断：${status.blockedKeys}个\n`;
    content += `🎯 当前：${status.currentKey}\n\n`;
    
    if (status.keyDetails.length > 0) {
      content += '📋 详细状态：\n';
      status.keyDetails.forEach((detail: any, index: number) => {
        const statusIcon = detail.isBlocked ? '🚫' : '✅';
        content += `${statusIcon} Key${index + 1}: ${detail.keyPreview}\n`;
        if (detail.isBlocked && detail.blockTimeRemaining !== undefined) {
          content += `   ⏱️ 解封剩余：${detail.blockTimeRemaining}分钟\n`;
        }
        if (detail.errorCount > 0) {
          content += `   ⚠️ 错误计数：${detail.errorCount}\n`;
        }
      });
    }
    
    return {
      content,
      timestamp: new Date()
    };
  }

  private handleResetKeyCommand(command: string): ChatResponse {
    const parts = command.split(' ');
    
    if (parts.length < 2) {
      return {
        content: '❌ 使用方法：/resetkey <key前缀>\n例如：/resetkey AIzaSyBCF...',
        timestamp: new Date()
      };
    }
    
    const keyPreview = parts[1];
    const success = this.geminiClient.resetApiKeyStatus(keyPreview);
    
    if (success) {
      return {
        content: `✅ API Key状态已重置：${keyPreview}`,
        timestamp: new Date()
      };
    } else {
      return {
        content: `❌ 未找到匹配的API Key：${keyPreview}`,
        timestamp: new Date()
      };
    }
  }

  private handleSwitchKeyCommand(): ChatResponse {
    try {
      const oldStatus = this.geminiClient.getApiKeyStatus();
      this.geminiClient.forceKeySwitch();
      const newStatus = this.geminiClient.getApiKeyStatus();
      
      return {
        content: `🔄 API Key已强制切换\n从：${oldStatus.currentKey}\n到：${newStatus.currentKey}`,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        content: `❌ 切换失败：${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date()
      };
    }
  }

  private handleStartCommand(): ChatResponse {
    const success = this.botStateManager.enableGroupChat();
    
    if (success) {
      return {
        content: '🟢 群聊功能已开启，机器人将正常响应群聊消息',
        timestamp: new Date()
      };
    } else {
      return {
        content: '⚠️ 群聊功能已经处于开启状态',
        timestamp: new Date()
      };
    }
  }

  private handleStopCommand(): ChatResponse {
    const success = this.botStateManager.disableGroupChat();
    
    if (success) {
      return {
        content: '🔴 群聊功能已关闭，机器人将不再响应群聊消息（私聊仍然可用）',
        timestamp: new Date()
      };
    } else {
      return {
        content: '⚠️ 群聊功能已经处于关闭状态',
        timestamp: new Date()
      };
    }
  }

  /**
   * 创建队列事件监听器
   */
  protected createQueueEventListener(): QueueEventListener {
    return {
      onMessageQueued: (message) => {
        logger.debug('📦 消息已入队', {
          userId: message.userId,
          userName: message.userName,
          isHighPriority: message.isHighPriority,
          contentPreview: message.content.length > 80
            ? `${message.content.substring(0, 80)}...`
            : message.content
        });
      },

      onQueueFlushed: (result) => {
        logger.info('📦 队列处理完成', {
          processed: result.processed,
          messageCount: result.messageCount,
          reason: result.reason,
          skipReply: result.response?.skipReply || false,
          tokensUsed: result.response?.tokensUsed || 0,
          contextId: result.contextId,
          messages: result.messages
        });
      },

      onQueueError: (error, context) => {
        logger.error('📦 队列处理错误', {
          context,
          error: error.message
        });
      }
    };
  }

  /**
   * 处理体力相关命令
   */
  private handleStaminaCommand(command: string): ChatResponse {
    const parts = command.split(' ');
    const subCommand = parts[1]?.toLowerCase();

    switch (subCommand) {
      case 'rest':
        // 切换休息模式
        const currentStatus = this.messageQueueManager.getStaminaStatus();
        this.messageQueueManager.setStaminaRestMode(!currentStatus.restMode);
        const newStatus = this.messageQueueManager.getStaminaStatus();
        return {
          content: `${newStatus.restMode ? '😴 已启用休息模式' : '😊 已关闭休息模式'}`,
          timestamp: new Date()
        };

      case 'set':
        // 设置体力值
        const value = parseInt(parts[2]);
        if (isNaN(value) || value < 0 || value > 100) {
          return {
            content: '❌ 请输入有效的体力值 (0-100)\n使用方法：/stamina set <数值>',
            timestamp: new Date()
          };
        }
        
        const adjustedStatus = this.messageQueueManager.adjustStamina(value);
        return {
          content: `✅ 体力值已设置为 ${adjustedStatus.current}/${adjustedStatus.max} (${adjustedStatus.percentage}%)`,
          timestamp: new Date()
        };

      default:
        // 显示体力状态详情
        const staminaStats = this.messageQueueManager.getStaminaStats();
        const status = staminaStats.status;
        
        let content = `🔋 体力状态详情：\n`;
        content += `💪 当前体力：${status.current}/${status.max} (${status.percentage}%)\n`;
        content += `📊 体力水平：${this.getStaminaLevelEmoji(status.level)} ${status.level.toUpperCase()}\n`;
        content += `🎯 回复概率：${Math.round(staminaStats.replyProbability * 100)}%\n`;
        content += `${status.restMode ? '😴 休息模式：开启' : '😊 休息模式：关闭'}\n`;
        
        if (status.nextRegenTime) {
          const nextRegen = Math.ceil((status.nextRegenTime.getTime() - Date.now()) / 1000);
          content += `⏱️  下次恢复：${nextRegen}秒后\n`;
        }
        
        if (staminaStats.estimatedFullRegenTime > 0) {
          const fullRegenMinutes = Math.ceil(staminaStats.estimatedFullRegenTime / 60000);
          content += `🔄 完全恢复：约${fullRegenMinutes}分钟\n`;
        }
        
        const lastReplyMinutes = Math.floor(staminaStats.timeSinceLastReply / 60000);
        content += `⏰ 上次回复：${lastReplyMinutes}分钟前`;

        return {
          content,
          timestamp: new Date()
        };
    }
  }

  private getStaminaLevelEmoji(level: string): string {
    switch (level) {
      case 'high': return '💚';
      case 'medium': return '💛';
      case 'low': return '🧡';
      case 'critical': return '❤️';
      default: return '⚪';
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down EnhancedChatAgent...');
    
    // 关闭队列管理器
    if (this.messageQueueManager) {
      await this.messageQueueManager.shutdown();
    }
    
    // 清理传统组件资源
    this.messageHandler['conversations'].clear();
    
    logger.info('EnhancedChatAgent shutdown complete');
  }
}
