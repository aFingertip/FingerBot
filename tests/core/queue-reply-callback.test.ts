import { EnhancedQQChatAgentServer } from '../../src/core/enhanced-qq-agent-server';
import { QQMessage } from '../../src/core/qq-types';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/core/ws-server');
jest.mock('../../src/ai/gemini-client');
jest.mock('../../src/utils/logger');

describe('队列回传机制测试', () => {
  let agentServer: EnhancedQQChatAgentServer;
  let mockQQMessage: QQMessage;

  beforeEach(() => {
    agentServer = new EnhancedQQChatAgentServer();
    
    mockQQMessage = {
      post_type: 'message',
      message_type: 'group',
      time: Date.now(),
      message_id: 123,
      user_id: 456,
      group_id: 789,
      message: [{ type: 'text', data: { text: 'Hello World' } }],
      raw_message: 'Hello World',
      font: 0,
      sender: {
        user_id: 456,
        nickname: 'TestUser',
        card: 'TestCard',
        sex: 'unknown',
        age: 18,
        area: '',
        level: '1',
        role: 'member',
        title: ''
      }
    };
  });

  describe('pendingReplies 管理', () => {
    test('应该正确添加消息到 pendingReplies', () => {
      const messageId = 'test-msg-123';
      
      // 使用私有方法测试（需要类型断言）
      (agentServer as any).addToPendingReplies(messageId, mockQQMessage);
      
      const pendingReplies = (agentServer as any).pendingReplies;
      expect(pendingReplies.has(messageId)).toBe(true);
      expect(pendingReplies.get(messageId).qqMessage).toBe(mockQQMessage);
    });

    test('应该正确移除 pendingReplies 中的消息', () => {
      const messageId = 'test-msg-123';
      
      // 添加消息
      (agentServer as any).addToPendingReplies(messageId, mockQQMessage);
      expect((agentServer as any).pendingReplies.has(messageId)).toBe(true);
      
      // 移除消息
      const removed = (agentServer as any).removePendingReply(messageId);
      expect(removed).toBe(true);
      expect((agentServer as any).pendingReplies.has(messageId)).toBe(false);
    });

    test('应该获取指定消息ID的 pendingReplies', () => {
      const messageId1 = 'test-msg-1';
      const messageId2 = 'test-msg-2';
      const mockMessage2 = { ...mockQQMessage, message_id: 124, user_id: 457 };
      
      // 添加两个消息
      (agentServer as any).addToPendingReplies(messageId1, mockQQMessage);
      (agentServer as any).addToPendingReplies(messageId2, mockMessage2);
      
      // 获取指定消息的 pendingReplies
      const results = (agentServer as any).getPendingRepliesForMessages([messageId1]);
      
      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe(messageId1);
      expect(results[0].qqMessage).toBe(mockQQMessage);
    });
  });

  describe('消息ID提取', () => {
    test('应该从响应中提取消息ID', () => {
      const result = {
        processed: true,
        response: {
          content: 'Test response',
          messageIds: ['msg-1', 'msg-2']
        }
      };
      
      const messageIds = (agentServer as any).extractMessageIdsFromResult(result);
      expect(messageIds).toEqual(['msg-1', 'msg-2']);
    });

    test('应该在没有消息ID时使用fallback策略', () => {
      const result = {
        processed: true,
        response: {
          content: 'Test response'
        }
      };
      
      // 添加一些pending replies
      (agentServer as any).addToPendingReplies('fallback-1', mockQQMessage);
      (agentServer as any).addToPendingReplies('fallback-2', mockQQMessage);
      
      const messageIds = (agentServer as any).extractMessageIdsFromResult(result);
      expect(messageIds).toContain('fallback-1');
      expect(messageIds).toContain('fallback-2');
    });
  });

  describe('队列回调处理', () => {
    test('应该在没有回复内容时跳过处理', async () => {
      const result = {
        processed: true,
        response: {
          content: '',
          skipReply: false
        }
      };
      
      // 不应该抛出错误
      await expect((agentServer as any).handleQueueFlushResult(result)).resolves.toBeUndefined();
    });

    test('应该在skipReply为true时跳过处理', async () => {
      const result = {
        processed: true,
        response: {
          content: 'Test response',
          skipReply: true
        }
      };
      
      // 不应该抛出错误
      await expect((agentServer as any).handleQueueFlushResult(result)).resolves.toBeUndefined();
    });
  });

  describe('过期清理', () => {
    test('应该清理过期的 pendingReplies', () => {
      const messageId = 'test-msg-expired';
      
      // 添加消息
      (agentServer as any).addToPendingReplies(messageId, mockQQMessage);
      
      // 手动设置过期时间戳
      const pendingReplies = (agentServer as any).pendingReplies;
      const entry = pendingReplies.get(messageId);
      entry.timestamp = Date.now() - (31 * 60 * 1000); // 31分钟前
      
      // 触发清理
      (agentServer as any).cleanupExpiredPendingReplies();
      
      // 验证过期消息已被清理
      expect(pendingReplies.has(messageId)).toBe(false);
    });
  });
});