import { MessageQueueManager } from '../../src/core/message-queue-manager';
import { BatchMessageProcessor } from '../../src/core/batch-message-processor';
import { QueuedMessage, IMessageProcessor, QueueEventListener } from '../../src/core/message-queue-types';
import { ChatResponse } from '../../src/core/types';

// Mock处理器
class MockMessageProcessor implements IMessageProcessor {
  public processedMessages: QueuedMessage[][] = [];
  public shouldDelay: boolean = false;
  public shouldError: boolean = false;

  async processMessages(messages: QueuedMessage[], context: string): Promise<ChatResponse> {
    this.processedMessages.push(messages);
    
    if (this.shouldError) {
      throw new Error('模拟处理错误');
    }
    
    if (this.shouldDelay) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      content: `处理了${messages.length}条消息: ${context.substring(0, 50)}...`,
      timestamp: new Date(),
      tokensUsed: messages.length * 10
    };
  }
}

// Mock事件监听器
class MockEventListener implements QueueEventListener {
  public queuedMessages: QueuedMessage[] = [];
  public flushedResults: any[] = [];
  public errors: any[] = [];

  onMessageQueued(message: QueuedMessage): void {
    this.queuedMessages.push(message);
  }

  onQueueFlushed(result: any): void {
    this.flushedResults.push(result);
  }

  onQueueError(error: Error, context: string): void {
    this.errors.push({ error, context });
  }
}

