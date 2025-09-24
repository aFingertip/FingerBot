import { BotStateManager } from '../../src/utils/bot-state-manager';

describe('BotStateManager', () => {
  let stateManager: BotStateManager;

  beforeEach(() => {
    stateManager = BotStateManager.getInstance();
    // Reset to default state
    stateManager.enableGroupChat();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BotStateManager.getInstance();
      const instance2 = BotStateManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('group chat state management', () => {
    it('should start with group chat enabled by default', () => {
      expect(stateManager.isGroupChatActive()).toBe(true);
    });

    it('should disable group chat functionality', () => {
      const result = stateManager.disableGroupChat();
      expect(result).toBe(true);
      expect(stateManager.isGroupChatActive()).toBe(false);
    });

    it('should enable group chat functionality', () => {
      stateManager.disableGroupChat();
      const result = stateManager.enableGroupChat();
      expect(result).toBe(true);
      expect(stateManager.isGroupChatActive()).toBe(true);
    });

    it('should return false when trying to disable already disabled group chat', () => {
      stateManager.disableGroupChat();
      const result = stateManager.disableGroupChat();
      expect(result).toBe(false);
      expect(stateManager.isGroupChatActive()).toBe(false);
    });

    it('should return false when trying to enable already enabled group chat', () => {
      const result = stateManager.enableGroupChat();
      expect(result).toBe(false);
      expect(stateManager.isGroupChatActive()).toBe(true);
    });
  });

  describe('status reporting', () => {
    it('should report correct status when enabled', () => {
      const status = stateManager.getStatus();
      expect(status.groupChatEnabled).toBe(true);
    });

    it('should report correct status when disabled', () => {
      stateManager.disableGroupChat();
      const status = stateManager.getStatus();
      expect(status.groupChatEnabled).toBe(false);
    });
  });
});