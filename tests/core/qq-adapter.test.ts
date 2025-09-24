import { QQMessageAdapter } from '../../src/core/qq-adapter';
import { QQMessage, QQSender } from '../../src/core/qq-types';
import { WhitelistManager } from '../../src/utils/whitelist-manager';

// Mock WhitelistManager
jest.mock('../../src/utils/whitelist-manager');

describe('QQMessageAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createBasicSender = (): QQSender => ({
    user_id: 12345,
    nickname: 'TestUser',
    card: 'TestCard'
  });

  const createPrivateMessage = (overrides = {}): QQMessage => ({
    post_type: 'message',
    message_type: 'private',
    message_id: 1001,
    user_id: 12345,
    message: 'Hello world',
    raw_message: 'Hello world',
    font: 0,
    sender: createBasicSender(),
    time: Math.floor(Date.now() / 1000),
    ...overrides
  });

  const createGroupMessage = (overrides = {}): QQMessage => ({
    ...createPrivateMessage(),
    message_type: 'group',
    group_id: 67890,
    ...overrides
  });

  describe('fromQQMessage', () => {
    it('should convert private message correctly', () => {
      const qqMsg = createPrivateMessage();
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.id).toBe('1001');
      expect(message.userId).toBe('12345');
      expect(message.groupId).toBeUndefined();
      expect(message.content).toBe('Hello world');
      expect(message.type).toBe('text');
    });

    it('should convert group message correctly', () => {
      const qqMsg = createGroupMessage();
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.id).toBe('1001');
      expect(message.userId).toBe('12345');
      expect(message.groupId).toBe('67890');
      expect(message.content).toBe('Hello world');
      expect(message.type).toBe('text');
    });

    it('should detect command messages', () => {
      const qqMsg = createPrivateMessage({
        message: '/help',
        raw_message: '/help'
      });
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.type).toBe('command');
      expect(message.content).toBe('/help');
    });

    it('should handle array message format', () => {
      const qqMsg = createPrivateMessage({
        message: [
          { type: 'text', data: { text: 'Hello ' } },
          { type: 'text', data: { text: 'world' } }
        ],
        raw_message: 'Hello world'
      });
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.content).toBe('Hello world');
    });

    it('should remove CQ codes from message', () => {
      const qqMsg = createPrivateMessage({
        message: 'Hello [CQ:face,id=123] world',
        raw_message: 'Hello [CQ:face,id=123] world'
      });
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.content).toBe('Hello world');
    });

    it('should convert @ mentions to readable format', () => {
      const qqMsg = createGroupMessage({
        message: '[CQ:at,qq=123456] Hello world',
        raw_message: '[CQ:at,qq=123456] Hello world'
      });
      const message = QQMessageAdapter.fromQQMessage(qqMsg);

      expect(message.content).toBe('@123456 Hello world');
    });
  });

  describe('getUserDisplayName', () => {
    it('should return card for group message with card', () => {
      const qqMsg = createGroupMessage();
      const displayName = QQMessageAdapter.getUserDisplayName(qqMsg);

      expect(displayName).toBe('TestCard');
    });

    it('should return nickname for group message without card', () => {
      const qqMsg = createGroupMessage({
        sender: { ...createBasicSender(), card: undefined }
      });
      const displayName = QQMessageAdapter.getUserDisplayName(qqMsg);

      expect(displayName).toBe('TestUser');
    });

    it('should return nickname for private message', () => {
      const qqMsg = createPrivateMessage();
      const displayName = QQMessageAdapter.getUserDisplayName(qqMsg);

      expect(displayName).toBe('TestUser');
    });

    it('should return fallback for missing nickname', () => {
      const qqMsg = createPrivateMessage({
        sender: { ...createBasicSender(), nickname: '' }
      });
      const displayName = QQMessageAdapter.getUserDisplayName(qqMsg);

      expect(displayName).toBe('用户12345');
    });
  });

  describe('shouldReply', () => {
    const mockWhitelist = {
      isPrivateMessageAllowed: jest.fn(),
      isGroupAllowed: jest.fn()
    };

    beforeEach(() => {
      (WhitelistManager.getInstance as jest.Mock).mockReturnValue(mockWhitelist);
    });

    it('should allow private message if whitelisted', () => {
      mockWhitelist.isPrivateMessageAllowed.mockReturnValue(true);
      const qqMsg = createPrivateMessage();

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(true);
      expect(mockWhitelist.isPrivateMessageAllowed).toHaveBeenCalledWith(12345);
    });

    it('should reject private message if not whitelisted', () => {
      mockWhitelist.isPrivateMessageAllowed.mockReturnValue(false);
      const qqMsg = createPrivateMessage();

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(false);
    });

    it('should reject group message if group not whitelisted', () => {
      mockWhitelist.isGroupAllowed.mockReturnValue(false);
      const qqMsg = createGroupMessage();

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(false);
    });

    it('should allow group message with @ mention if group whitelisted', () => {
      mockWhitelist.isGroupAllowed.mockReturnValue(true);
      const qqMsg = createGroupMessage({
        message: '[CQ:at,qq=123456] Hello',
        raw_message: '[CQ:at,qq=123456] Hello'
      });

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(true);
    });

    it('should allow group command message if group whitelisted', () => {
      mockWhitelist.isGroupAllowed.mockReturnValue(true);
      const qqMsg = createGroupMessage({
        message: '/help',
        raw_message: '/help'
      });

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(true);
    });

    it('should reject group message without @ or command even if whitelisted', () => {
      mockWhitelist.isGroupAllowed.mockReturnValue(true);
      const qqMsg = createGroupMessage({
        message: 'Just chatting',
        raw_message: 'Just chatting'
      });

      const result = QQMessageAdapter.shouldReply(qqMsg);

      expect(result).toBe(false);
    });
  });

  describe('formatReply', () => {
    it('should return content as is for short messages', () => {
      const response = { content: 'Hello world', timestamp: new Date() };
      const qqMsg = createPrivateMessage();

      const result = QQMessageAdapter.formatReply(response, qqMsg);

      expect(result).toBe('Hello world');
    });

    it('should truncate long messages', () => {
      const longContent = 'A'.repeat(1001);
      const response = { content: longContent, timestamp: new Date() };
      const qqMsg = createPrivateMessage();

      const result = QQMessageAdapter.formatReply(response, qqMsg);

      expect(result).toBe('A'.repeat(997) + '...');
      expect(result.length).toBe(1000);
    });
  });

  describe('shouldAtSender', () => {
    it('should return true for group messages', () => {
      const qqMsg = createGroupMessage();
      const result = QQMessageAdapter.shouldAtSender(qqMsg);

      expect(result).toBe(true);
    });

    it('should return false for private messages', () => {
      const qqMsg = createPrivateMessage();
      const result = QQMessageAdapter.shouldAtSender(qqMsg);

      expect(result).toBe(false);
    });
  });

  describe('createContextId', () => {
    it('should create group context id for group messages', () => {
      const qqMsg = createGroupMessage();
      const contextId = QQMessageAdapter.createContextId(qqMsg);

      expect(contextId).toBe('group_67890');
    });

    it('should create private context id for private messages', () => {
      const qqMsg = createPrivateMessage();
      const contextId = QQMessageAdapter.createContextId(qqMsg);

      expect(contextId).toBe('private_12345');
    });
  });

  describe('logMessageInfo', () => {
    it('should execute without throwing errors for group messages', () => {
      const qqMsg = createGroupMessage();

      expect(() => {
        QQMessageAdapter.logMessageInfo(qqMsg);
      }).not.toThrow();
    });

    it('should execute without throwing errors for private messages', () => {
      const qqMsg = createPrivateMessage();

      expect(() => {
        QQMessageAdapter.logMessageInfo(qqMsg);
      }).not.toThrow();
    });

    it('should handle long messages without throwing errors', () => {
      const qqMsg = createPrivateMessage({
        raw_message: 'A'.repeat(150)
      });

      expect(() => {
        QQMessageAdapter.logMessageInfo(qqMsg);
      }).not.toThrow();
    });
  });
});