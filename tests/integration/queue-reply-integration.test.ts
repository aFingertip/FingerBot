import { EnhancedQQChatAgentServer } from '../../src/core/enhanced-qq-agent-server';
import { QQMessage } from '../../src/core/qq-types';
import { WSServer } from '../../src/core/ws-server';
import { logger } from '../../src/utils/logger';
import { ChatResponse, Message } from '../../src/core/types';
import { QQMessageAdapter } from '../../src/core/qq-adapter';

// Mock dependencies
jest.mock('../../src/core/ws-server');
jest.mock('../../src/ai/gemini-client');
jest.mock('../../src/utils/logger');
jest.mock('../../src/core/qq-adapter');

const MockedWSServer = WSServer as jest.MockedClass<typeof WSServer>;
const MockedQQMessageAdapter = QQMessageAdapter as jest.MockedClass<typeof QQMessageAdapter>;

describe('队列回传功能集成测试', () => {
  let agentServer: EnhancedQQChatAgentServer;
  let mockWSServer: jest.Mocked<WSServer>;
  let sendReplyCallback: jest.Mock;

  beforeEach(async () => {
    // 重置所有 mocks
    jest.clearAllMocks();
    
    // 设置 WSServer mock
    mockWSServer = {
      onMessage: jest.fn(),
      onEvent: jest.fn(),
      sendGroupMessage: jest.fn().mockResolvedValue(true),
      sendPrivateMessage: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true),
      getConnectionInfo: jest.fn().mockReturnValue({}),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockedWSServer.mockImplementation(() => mockWSServer);

    // 设置 QQMessageAdapter mock
    MockedQQMessageAdapter.shouldReply = jest.fn().mockReturnValue(true);
    MockedQQMessageAdapter.fromQQMessage = jest.fn().mockImplementation((msg) => ({
      messageId: msg.message_id.toString(),
      userId: msg.user_id.toString(),
      userName: msg.sender.nickname,
      content: msg.raw_message,
      groupId: msg.group_id?.toString(),
      type: 'regular',
      isHighPriority: false
    }));

    // 创建 agent server
    agentServer = new EnhancedQQChatAgentServer();
    await agentServer.initialize();

    // 设置回复发送的 spy
    sendReplyCallback = jest.fn();
    jest.spyOn(agentServer as any, 'sendReply').mockImplementation(sendReplyCallback);
  });

  afterEach(async () => {
    await agentServer.shutdown();
  });

  const createMockQQMessage = (id: number, userId: number, content: string, isGroup = true): QQMessage => ({
    post_type: 'message',
    message_type: isGroup ? 'group' : 'private',
    time: Date.now(),
    message_id: id,
    user_id: userId,
    group_id: isGroup ? 789 : undefined,
    message: [{ type: 'text', data: { text: content } }],
    raw_message: content,
    font: 0,
    sender: {
      user_id: userId,
      nickname: `User${userId}`,
      card: `Card${userId}`,
      sex: 'unknown',
      age: 20,
      area: '',
      level: '1',
      role: 'member',
      title: ''
    }
  });

  describe('完整消息处理流程', () => {
    test('应该正确处理单条非高优先级消息的队列回传', async () => {
      const mockMessage = createMockQQMessage(1, 456, 'Hello World');
      
      // Mock AI 处理返回结果
      const mockResponse: ChatResponse = {
        content: 'AI Response',
        timestamp: new Date(),
        tokensUsed: 50,
        skipReply: true // 表示进入队列
      };

      // Mock processMessage 方法
      jest.spyOn(agentServer as any, 'processMessage').mockResolvedValue(mockResponse);

      // Mock BatchMessageProcessor 的处理结果
      const mockBatchResponse: ChatResponse = {
        content: 'Batch AI Response',
        timestamp: new Date(),
        tokensUsed: 100,
        messageIds: ['1'] // 关联的消息ID
      };

      // 处理消息
      await (agentServer as any).handleQQMessage(mockMessage);

      // 验证消息被添加到 pendingReplies
      const pendingReplies = (agentServer as any).pendingReplies;
      expect(pendingReplies.size).toBe(1);
      expect(pendingReplies.has('1')).toBe(true);

      // 模拟队列处理完成的回调
      const queueResult = {
        processed: true,
        messageCount: 1,
        response: mockBatchResponse,
        reason: 'silence_trigger'
      };

      await (agentServer as any).handleQueueFlushResult(queueResult);

      // 验证回复被发送
      expect(sendReplyCallback).toHaveBeenCalledWith(mockMessage, expect.any(String));
      
      // 验证 pendingReplies 被清理
      expect(pendingReplies.size).toBe(0);
    });

    test('应该正确处理高优先级消息的立即回复', async () => {
      const mockMessage = createMockQQMessage(2, 456, '@FingerBot 帮助');
      
      // Mock AI 处理返回立即回复
      const mockResponse: ChatResponse = {
        content: '这是帮助信息',
        timestamp: new Date(),
        tokensUsed: 30,
        skipReply: false // 立即回复
      };

      jest.spyOn(agentServer as any, 'processMessage').mockResolvedValue(mockResponse);

      // 处理消息
      await (agentServer as any).handleQQMessage(mockMessage);

      // 验证立即发送了回复
      expect(sendReplyCallback).toHaveBeenCalledWith(mockMessage, expect.any(String));
      
      // 验证 pendingReplies 被清理
      const pendingReplies = (agentServer as any).pendingReplies;
      expect(pendingReplies.size).toBe(0);
    });
  });

  describe('批量消息队列回传', () => {
    test('应该正确处理多条消息的批量回传', async () => {
      const messages = [
        createMockQQMessage(10, 101, '早上好'),
        createMockQQMessage(11, 102, '今天天气不错'),
        createMockQQMessage(12, 103, '准备工作了')
      ];

      // Mock 所有消息都进入队列
      const mockQueueResponse: ChatResponse = {
        content: '',
        timestamp: new Date(),
        skipReply: true
      };

      jest.spyOn(agentServer as any, 'processMessage').mockResolvedValue(mockQueueResponse);

      // 依次处理所有消息
      for (const message of messages) {
        await (agentServer as any).handleQQMessage(message);
      }

      // 验证所有消息都被添加到 pendingReplies
      const pendingReplies = (agentServer as any).pendingReplies;
      expect(pendingReplies.size).toBe(3);

      // Mock 批量处理结果
      const mockBatchResponse: ChatResponse = {
        content: '大家早上好！今天是个好日子，祝工作顺利！',
        timestamp: new Date(),
        tokensUsed: 150,
        messageIds: ['10', '11', '12']
      };

      // 模拟队列批量处理完成
      const queueResult = {
        processed: true,
        messageCount: 3,
        response: mockBatchResponse,
        reason: 'silence_trigger'
      };

      await (agentServer as any).handleQueueFlushResult(queueResult);

      // 验证所有消息都收到了回复
      expect(sendReplyCallback).toHaveBeenCalledTimes(3);
      
      // 验证每个消息都收到了相同的批量回复
      for (const message of messages) {
        expect(sendReplyCallback).toHaveBeenCalledWith(message, expect.stringContaining('大家早上好'));
      }

      // 验证所有 pendingReplies 都被清理
      expect(pendingReplies.size).toBe(0);
    });

    test('应该在队列处理失败时仍然清理 pendingReplies', async () => {
      const mockMessage = createMockQQMessage(20, 201, '测试消息');
      
      // Mock 消息进入队列
      const mockQueueResponse: ChatResponse = {
        content: '',
        timestamp: new Date(),
        skipReply: true
      };

      jest.spyOn(agentServer as any, 'processMessage').mockResolvedValue(mockQueueResponse);

      // 处理消息
      await (agentServer as any).handleQQMessage(mockMessage);

      // 验证消息被添加到 pendingReplies
      expect((agentServer as any).pendingReplies.size).toBe(1);

      // Mock 发送回复时失败
      sendReplyCallback.mockRejectedValue(new Error('发送失败'));

      // Mock 批量处理结果
      const mockBatchResponse: ChatResponse = {
        content: '测试回复',
        timestamp: new Date(),
        tokensUsed: 50,
        messageIds: ['20']
      };

      const queueResult = {
        processed: true,
        messageCount: 1,
        response: mockBatchResponse,
        reason: 'silence_trigger'
      };

      // 处理队列结果（应该不抛出错误）
      await expect((agentServer as any).handleQueueFlushResult(queueResult)).resolves.toBeUndefined();

      // 验证即使发送失败，pendingReplies 也被清理了
      expect((agentServer as any).pendingReplies.size).toBe(0);
    });
  });

  describe('特殊情况处理', () => {
    test('应该跳过没有回复内容的队列结果', async () => {
      const queueResult = {
        processed: true,
        messageCount: 1,
        response: {
          content: '', // 空内容
          timestamp: new Date(),
          skipReply: false
        },
        reason: 'silence_trigger'
      };

      await (agentServer as any).handleQueueFlushResult(queueResult);

      // 验证没有尝试发送回复
      expect(sendReplyCallback).not.toHaveBeenCalled();
    });

    test('应该跳过 skipReply 为 true 的队列结果', async () => {
      const queueResult = {
        processed: true,
        messageCount: 1,
        response: {
          content: '有内容但跳过回复',
          timestamp: new Date(),
          skipReply: true // 跳过回复
        },
        reason: 'silence_trigger'
      };

      await (agentServer as any).handleQueueFlushResult(queueResult);

      // 验证没有尝试发送回复
      expect(sendReplyCallback).not.toHaveBeenCalled();
    });

    test('应该使用 fallback 策略处理没有 messageIds 的结果', async () => {
      const mockMessage = createMockQQMessage(30, 301, 'fallback测试');
      
      // 添加消息到 pendingReplies
      (agentServer as any).addToPendingReplies('30', mockMessage);

      // Mock 没有 messageIds 的批量处理结果
      const queueResult = {
        processed: true,
        messageCount: 1,
        response: {
          content: 'Fallback回复',
          timestamp: new Date(),
          // 没有 messageIds 字段
        },
        reason: 'silence_trigger'
      };

      await (agentServer as any).handleQueueFlushResult(queueResult);

      // 验证使用 fallback 策略发送了回复
      expect(sendReplyCallback).toHaveBeenCalledWith(mockMessage, expect.stringContaining('Fallback回复'));
      
      // 验证 pendingReplies 被清理
      expect((agentServer as any).pendingReplies.size).toBe(0);
    });
  });

  describe('过期清理机制', () => {
    test('应该自动清理过期的 pendingReplies', () => {
      const mockMessage = createMockQQMessage(40, 401, '过期测试');
      
      // 添加消息
      (agentServer as any).addToPendingReplies('40', mockMessage);
      expect((agentServer as any).pendingReplies.size).toBe(1);

      // 手动设置过期时间戳
      const pendingReplies = (agentServer as any).pendingReplies;
      const entry = pendingReplies.get('40');
      entry.timestamp = Date.now() - (35 * 60 * 1000); // 35分钟前

      // 触发清理（通过添加新消息触发）
      const newMessage = createMockQQMessage(41, 402, '新消息');
      (agentServer as any).addToPendingReplies('41', newMessage);

      // 验证过期消息被清理，新消息仍然存在
      expect(pendingReplies.has('40')).toBe(false); // 过期的被清理
      expect(pendingReplies.has('41')).toBe(true);  // 新的仍然存在
      expect(pendingReplies.size).toBe(1);
    });
  });
});