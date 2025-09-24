export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  meta?: any;
}

export class LogStore {
  private static instance: LogStore;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private constructor() {}

  static getInstance(): LogStore {
    if (!LogStore.instance) {
      LogStore.instance = new LogStore();
    }
    return LogStore.instance;
  }

  addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  getLogs(limit?: number, offset: number = 0): LogEntry[] {
    if (!limit) {
      return [...this.logs];
    }

    const total = this.logs.length;
    if (total === 0 || offset >= total) {
      return [];
    }

    const normalizedLimit = Math.max(0, Math.min(limit, total));
    const normalizedOffset = Math.max(0, Math.min(offset, total));
    const endIndex = Math.max(0, total - normalizedOffset);
    const startIndex = Math.max(0, endIndex - normalizedLimit);

    return this.logs.slice(startIndex, endIndex);
  }

  getRecentLogs(minutes: number = 30): LogEntry[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.logs.filter(log => new Date(log.timestamp) > cutoff);
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogCount(): number {
    return this.logs.length;
  }
}
