import { Message, ChatResponse } from './types';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

type ConversationRole = 'user' | 'assistant';

interface ConversationHistoryEntry {
  content: string;
  senderName: string;
  senderId: string;
  timestamp: string;
  role: ConversationRole;
}

export class MessageHandler {
  private conversations: Map<string, Message[]> = new Map();

  addMessage(message: Message): void {
    const conversationKey = message.groupId || message.conversationId || message.userId;

    if (!message.conversationId) {
      message.conversationId = conversationKey;
    }
    
    if (!this.conversations.has(conversationKey)) {
      this.conversations.set(conversationKey, []);
    }
    
    const conversation = this.conversations.get(conversationKey)!;
    conversation.push(message);
    
    // 保持最近100条消息
    if (conversation.length > 100) {
      conversation.shift();
    }
    
    logger.debug(`Added message to conversation ${conversationKey}`, { messageId: message.id });
  }

  getConversation(userId: string, groupId?: string): Message[] {
    const conversationKey = groupId || userId;
    return this.conversations.get(conversationKey) || [];
  }

  formatConversationContext(
    messages: Message[],
    maxMessages: number = 10,
    excludeUserId?: string
  ): string {
    if (!messages.length) {
      return '[]';
    }

    const recentMessages = messages.slice(-maxMessages);

    const historyEntries: ConversationHistoryEntry[] = recentMessages
      .filter(msg => (excludeUserId ? msg.userId !== excludeUserId : true))
      .map(msg => ({
        content: msg.content,
        senderName: msg.userName || `用户${msg.userId}`,
        senderId: msg.userId,
        timestamp: new Date(msg.timestamp).toISOString(),
        role: this.determineRole(msg.userId)
      }));

    if (historyEntries.length === 0) {
      return '[]';
    }

    return JSON.stringify(historyEntries, null, 2);
  }

  createMessage(
    userId: string,
    content: string,
    groupId?: string,
    userName?: string,
    conversationId?: string
  ): Message {
    const trimmedContent = content.trim();
    const resolvedConversationId = conversationId || groupId || userId;

    return {
      id: Date.now().toString(),
      userId,
      userName,
      groupId,
      conversationId: resolvedConversationId,
      content: trimmedContent,
      timestamp: new Date(),
      type: trimmedContent.startsWith('/') ? 'command' : 'text'
    };
  }

  getAllConversations(): Array<{ userId: string, groupId?: string, messages: Message[] }> {
    const allConversations: Array<{ userId: string, groupId?: string, messages: Message[] }> = [];
    
    for (const [conversationKey, messages] of this.conversations) {
      if (messages.length === 0) continue;
      
      // 从消息中获取用户信息
      const firstMessage = messages[0];
      const conversation = {
        userId: firstMessage.userId,
        groupId: firstMessage.groupId,
        messages: messages.slice() // 复制数组避免外部修改
      };
      
      allConversations.push(conversation);
    }
    
    // 按最后消息时间排序
    allConversations.sort((a, b) => {
      const lastMessageA = a.messages[a.messages.length - 1];
      const lastMessageB = b.messages[b.messages.length - 1];
      return lastMessageB.timestamp.getTime() - lastMessageA.timestamp.getTime();
    });
    
    return allConversations;
  }

  private determineRole(senderId: string): ConversationRole {
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
}
