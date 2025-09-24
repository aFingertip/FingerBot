import { EnhancedChatAgent } from '../../src/core/enhanced-agent';

// Mock 依赖
jest.mock('../../src/ai/gemini-client');
jest.mock('../../src/ai/reply-decision');
jest.mock('../../src/utils/bot-state-manager');

// 重新mock MessageHandler
jest.mock('../../src/core/message-handler', () => {
  const MockMessageHandler = jest.fn().mockImplementation(() => ({
    createMessage: jest.fn((userId, content, groupId, userName) => ({
      id: Date.now().toString(),
      userId,
      userName,
      groupId,
      content,
      timestamp: new Date(),
      type: content.startsWith('/') ? 'command' : 'text'
    })),
    addMessage: jest.fn(),
    getConversation: jest.fn(() => []),
    formatConversationContext: jest.fn(() => ''),
    conversations: new Map(),
    getAllConversations: jest.fn(() => [])
  }));

  return { MessageHandler: MockMessageHandler };
});

describe('EnhancedChatAgent', () => {
  let agent: EnhancedChatAgent;

  beforeEach(async () => {
    agent = new EnhancedChatAgent({
      silenceSeconds: 0.1,
      maxQueueSize: 3,
      maxQueueAgeSeconds: 1
    });
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.shutdown();
  });

  test('普通消息应进入队列并返回占位响应', async () => {
    const response = await agent.processMessage('user1', '你好', undefined, 'TestUser');

    expect(response.content).toBe('');
    expect(response.skipReply).toBe(true);
  });

  test('管理员命令应立即执行', async () => {
    const originalAdminId = process.env.ADMIN_USER_ID;
    process.env.ADMIN_USER_ID = 'admin1';

    try {
      const response = await agent.processMessage('admin1', '/help', undefined, 'Admin');

      expect(response.content).toContain('管理员命令');
      expect(response.skipReply).toBeFalsy();
    } finally {
      process.env.ADMIN_USER_ID = originalAdminId;
    }
  });

  describe('队列管理命令', () => {
    const setAdmin = () => {
      (process.env as any).ADMIN_USER_ID = 'admin1';
    };

    const restoreAdmin = (original?: string) => {
      if (original === undefined) {
        delete process.env.ADMIN_USER_ID;
      } else {
        process.env.ADMIN_USER_ID = original;
      }
    };

    test('支持队列状态查询', async () => {
      const originalAdminId = process.env.ADMIN_USER_ID;
      setAdmin();

      try {
        const response = await agent.processMessage('admin1', '/queue status', undefined, 'Admin');

        expect(response.content).toContain('队列状态报告');
      } finally {
        restoreAdmin(originalAdminId);
      }
    });

    test('支持手动触发队列处理', async () => {
      const originalAdminId = process.env.ADMIN_USER_ID;
      setAdmin();

      try {
        const response = await agent.processMessage('admin1', '/queue flush', undefined, 'Admin');

        expect(response.content).toContain('队列处理已触发');
      } finally {
        restoreAdmin(originalAdminId);
      }
    });

    test('支持清空队列', async () => {
      const originalAdminId = process.env.ADMIN_USER_ID;
      setAdmin();

      try {
        const response = await agent.processMessage('admin1', '/queue clear', undefined, 'Admin');

        expect(response.content).toContain('队列已清空');
      } finally {
        restoreAdmin(originalAdminId);
      }
    });
  });

  test('非管理员命令应作为普通消息进入队列', async () => {
    const originalAdminId = process.env.ADMIN_USER_ID;
    process.env.ADMIN_USER_ID = 'admin1';

    try {
      const response = await agent.processMessage('user1', '/help', undefined, 'RegularUser');

      expect(response.content).toBe('');
      expect(response.skipReply).toBe(true);
    } finally {
      process.env.ADMIN_USER_ID = originalAdminId;
    }
  });
});