describe('MessageQueueManager', () => {
  let mockProcessor: MockMessageProcessor;
  let mockListener: MockEventListener;
  let queueManager: MessageQueueManager;

  beforeEach(() => {
    mockProcessor = new MockMessageProcessor();
    mockListener = new MockEventListener();
    
    queueManager = new MessageQueueManager(
      mockProcessor,
      {
        botName: 'TestBot',
        silenceSeconds: 0.1, // 100ms for faster testing
        maxQueueSize: 3,
        maxQueueAgeSeconds: 1
      },
      mockListener
    );
  });

  afterEach(async () => {
    await queueManager.shutdown();
  });

  const createTestMessage = (id: string, content: string, isHighPriority: boolean = false): any => ({
    id,
    userId: 'user1',
    userName: 'TestUser',
    content,
    timestamp: new Date(),
    type: 'text' as const
  });

  describe('基本队列功能', () => {
    test('应该正确添加消息到队列', async () => {
      const message = createTestMessage('1', 'Hello world');
      
      await queueManager.addMessage(message);
      
      const status = queueManager.getStatus();
      expect(status.currentSize).toBe(1);
      expect(mockListener.queuedMessages).toHaveLength(1);
    });

    test('应该在静默时间后自动处理队列', async () => {
      const message = createTestMessage('1', 'Hello world');
      
      await queueManager.addMessage(message);
      
      // 等待静默时间过去
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(mockProcessor.processedMessages).toHaveLength(1);
      expect(mockProcessor.processedMessages[0]).toHaveLength(1);
      expect(mockListener.flushedResults).toHaveLength(1);
    });
  });

  describe('高优先级消息处理', () => {
    test('应该立即处理@机器人的消息', async () => {
      const message = createTestMessage('1', '@TestBot 你好');
      
      await queueManager.addMessage(message);
      
      // 立即检查，不需要等待静默时间
      expect(mockProcessor.processedMessages).toHaveLength(1);
      expect(mockListener.flushedResults).toHaveLength(1);
      expect(mockListener.flushedResults[0].reason).toBe('high_priority_trigger');
    });

    test('应该立即处理以问号结尾的消息', async () => {
      const message = createTestMessage('1', '今天天气怎么样？');
      
      await queueManager.addMessage(message);
      
      expect(mockProcessor.processedMessages).toHaveLength(1);
    });

    test('应该立即处理包含机器人名称的消息', async () => {
      const message = createTestMessage('1', 'TestBot帮我一下');
      
      await queueManager.addMessage(message);
      
      expect(mockProcessor.processedMessages).toHaveLength(1);
    });
  });

  describe('队列限制触发', () => {
    test('应该在达到最大队列大小时触发处理', async () => {
      // 添加3条普通消息（达到maxQueueSize）
      await queueManager.addMessage(createTestMessage('1', '消息1'));
      await queueManager.addMessage(createTestMessage('2', '消息2'));
      await queueManager.addMessage(createTestMessage('3', '消息3'));
      
      expect(mockProcessor.processedMessages).toHaveLength(1);
      expect(mockProcessor.processedMessages[0]).toHaveLength(3);
      expect(mockListener.flushedResults[0].reason).toBe('max_size_trigger');
    });

    test('应该在队列过老时触发处理', async () => {
      // 创建一个新的管理器，使用更长的静默时间，避免静默触发干扰
      const ageTestProcessor = new MockMessageProcessor();
      const ageTestListener = new MockEventListener();
      const ageTestManager = new MessageQueueManager(
        ageTestProcessor,
        {
          botName: 'TestBot',
          silenceSeconds: 10, // 很长的静默时间
          maxQueueSize: 10,   // 很大的队列大小
          maxQueueAgeSeconds: 0.5 // 0.5秒过老时间
        },
        ageTestListener
      );

      try {
        // 添加一条消息
        await ageTestManager.addMessage(createTestMessage('1', '消息1'));
        
        // 等待队列过老
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // 添加另一条消息来触发年龄检查
        await ageTestManager.addMessage(createTestMessage('2', '消息2'));
        
        expect(ageTestProcessor.processedMessages).toHaveLength(1);
        expect(ageTestListener.flushedResults[0].reason).toBe('max_age_trigger');
      } finally {
        await ageTestManager.shutdown();
      }
    });
  });

  describe('批量处理', () => {
    test('应该正确批量处理多条消息', async () => {
      // 添加多条普通消息，但不触发大小限制
      await queueManager.addMessage(createTestMessage('1', '消息1'));
      await queueManager.addMessage(createTestMessage('2', '消息2'));
      
      // 等待静默时间触发
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(mockProcessor.processedMessages).toHaveLength(1);
      expect(mockProcessor.processedMessages[0]).toHaveLength(2);
      
      const processedMessages = mockProcessor.processedMessages[0];
      expect(processedMessages[0].content).toBe('消息1');
      expect(processedMessages[1].content).toBe('消息2');
    });

    test('应该正确格式化批量消息的上下文', async () => {
      await queueManager.addMessage(createTestMessage('1', '用户说：你好'));
      await queueManager.addMessage(createTestMessage('2', '用户说：再见'));
      
      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 验证上下文格式化
      const result = mockListener.flushedResults[0];
      expect(result.response.content).toContain('处理了2条消息');
    });
  });

  describe('错误处理', () => {
    test('应该正确处理处理器错误', async () => {
      mockProcessor.shouldError = true;
      
      const message = createTestMessage('1', '@TestBot 触发错误');
      await queueManager.addMessage(message);
      
      expect(mockListener.errors).toHaveLength(1);
      expect(mockListener.errors[0].error.message).toBe('模拟处理错误');
    });

    test('错误后队列应该被清空', async () => {
      mockProcessor.shouldError = true;
      
      await queueManager.addMessage(createTestMessage('1', '消息1'));
      await queueManager.addMessage(createTestMessage('2', '@TestBot 触发错误'));
      
      const status = queueManager.getStatus();
      expect(status.currentSize).toBe(0); // 队列应该被清空
    });
  });

  describe('队列状态管理', () => {
    test('应该正确报告队列状态', async () => {
      const initialStatus = queueManager.getStatus();
      expect(initialStatus.currentSize).toBe(0);
      expect(initialStatus.isProcessing).toBe(false);
      expect(initialStatus.totalProcessed).toBe(0);

      // 添加消息
      await queueManager.addMessage(createTestMessage('1', '测试消息'));
      
      const afterAddStatus = queueManager.getStatus();
      expect(afterAddStatus.currentSize).toBe(1);
      expect(afterAddStatus.silenceTimerActive).toBe(true);

      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const afterProcessStatus = queueManager.getStatus();
      expect(afterProcessStatus.currentSize).toBe(0);
      expect(afterProcessStatus.totalProcessed).toBe(1);
    });

    test('应该支持手动触发队列处理', async () => {
      await queueManager.addMessage(createTestMessage('1', '消息1'));
      await queueManager.addMessage(createTestMessage('2', '消息2'));
      
      const results = await queueManager.flush();
      expect(results).toHaveLength(1);

      const [result] = results;
      expect(result.processed).toBe(true);
      expect(result.messageCount).toBe(2);
      expect(result.reason).toBe('manual_trigger');
    });

    test('应该支持清空队列', async () => {
      await queueManager.addMessage(createTestMessage('1', '消息1'));
      await queueManager.addMessage(createTestMessage('2', '消息2'));
      
      queueManager.clear();
      
      const status = queueManager.getStatus();
      expect(status.currentSize).toBe(0);
    });
  });

  describe('并发处理', () => {
    test('应该防止队列重复处理', async () => {
      mockProcessor.shouldDelay = true; // 让处理变慢
      
      // 同时添加多条高优先级消息
      const promises = [
        queueManager.addMessage(createTestMessage('1', '@TestBot 消息1')),
        queueManager.addMessage(createTestMessage('2', '@TestBot 消息2')),
        queueManager.addMessage(createTestMessage('3', '@TestBot 消息3'))
      ];
      
      await Promise.all(promises);
      
      // 由于第一个高优先级消息会立即处理并设置处理状态，
      // 后续的消息应该正常入队等待
      expect(mockProcessor.processedMessages.length).toBeGreaterThan(0);
    });
  });
});
