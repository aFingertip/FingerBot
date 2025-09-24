import { WhitelistManager } from '../../src/utils/whitelist-manager';
import { config } from '../../src/utils/config';

// Mock the config module
jest.mock('../../src/utils/config', () => ({
  config: {
    groupWhitelist: {
      enabled: false,
      groups: []
    }
  }
}));

describe('WhitelistManager', () => {
  let whitelistManager: WhitelistManager;

  beforeEach(() => {
    // Clear the singleton instance before each test
    (WhitelistManager as any).instance = undefined;
    
    // Reset config mock
    jest.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = WhitelistManager.getInstance();
      const instance2 = WhitelistManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should create new instance only once', () => {
      const instance1 = WhitelistManager.getInstance();
      const instance2 = WhitelistManager.getInstance();
      const instance3 = WhitelistManager.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('initialization with whitelist disabled', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = {
        enabled: false,
        groups: ['123', '456']
      };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should initialize with groups from config even when disabled', () => {
      const status = whitelistManager.getWhitelistStatus();
      
      expect(status.enabled).toBe(false);
      expect(status.groups).toEqual(['123', '456']);
      expect(status.groupCount).toBe(2);
    });

    it('should allow all groups when disabled', () => {
      expect(whitelistManager.isGroupAllowed('999')).toBe(true);
      expect(whitelistManager.isGroupAllowed(888)).toBe(true);
    });
  });

  describe('initialization with whitelist enabled', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = {
        enabled: true,
        groups: ['123', '456', '789']
      };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should initialize with groups from config', () => {
      const status = whitelistManager.getWhitelistStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.groups).toEqual(['123', '456', '789']);
      expect(status.groupCount).toBe(3);
    });

    it('should allow whitelisted groups', () => {
      expect(whitelistManager.isGroupAllowed('123')).toBe(true);
      expect(whitelistManager.isGroupAllowed('456')).toBe(true);
      expect(whitelistManager.isGroupAllowed(789)).toBe(true);
    });

    it('should reject non-whitelisted groups', () => {
      expect(whitelistManager.isGroupAllowed('999')).toBe(false);
      expect(whitelistManager.isGroupAllowed(888)).toBe(false);
    });
  });

  describe('initialization with empty whitelist', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = {
        enabled: true,
        groups: []
      };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should reject all groups when enabled with empty whitelist', () => {
      expect(whitelistManager.isGroupAllowed('123')).toBe(false);
      expect(whitelistManager.isGroupAllowed(456)).toBe(false);
    });
  });

  describe('isPrivateMessageAllowed', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: [] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should always allow private messages', () => {
      expect(whitelistManager.isPrivateMessageAllowed('123')).toBe(true);
      expect(whitelistManager.isPrivateMessageAllowed(456)).toBe(true);
    });
  });

  describe('addGroup', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should add new group successfully', () => {
      const result = whitelistManager.addGroup('456');
      
      expect(result).toBe(true);
      expect(whitelistManager.isGroupAllowed('456')).toBe(true);
      expect(whitelistManager.getWhitelistedGroups()).toContain('456');
    });

    it('should handle numeric group ID', () => {
      const result = whitelistManager.addGroup(789);
      
      expect(result).toBe(true);
      expect(whitelistManager.isGroupAllowed(789)).toBe(true);
      expect(whitelistManager.getWhitelistedGroups()).toContain('789');
    });

    it('should return false when adding existing group', () => {
      const result = whitelistManager.addGroup('123');
      
      expect(result).toBe(false);
      expect(whitelistManager.getWhitelistedGroups()).toEqual(['123']);
    });

    it('should not duplicate existing groups', () => {
      whitelistManager.addGroup('456');
      whitelistManager.addGroup('456');
      
      const groups = whitelistManager.getWhitelistedGroups();
      const count456 = groups.filter(g => g === '456').length;
      
      expect(count456).toBe(1);
    });
  });

  describe('removeGroup', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123', '456'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should remove existing group successfully', () => {
      const result = whitelistManager.removeGroup('123');
      
      expect(result).toBe(true);
      expect(whitelistManager.isGroupAllowed('123')).toBe(false);
      expect(whitelistManager.getWhitelistedGroups()).not.toContain('123');
    });

    it('should handle numeric group ID', () => {
      const result = whitelistManager.removeGroup(456);
      
      expect(result).toBe(true);
      expect(whitelistManager.isGroupAllowed('456')).toBe(false);
      expect(whitelistManager.getWhitelistedGroups()).not.toContain('456');
    });

    it('should return false when removing non-existent group', () => {
      const result = whitelistManager.removeGroup('999');
      
      expect(result).toBe(false);
    });
  });

  describe('addGroups', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should add multiple new groups', () => {
      const result = whitelistManager.addGroups(['456', '789', 101112]);
      
      expect(result.added).toEqual(['456', '789', '101112']);
      expect(result.existing).toEqual([]);
      
      expect(whitelistManager.isGroupAllowed('456')).toBe(true);
      expect(whitelistManager.isGroupAllowed('789')).toBe(true);
      expect(whitelistManager.isGroupAllowed('101112')).toBe(true);
    });

    it('should handle mix of new and existing groups', () => {
      const result = whitelistManager.addGroups(['123', '456', '789']);
      
      expect(result.added).toEqual(['456', '789']);
      expect(result.existing).toEqual(['123']);
    });

    it('should handle empty array', () => {
      const result = whitelistManager.addGroups([]);
      
      expect(result.added).toEqual([]);
      expect(result.existing).toEqual([]);
    });
  });

  describe('clearWhitelist', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123', '456', '789'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should clear all groups from whitelist', () => {
      whitelistManager.clearWhitelist();
      
      expect(whitelistManager.getWhitelistedGroups()).toEqual([]);
      expect(whitelistManager.getWhitelistStatus().groupCount).toBe(0);
      
      expect(whitelistManager.isGroupAllowed('123')).toBe(false);
      expect(whitelistManager.isGroupAllowed('456')).toBe(false);
      expect(whitelistManager.isGroupAllowed('789')).toBe(false);
    });
  });

  describe('shouldProcessMessage', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should process private messages', () => {
      expect(whitelistManager.shouldProcessMessage('private', '999')).toBe(true);
      expect(whitelistManager.shouldProcessMessage('private', 888)).toBe(true);
    });

    it('should process whitelisted group messages', () => {
      expect(whitelistManager.shouldProcessMessage('group', '123')).toBe(true);
      expect(whitelistManager.shouldProcessMessage('group', 123)).toBe(true);
    });

    it('should not process non-whitelisted group messages', () => {
      expect(whitelistManager.shouldProcessMessage('group', '456')).toBe(false);
      expect(whitelistManager.shouldProcessMessage('group', 789)).toBe(false);
    });

    it('should return false for invalid message types', () => {
      expect(whitelistManager.shouldProcessMessage('invalid' as any, '123')).toBe(false);
    });
  });

  describe('getWhitelistedGroups', () => {
    beforeEach(() => {
      (config.groupWhitelist as any) = { enabled: true, groups: ['123', '456'] };
      whitelistManager = WhitelistManager.getInstance();
    });

    it('should return array of whitelisted groups', () => {
      const groups = whitelistManager.getWhitelistedGroups();
      
      expect(groups).toEqual(['123', '456']);
    });

    it('should return empty array after clearing', () => {
      whitelistManager.clearWhitelist();
      const groups = whitelistManager.getWhitelistedGroups();
      
      expect(groups).toEqual([]);
    });

    it('should reflect changes after adding groups', () => {
      whitelistManager.addGroup('789');
      const groups = whitelistManager.getWhitelistedGroups();
      
      expect(groups).toContain('789');
      expect(groups).toHaveLength(3);
    });
  });
});