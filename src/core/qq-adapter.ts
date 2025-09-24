import { QQMessage } from './qq-types';
import { Message, ChatResponse } from './types';
import { logger } from '../utils/logger';
import { WhitelistManager } from '../utils/whitelist-manager';

export class QQMessageAdapter {
  // QQ消息转换为内部消息格式
  static fromQQMessage(qqMsg: QQMessage): Message {
    const isGroup = qqMsg.message_type === 'group';
    
    // 处理消息内容，去除CQ码等特殊格式
    let content = this.extractTextFromMessage(qqMsg.message, qqMsg.raw_message);
    
    // 去掉@机器人的部分
    content = this.removeAtBot(content);
    
    // 获取用户显示名称
    const userName = this.getUserDisplayName(qqMsg);
    
    return {
      id: qqMsg.message_id.toString(),
      userId: qqMsg.user_id.toString(),
      userName: userName,
      groupId: isGroup ? qqMsg.group_id?.toString() : undefined,
      content: content.trim(),
      timestamp: new Date(qqMsg.time * 1000),
      type: content.startsWith('/') ? 'command' : 'text'
    };
  }

  // 提取并处理消息内容，保留@信息但转换为可读格式
  private static extractTextFromMessage(message: string | any[], rawMessage: string): string {
    if (typeof message === 'string') {
      return this.processMessageContent(message);
    }
    
    // 如果是消息段数组，处理所有段类型
    if (Array.isArray(message)) {
      return message
        .map(segment => {
          if (segment.type === 'text') {
            return segment.data.text || '';
          } else if (segment.type === 'at') {
            // 将@转换为可读格式
            const qq = segment.data.qq;
            if (qq === 'all') {
              return '@全体成员';
            } else {
              return `@${qq}`;
            }
          }
          // 其他类型的CQ码可以根据需要处理
          return '';
        })
        .join('')
        .trim();
    }
    
    // 回退到原始消息处理
    return this.processMessageContent(rawMessage || '');
  }

  // 处理消息内容，将@CQ码转换为可读格式，移除其他CQ码
  private static processMessageContent(text: string): string {
    return text
      // 将@全体成员转换为可读格式
      .replace(/\[CQ:at,qq=all\]/g, '@全体成员')
      // 将@某人转换为可读格式
      .replace(/\[CQ:at,qq=(\d+)\]/g, '@$1')
      // 移除其他类型的CQ码（图片、表情等）
      .replace(/\[CQ:(?!at)[^\]]+\]/g, '')
      .trim();
  }

  // 移除机器人相关的@信息（可以根据需要配置具体的机器人QQ号）
  private static removeAtBot(content: string): string {
    // 可以从环境变量获取机器人QQ号进行精确匹配
    const botQQ = process.env.BOT_QQ_ID;
    
    if (botQQ) {
      // 如果配置了机器人QQ号，只移除对机器人的@
      return content
        .replace(new RegExp(`@${botQQ}\\b`, 'g'), '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // 如果没有配置机器人QQ号，保留所有@信息
    // 让AI能看到完整的@信息来理解上下文
    return content.trim();
  }

  // 获取用户显示名称
  static getUserDisplayName(qqMsg: QQMessage): string {
    const sender = qqMsg.sender;
    
    if (qqMsg.message_type === 'group' && sender.card) {
      return sender.card; // 群名片
    }
    
    return sender.nickname || `用户${sender.user_id}`;
  }

  // 检查消息是否需要回复
  static shouldReply(qqMsg: QQMessage): boolean {
    const content = this.extractTextFromMessage(qqMsg.message, qqMsg.raw_message);
    const whitelist = WhitelistManager.getInstance();
    
    // 私聊消息检查白名单
    if (qqMsg.message_type === 'private') {
      const allowed = whitelist.isPrivateMessageAllowed(qqMsg.user_id);
      if (!allowed) {
        logger.debug(`🚫 私聊消息被拒绝 - 用户:${qqMsg.user_id}`);
      }
      return allowed;
    }
    
    // 群消息只检查白名单
    if (qqMsg.message_type === 'group' && qqMsg.group_id) {
      const groupAllowed = whitelist.isGroupAllowed(qqMsg.group_id);
      
      if (!groupAllowed) {
        logger.debug(`🚫 群消息被白名单拒绝 - 群:${qqMsg.group_id} 用户:${qqMsg.user_id}`);
        return false;
      }
      
      // 白名单群组中的所有消息都会被处理
      logger.debug(`✅ 群消息通过白名单检查 - 群:${qqMsg.group_id} 用户:${qqMsg.user_id}`);
      return true;
    }
    
    return false;
  }

  // 检查消息中是否@了机器人（这里检测任何@行为，假设@就是想让机器人回复）
  private static hasAtBot(message: string | any[], rawMessage: string): boolean {
    if (typeof message === 'string') {
      // 检测CQ格式的@
      return /\[CQ:at,qq=\d+\]/.test(message) || /\[CQ:at,qq=all\]/.test(message);
    }
    
    if (Array.isArray(message)) {
      // 检测消息段中的@类型
      return message.some(segment => segment.type === 'at');
    }
    
    // 回退检查原始消息
    return /\[CQ:at,qq=\d+\]/.test(rawMessage || '') || /\[CQ:at,qq=all\]/.test(rawMessage || '');
  }

  // 格式化回复消息
  static formatReply(response: ChatResponse, qqMsg: QQMessage): string {
    let reply = response.content;
    
    // 限制消息长度，避免过长
    if (reply.length > 1000) {
      reply = reply.substring(0, 997) + '...';
    }
    
    return reply;
  }

  // 检查是否需要@发送者（现在由LLM工具决定，默认不@）
  static shouldAtSender(qqMsg: QQMessage): boolean {
    // 不再自动@用户，由LLM工具决定
    return false;
  }

  // 记录QQ消息信息用于调试
  static logMessageInfo(qqMsg: QQMessage): void {
    const userDisplayName = this.getUserDisplayName(qqMsg);
    const messageType = qqMsg.message_type === 'group' ? '群聊' : '私聊';
    const groupInfo = qqMsg.group_id ? `群${qqMsg.group_id}` : '';
    
    // 截取消息内容，避免过长
    const content = qqMsg.raw_message.length > 100 
      ? qqMsg.raw_message.substring(0, 100) + '...'
      : qqMsg.raw_message;
    
    if (qqMsg.message_type === 'group') {
      logger.info(`📨 收到${messageType}消息 [${groupInfo}] ${userDisplayName}(${qqMsg.user_id}): ${content}`);
    } else {
      logger.info(`💬 收到${messageType}消息 ${userDisplayName}(${qqMsg.user_id}): ${content}`);
    }
    
    // 调试模式下显示完整消息结构
    logger.debug('完整消息数据', {
      messageId: qqMsg.message_id,
      messageType: qqMsg.message_type,
      userId: qqMsg.user_id,
      groupId: qqMsg.group_id,
      rawMessage: qqMsg.raw_message,
      sender: qqMsg.sender,
      timestamp: new Date(qqMsg.time * 1000).toISOString()
    });
  }

  // 创建上下文标识符
  static createContextId(qqMsg: QQMessage): string {
    if (qqMsg.message_type === 'group' && qqMsg.group_id) {
      return `group_${qqMsg.group_id}`;
    }
    return `private_${qqMsg.user_id}`;
  }
}