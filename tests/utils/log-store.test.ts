import { LogStore, LogEntry } from '../../src/utils/log-store';

describe('LogStore', () => {
  let logStore: LogStore;

  beforeEach(() => {
    // Clear the singleton instance before each test
    (LogStore as any).instance = undefined;
    logStore = LogStore.getInstance();
  });

  const createLogEntry = (overrides = {}): LogEntry => ({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test message',
    ...overrides
  });

  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = LogStore.getInstance();
      const instance2 = LogStore.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should create new instance only once', () => {
      const instance1 = LogStore.getInstance();
      const instance2 = LogStore.getInstance();
      const instance3 = LogStore.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('addLog', () => {
    it('should add single log entry', () => {
      const entry = createLogEntry();
      logStore.addLog(entry);
      
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(entry);
    });

    it('should add multiple log entries', () => {
      const entry1 = createLogEntry({ message: 'First message' });
      const entry2 = createLogEntry({ message: 'Second message' });
      
      logStore.addLog(entry1);
      logStore.addLog(entry2);
      
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]).toEqual(entry1);
      expect(logs[1]).toEqual(entry2);
    });

    it('should maintain logs in chronological order', () => {
      const baseTime = new Date('2023-01-01T00:00:00.000Z');
      
      const entry1 = createLogEntry({ 
        timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
        message: 'Second message'
      });
      const entry2 = createLogEntry({ 
        timestamp: new Date(baseTime.getTime()).toISOString(),
        message: 'First message'
      });
      
      logStore.addLog(entry1);
      logStore.addLog(entry2);
      
      const logs = logStore.getLogs();
      expect(logs[0].message).toBe('Second message');
      expect(logs[1].message).toBe('First message');
    });

    it('should limit logs to maxLogs (1000)', () => {
      // Add 1001 logs
      for (let i = 0; i < 1001; i++) {
        const entry = createLogEntry({ 
          message: `Message ${i}`,
          timestamp: new Date(Date.now() + i).toISOString()
        });
        logStore.addLog(entry);
      }
      
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(1000);
      
      // First log should be removed, should start from Message 1
      expect(logs[0].message).toBe('Message 1');
      expect(logs[999].message).toBe('Message 1000');
    });
  });

  describe('getLogs', () => {
    beforeEach(() => {
      // Add some test logs
      for (let i = 0; i < 5; i++) {
        const entry = createLogEntry({ 
          message: `Message ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString()
        });
        logStore.addLog(entry);
      }
    });

    it('should return all logs when no limit specified', () => {
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(5);
    });

    it('should return limited logs when limit specified', () => {
      const logs = logStore.getLogs(3);
      expect(logs).toHaveLength(3);
      
      // Should return the last 3 logs
      expect(logs[0].message).toBe('Message 2');
      expect(logs[1].message).toBe('Message 3');
      expect(logs[2].message).toBe('Message 4');
    });

    it('should return all logs if limit exceeds total count', () => {
      const logs = logStore.getLogs(10);
      expect(logs).toHaveLength(5);
    });

    it('should respect offset when provided', () => {
      const logs = logStore.getLogs(2, 1);
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('Message 2');
      expect(logs[1].message).toBe('Message 3');
    });

    it('should return empty array when offset exceeds total', () => {
      const logs = logStore.getLogs(3, 10);
      expect(logs).toHaveLength(0);
    });

    it('should return empty array when no logs exist', () => {
      logStore.clearLogs();
      const logs = logStore.getLogs();
      expect(logs).toEqual([]);
    });

    it('should return new array instance (not reference)', () => {
      const logs1 = logStore.getLogs();
      const logs2 = logStore.getLogs();
      
      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });
  });

  describe('getRecentLogs', () => {
    it('should return logs from recent time window', () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      logStore.addLog(createLogEntry({ 
        message: 'Old message',
        timestamp: oneHourAgo.toISOString()
      }));
      logStore.addLog(createLogEntry({ 
        message: 'Thirty minutes ago',
        timestamp: thirtyMinutesAgo.toISOString()
      }));
      logStore.addLog(createLogEntry({ 
        message: 'Recent message',
        timestamp: tenMinutesAgo.toISOString()
      }));
      logStore.addLog(createLogEntry({ 
        message: 'Very recent',
        timestamp: now.toISOString()
      }));
      
      const recentLogs = logStore.getRecentLogs(20); // 20 minutes
      
      expect(recentLogs).toHaveLength(2);
      expect(recentLogs[0].message).toBe('Recent message');
      expect(recentLogs[1].message).toBe('Very recent');
    });

    it('should default to 30 minutes when no parameter provided', () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const fortyMinutesAgo = new Date(now.getTime() - 40 * 60 * 1000);
      
      logStore.addLog(createLogEntry({ 
        message: 'Old message',
        timestamp: fortyMinutesAgo.toISOString()
      }));
      logStore.addLog(createLogEntry({ 
        message: 'Recent message',
        timestamp: twentyMinutesAgo.toISOString()
      }));
      
      const recentLogs = logStore.getRecentLogs();
      
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0].message).toBe('Recent message');
    });

    it('should return empty array when no recent logs exist', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      logStore.addLog(createLogEntry({ 
        message: 'Old message',
        timestamp: oneHourAgo.toISOString()
      }));
      
      const recentLogs = logStore.getRecentLogs(30);
      expect(recentLogs).toEqual([]);
    });

    it('should handle edge case of exact time boundary', () => {
      const now = new Date();
      const exactlyThirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      logStore.addLog(createLogEntry({ 
        message: 'Boundary message',
        timestamp: exactlyThirtyMinutesAgo.toISOString()
      }));
      
      const recentLogs = logStore.getRecentLogs(30);
      expect(recentLogs).toHaveLength(0); // Should not include exactly at boundary
    });
  });

  describe('clearLogs', () => {
    it('should remove all logs', () => {
      // Add some logs
      for (let i = 0; i < 3; i++) {
        logStore.addLog(createLogEntry({ message: `Message ${i}` }));
      }
      
      expect(logStore.getLogCount()).toBe(3);
      
      logStore.clearLogs();
      
      expect(logStore.getLogCount()).toBe(0);
      expect(logStore.getLogs()).toEqual([]);
    });

    it('should not affect subsequent log additions', () => {
      logStore.addLog(createLogEntry({ message: 'Before clear' }));
      logStore.clearLogs();
      logStore.addLog(createLogEntry({ message: 'After clear' }));
      
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('After clear');
    });
  });

  describe('getLogCount', () => {
    it('should return correct count for empty store', () => {
      expect(logStore.getLogCount()).toBe(0);
    });

    it('should return correct count after adding logs', () => {
      logStore.addLog(createLogEntry());
      expect(logStore.getLogCount()).toBe(1);
      
      logStore.addLog(createLogEntry());
      expect(logStore.getLogCount()).toBe(2);
    });

    it('should return correct count after clearing', () => {
      logStore.addLog(createLogEntry());
      logStore.addLog(createLogEntry());
      
      expect(logStore.getLogCount()).toBe(2);
      
      logStore.clearLogs();
      
      expect(logStore.getLogCount()).toBe(0);
    });

    it('should cap at maxLogs (1000)', () => {
      // Add more than maxLogs
      for (let i = 0; i < 1001; i++) {
        logStore.addLog(createLogEntry());
      }
      
      expect(logStore.getLogCount()).toBe(1000);
    });
  });

  describe('log entry variations', () => {
    it('should handle different log levels', () => {
      const levels: LogEntry['level'][] = ['error', 'warn', 'info', 'debug'];
      
      levels.forEach((level, index) => {
        logStore.addLog(createLogEntry({ 
          level,
          message: `${level} message`
        }));
      });
      
      const logs = logStore.getLogs();
      expect(logs).toHaveLength(4);
      
      levels.forEach((level, index) => {
        expect(logs[index].level).toBe(level);
        expect(logs[index].message).toBe(`${level} message`);
      });
    });

    it('should handle logs with metadata', () => {
      const metadata = {
        userId: 123,
        action: 'login',
        ip: '127.0.0.1'
      };
      
      logStore.addLog(createLogEntry({ 
        message: 'User login',
        meta: metadata
      }));
      
      const logs = logStore.getLogs();
      expect(logs[0].meta).toEqual(metadata);
    });

    it('should handle logs without metadata', () => {
      logStore.addLog(createLogEntry({ 
        message: 'Simple message'
        // no meta property
      }));
      
      const logs = logStore.getLogs();
      expect(logs[0].meta).toBeUndefined();
    });
  });
});
