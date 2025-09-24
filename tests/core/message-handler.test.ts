import { MessageHandler } from '../../src/core/message-handler';
import { Message } from '../../src/core/types';

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  const createMessage = (overrides = {}): Message => ({
    id: '1',
    userId: 'user123',
    content: 'Hello world',
    timestamp: new Date(),
    type: 'text',
    ...overrides
  });

  describe('addMessage', () => {
    it('should add message to private conversation', () => {
      const message = createMessage();
      messageHandler.addMessage(message);

      const conversation = messageHandler.getConversation('user123');
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual(message);
    });

    it('should add message to group conversation', () => {
      const message = createMessage({ groupId: 'group456' });
      messageHandler.addMessage(message);

      const conversation = messageHandler.getConversation('user123', 'group456');
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual(message);
    });

    it('should maintain separate conversations for different users', () => {
      const message1 = createMessage({ userId: 'user1' });
      const message2 = createMessage({ userId: 'user2' });

      messageHandler.addMessage(message1);
      messageHandler.addMessage(message2);

      const conversation1 = messageHandler.getConversation('user1');
      const conversation2 = messageHandler.getConversation('user2');

      expect(conversation1).toHaveLength(1);
      expect(conversation2).toHaveLength(1);
      expect(conversation1[0].userId).toBe('user1');
      expect(conversation2[0].userId).toBe('user2');
    });

    it('should maintain separate conversations for private and group chats', () => {
      const privateMessage = createMessage({ userId: 'user123' });
      const groupMessage = createMessage({ userId: 'user123', groupId: 'group456' });

      messageHandler.addMessage(privateMessage);
      messageHandler.addMessage(groupMessage);

      const privateConversation = messageHandler.getConversation('user123');
      const groupConversation = messageHandler.getConversation('user123', 'group456');

      expect(privateConversation).toHaveLength(1);
      expect(groupConversation).toHaveLength(1);
      expect(privateConversation[0].groupId).toBeUndefined();
      expect(groupConversation[0].groupId).toBe('group456');
    });

    it('should limit conversation history to 100 messages', () => {
      // Add 101 messages
      for (let i = 0; i < 101; i++) {
        const message = createMessage({ id: i.toString(), content: `Message ${i}` });
        messageHandler.addMessage(message);
      }

      const conversation = messageHandler.getConversation('user123');
      expect(conversation).toHaveLength(100);
      
      // First message should be removed, last 100 should remain
      expect(conversation[0].content).toBe('Message 1');
      expect(conversation[99].content).toBe('Message 100');
    });

    it('should add messages to existing conversation', () => {
      const message1 = createMessage({ id: '1', content: 'First message' });
      const message2 = createMessage({ id: '2', content: 'Second message' });

      messageHandler.addMessage(message1);
      messageHandler.addMessage(message2);

      const conversation = messageHandler.getConversation('user123');
      expect(conversation).toHaveLength(2);
      expect(conversation[0].content).toBe('First message');
      expect(conversation[1].content).toBe('Second message');
    });

    it('should keep LLM replies in private conversation history', () => {
      const userMessage = createMessage({ id: '1', userId: 'user123', content: 'Hello there' });
      messageHandler.addMessage(userMessage);

      const aiReply = messageHandler.createMessage('assistant', 'Hi, need anything?', undefined, 'AI助手', 'user123');
      messageHandler.addMessage(aiReply);

      const conversation = messageHandler.getConversation('user123');
      expect(conversation).toHaveLength(2);
      expect(conversation[1].userId).toBe('assistant');
      expect(conversation[1].conversationId).toBe('user123');
    });
  });

  describe('getConversation', () => {
    it('should return empty array for non-existent conversation', () => {
      const conversation = messageHandler.getConversation('nonexistent');
      expect(conversation).toEqual([]);
    });

    it('should return correct conversation for user', () => {
      const message = createMessage();
      messageHandler.addMessage(message);

      const conversation = messageHandler.getConversation('user123');
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual(message);
    });

    it('should return correct conversation for group', () => {
      const message = createMessage({ groupId: 'group456' });
      messageHandler.addMessage(message);

      const conversation = messageHandler.getConversation('user123', 'group456');
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual(message);
    });
  });

  describe('formatConversationContext', () => {
    it('should format empty conversation', () => {
      const formatted = messageHandler.formatConversationContext([]);
      expect(formatted).toBe('[]');
    });

    it('should format single message', () => {
      const messages = [createMessage({ userId: 'user123', userName: 'User', content: 'Hello' })];
      const formatted = messageHandler.formatConversationContext(messages);

      const history = JSON.parse(formatted);
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        content: 'Hello',
        senderName: 'User',
        senderId: 'user123',
        role: 'user'
      });
      expect(new Date(history[0].timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should format multiple messages', () => {
      const messages = [
        createMessage({ userId: 'user1', userName: 'User1', content: 'Hello' }),
        createMessage({ userId: 'user2', userName: 'User2', content: 'Hi there' })
      ];
      const formatted = messageHandler.formatConversationContext(messages);

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        content: 'Hello',
        senderName: 'User1',
        senderId: 'user1',
        role: 'user'
      });
      expect(history[1]).toMatchObject({
        content: 'Hi there',
        senderName: 'User2',
        senderId: 'user2',
        role: 'user'
      });
    });

    it('should limit to maxMessages parameter', () => {
      const messages = [];
      for (let i = 0; i < 15; i++) {
        messages.push(createMessage({ 
          id: i.toString(), 
          userId: `user${i}`, 
          content: `Message ${i}` 
        }));
      }

      const formatted = messageHandler.formatConversationContext(messages, 5);

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(5);
      expect(history[0]).toMatchObject({
        content: 'Message 10',
        senderName: '用户user10',
        senderId: 'user10',
        role: 'user'
      });
      expect(history[4]).toMatchObject({
        content: 'Message 14',
        senderName: '用户user14',
        senderId: 'user14',
        role: 'user'
      });
    });

    it('should default to 10 messages when maxMessages not specified', () => {
      const messages = [];
      for (let i = 0; i < 15; i++) {
        messages.push(createMessage({ 
          id: i.toString(), 
          userId: `user${i}`, 
          content: `Message ${i}` 
        }));
      }

      const formatted = messageHandler.formatConversationContext(messages);

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(10);
      expect(history[0]).toMatchObject({
        content: 'Message 5',
        senderName: '用户user5',
        senderId: 'user5',
        role: 'user'
      });
      expect(history[9]).toMatchObject({
        content: 'Message 14',
        senderName: '用户user14',
        senderId: 'user14',
        role: 'user'
      });
    });

    it('should handle messages with special characters', () => {
      const messages = [
        createMessage({ userId: 'user1', userName: 'User1', content: 'Hello\nWorld' }),
        createMessage({ userId: 'user2', userName: 'User2', content: 'Test: 测试' })
      ];
      const formatted = messageHandler.formatConversationContext(messages);

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ content: 'Hello\nWorld', role: 'user' });
      expect(history[1]).toMatchObject({ content: 'Test: 测试', role: 'user' });
    });

    it('should mark assistant messages with assistant role', () => {
      const messages = [
        createMessage({ userId: 'user1', userName: 'User1', content: 'Hello' }),
        createMessage({ userId: 'assistant', userName: 'AI助手', content: 'Hi there' })
      ];

      const formatted = messageHandler.formatConversationContext(messages);
      const history = JSON.parse(formatted);

      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[1]).toMatchObject({
        senderId: 'assistant',
        role: 'assistant'
      });
    });

    it('should exclude specified userId from context', () => {
      const messages = [
        createMessage({ userId: 'user1', userName: 'User1', content: 'Hello' }),
        createMessage({ userId: 'user2', userName: 'User2', content: 'Hi' }),
        createMessage({ userId: 'user1', userName: 'User1', content: 'How are you?' })
      ];
      const formatted = messageHandler.formatConversationContext(messages, 10, 'user1');

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        senderId: 'user2',
        content: 'Hi',
        role: 'user'
      });
    });

    it('should return all messages when excludeUserId is undefined', () => {
      const messages = [
        createMessage({ userId: 'user1', userName: 'User1', content: 'Hello' }),
        createMessage({ userId: 'user2', userName: 'User2', content: 'Hi' })
      ];
      const formatted = messageHandler.formatConversationContext(messages, 10, undefined);

      const history = JSON.parse(formatted);
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ senderId: 'user1', content: 'Hello', role: 'user' });
      expect(history[1]).toMatchObject({ senderId: 'user2', content: 'Hi', role: 'user' });
    });
  });

  describe('createMessage', () => {
    it('should create message with required fields', () => {
      const message = messageHandler.createMessage('user123', 'Hello world');
      
      expect(message.userId).toBe('user123');
      expect(message.content).toBe('Hello world');
      expect(message.type).toBe('text');
      expect(message.groupId).toBeUndefined();
      expect(message.conversationId).toBe('user123');
      expect(message.id).toBeTruthy();
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create message with group ID', () => {
      const message = messageHandler.createMessage('user123', 'Hello world', 'group456');
      
      expect(message.userId).toBe('user123');
      expect(message.content).toBe('Hello world');
      expect(message.groupId).toBe('group456');
      expect(message.type).toBe('text');
      expect(message.conversationId).toBe('group456');
    });

    it('should detect command messages', () => {
      const message = messageHandler.createMessage('user123', '/help command');
      
      expect(message.type).toBe('command');
      expect(message.content).toBe('/help command');
    });

    it('should trim message content', () => {
      const message = messageHandler.createMessage('user123', '  Hello world  ');
      
      expect(message.content).toBe('Hello world');
    });

    it('should allow overriding conversationId', () => {
      const message = messageHandler.createMessage('user123', 'Hello world', undefined, 'User123', 'custom-conv');

      expect(message.conversationId).toBe('custom-conv');
      expect(message.groupId).toBeUndefined();
    });

    it('should generate IDs for messages', () => {
      const message1 = messageHandler.createMessage('user1', 'Message 1');
      const message2 = messageHandler.createMessage('user2', 'Message 2');
      
      expect(message1.id).toBeTruthy();
      expect(message2.id).toBeTruthy();
      // IDs are based on timestamp, they might be the same if created at the same millisecond
      // The important thing is that they exist
    });

    it('should set timestamp close to current time', () => {
      const beforeTime = new Date();
      const message = messageHandler.createMessage('user123', 'Hello');
      const afterTime = new Date();
      
      expect(message.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(message.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
