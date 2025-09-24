import { LogStore, LogEntry } from './log-store';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private level: LogLevel;
  private logStore = LogStore.getInstance();
  private logDir: string;
  private logFile: string = '';
  private enableFileLogging: boolean;

  constructor(level: string = 'info') {
    this.level = this.parseLevel(level);
    this.logDir = process.env.LOG_DIR || './logs';
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING !== 'false';
    
    // 确保日志目录存在
    if (this.enableFileLogging) {
      this.ensureLogDirectory();
      this.logFile = path.join(this.logDir, `app-${this.getDateString()}.log`);
    }
  }

  private parseLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
      this.enableFileLogging = false;
    }
  }

  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  private writeToFile(logLine: string): void {
    if (!this.enableFileLogging) return;

    try {
      // 检查是否需要轮转日志文件（按日期）
      const currentLogFile = path.join(this.logDir, `app-${this.getDateString()}.log`);
      if (this.logFile !== currentLogFile) {
        this.logFile = currentLogFile;
      }

      // 异步写入文件
      fs.appendFile(this.logFile, logLine + '\n', { encoding: 'utf8' }, (err) => {
        if (err) {
          console.error('Failed to write log to file:', err);
        }
      });
    } catch (error) {
      console.error('Log file write error:', error);
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      const levelName = LogLevel[level].padEnd(5);
      
      // 格式化额外参数
      let formattedArgs = '';
      let metaData: any = undefined;
      
      if (args.length > 0) {
        const formatted = args.map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        }).join(' ');
        formattedArgs = ` | ${formatted}`;
        
        // 保存原始数据用于API
        if (args.length === 1 && typeof args[0] === 'object') {
          metaData = args[0];
        }
      }
      
      const fullMessage = `${message}${formattedArgs}`;
      const logLine = `[${timestamp}] [${levelName}] ${fullMessage}`;
      
      // 输出到控制台
      console.log(logLine);
      
      // 写入文件
      this.writeToFile(logLine);
      
      // 存储日志到内存
      const logEntry: LogEntry = {
        timestamp,
        level: LogLevel[level].toLowerCase() as LogEntry['level'],
        message: fullMessage,
        meta: metaData
      };
      
      this.logStore.addLog(logEntry);
    }
  }

  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  // 新增获取日志的方法
  getLogs(limit?: number, offset?: number): LogEntry[] {
    return this.logStore.getLogs(limit, offset);
  }

  getLogCount(): number {
    return this.logStore.getLogCount();
  }

  getRecentLogs(minutes?: number): LogEntry[] {
    return this.logStore.getRecentLogs(minutes);
  }

  async getLogsByRange(options: {
    start?: Date;
    end?: Date;
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
  }): Promise<{ logs: LogEntry[]; total: number; source: 'file' | 'memory' | 'hybrid' }> {
    const { start, end, limit, offset = 0, sort = 'asc' } = options;

    // 优先从文件获取日志，如果未启用文件日志则从内存获取
    if (!this.enableFileLogging) {
      const total = this.logStore.getLogCount();
      const logs = this.logStore.getLogs(limit, offset);
      return { logs, total, source: 'memory' };
    }

    // 如果未指定时间范围，尝试从今天的日志文件获取最新日志
    if (!start && !end) {
      return await this.getRecentLogsFromFile(limit, offset, sort);
    }

    // 校验时间范围
    const { startDate, endDate } = this.normalizeRange(start, end);
    this.validateRange(startDate, endDate);

    const datesToRead = this.enumerateDates(startDate, endDate);
    const entries: LogEntry[] = [];

    for (const date of datesToRead) {
      const filePath = this.getLogFilePathForDate(date);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const fileEntries = this.parseLogFileContent(content);

        for (const entry of fileEntries) {
          const timestamp = new Date(entry.timestamp);
          if (Number.isNaN(timestamp.getTime())) {
            continue;
          }

          if (timestamp < startDate || timestamp > endDate) {
            continue;
          }

          entries.push(entry);
        }
      } catch (error) {
        console.error('Failed to read log file', { filePath, error });
      }
    }

    entries.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sort === 'asc' ? diff : -diff;
    });

    const total = entries.length;
    if (!limit) {
      return { logs: entries, total, source: 'file' };
    }

    const page = this.applyPaging(entries, limit, offset, sort);
    return { logs: page, total, source: 'file' };
  }

  // 从今天的日志文件获取最新日志，如果文件不存在则回退到内存
  private async getRecentLogsFromFile(limit?: number, offset: number = 0, sort: 'asc' | 'desc' = 'asc'): Promise<{ logs: LogEntry[]; total: number; source: 'file' | 'memory' | 'hybrid' }> {
    const today = new Date();
    const todayFilePath = this.getLogFilePathForDate(today);
    
    // 尝试从今天的日志文件读取
    if (fs.existsSync(todayFilePath)) {
      try {
        const content = await fsPromises.readFile(todayFilePath, 'utf8');
        const entries = this.parseLogFileContent(content);

        // 按时间戳排序
        entries.sort((a, b) => {
          const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          return sort === 'asc' ? diff : -diff;
        });

        const total = entries.length;
        
        // 如果有内存中的日志，合并最新的日志以确保实时性
        const memoryLogs = this.logStore.getLogs();
        const memoryTotal = memoryLogs.length;
        
        if (memoryTotal > 0) {
          // 获取内存中最新的日志（可能还没写入文件）
          const latestMemoryLog = memoryLogs[memoryTotal - 1];
          const latestFileLog = entries[entries.length - 1];
          
          // 如果内存中有比文件更新的日志，添加到结果中
          if (!latestFileLog || new Date(latestMemoryLog.timestamp) > new Date(latestFileLog.timestamp)) {
            // 找出内存中比文件最新日志更新的条目
            const fileTimestamp = latestFileLog ? new Date(latestFileLog.timestamp).getTime() : 0;
            const newerMemoryLogs = memoryLogs.filter(log => new Date(log.timestamp).getTime() > fileTimestamp);
            
            entries.push(...newerMemoryLogs);
            entries.sort((a, b) => {
              const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
              return sort === 'asc' ? diff : -diff;
            });
          }
        }

        const finalTotal = entries.length;
        if (!limit) {
          return { logs: entries, total: finalTotal, source: memoryTotal > 0 ? 'hybrid' : 'file' };
        }

        const page = this.applyPaging(entries, limit, offset, sort);
        return { logs: page, total: finalTotal, source: memoryTotal > 0 ? 'hybrid' : 'file' };
      } catch (error) {
        console.error('Failed to read today\'s log file, falling back to memory:', error);
      }
    }
    
    // 回退到内存日志
    const total = this.logStore.getLogCount();
    const logs = this.logStore.getLogs(limit, offset);
    return { logs, total, source: 'memory' };
  }

  private applyPaging(entries: LogEntry[], limit: number, offset: number, sort: 'asc' | 'desc'): LogEntry[] {
    if (entries.length === 0) return [];

    const normalizedOffset = Math.max(0, offset);
    const normalizedLimit = Math.max(0, limit);
    const total = entries.length;

    if (sort === 'asc') {
      if (normalizedOffset >= total) return [];
      const endIndex = Math.max(0, total - normalizedOffset);
      const startIndex = Math.max(0, endIndex - normalizedLimit);
      return entries.slice(startIndex, endIndex);
    }

    // sort === 'desc'
    const startIndex = normalizedOffset;
    if (startIndex >= total) return [];
    const endIndex = Math.min(total, startIndex + normalizedLimit);
    return entries.slice(startIndex, endIndex);
  }

  // 解析日志文件内容，处理多行JSON和meta信息
  private parseLogFileContent(content: string): LogEntry[] {
    const entries: LogEntry[] = [];
    const lines = content.split(/\r?\n/);
    let currentEntry: Partial<LogEntry> | null = null;
    let jsonBuffer: string[] = [];
    let isInJson = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // 检查是否是新的日志行开始
      const logMatch = line.match(/^\[(.+?)\]\s*\[([A-Z\s]+)\]\s*(.*)$/);
      
      if (logMatch) {
        // 如果之前有未完成的条目，先处理它
        if (currentEntry) {
          this.finalizeLogEntry(currentEntry, jsonBuffer, entries);
        }
        
        // 开始新的日志条目
        const [, timestamp, levelRaw, message] = logMatch;
        const normalizedLevel = levelRaw.trim().toLowerCase();
        const level = (['info', 'warn', 'error', 'debug'] as Array<LogEntry['level']>)
          .includes(normalizedLevel as LogEntry['level'])
          ? (normalizedLevel as LogEntry['level'])
          : 'info';

        currentEntry = {
          timestamp,
          level,
          message: message.replace(/\s*\|\s*$/, ''), // 移除消息末尾的 " | "
        };
        
        jsonBuffer = [];
        isInJson = false;
        
        // 检查消息是否包含 " | " 分隔符，表示后面有meta信息
        if (message.includes(' | ')) {
          const parts = message.split(' | ');
          currentEntry.message = parts[0];
          const metaPart = parts.slice(1).join(' | ').trim();
          
          // 尝试解析JSON
          if (metaPart.startsWith('{') || metaPart.startsWith('[')) {
            jsonBuffer.push(metaPart);
            isInJson = !this.isCompleteJson(metaPart);
          }
        }
      } else if (currentEntry && (isInJson || line.startsWith('{') || line.startsWith('}') || line.startsWith('"'))) {
        // 这可能是JSON的继续行
        jsonBuffer.push(line);
        
        // 检查JSON是否完整
        const fullJson = jsonBuffer.join('\n');
        if (this.isCompleteJson(fullJson)) {
          isInJson = false;
        }
      }
    }
    
    // 处理最后一个条目
    if (currentEntry) {
      this.finalizeLogEntry(currentEntry, jsonBuffer, entries);
    }
    
    return entries;
  }

  private finalizeLogEntry(entry: Partial<LogEntry>, jsonBuffer: string[], entries: LogEntry[]): void {
    if (!entry.timestamp || !entry.level || !entry.message) return;
    
    let meta: any = undefined;
    
    if (jsonBuffer.length > 0) {
      const jsonStr = jsonBuffer.join('\n').trim();
      try {
        meta = JSON.parse(jsonStr);
      } catch (error) {
        // JSON解析失败，将其作为普通文本添加到消息中
        if (jsonStr) {
          entry.message += ' | ' + jsonStr;
        }
      }
    }
    
    entries.push({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      meta
    });
  }

  private isCompleteJson(str: string): boolean {
    if (!str.trim()) return false;
    
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  private parseLogLine(line: string): LogEntry | null {
    const match = line.match(/^\[(.+?)\]\s*\[([A-Z\s]+)\]\s*(.*)$/);
    if (!match) {
      return null;
    }

    const [, timestamp, levelRaw, message] = match;
    const normalizedLevel = levelRaw.trim().toLowerCase();
    const level = (['info', 'warn', 'error', 'debug'] as Array<LogEntry['level']>)
      .includes(normalizedLevel as LogEntry['level'])
      ? (normalizedLevel as LogEntry['level'])
      : 'info';

    return {
      timestamp,
      level,
      message,
      meta: undefined
    };
  }

  private normalizeRange(start?: Date, end?: Date): { startDate: Date; endDate: Date } {
    const now = new Date();
    const startDate = start ? new Date(start) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : now;
    return { startDate, endDate };
  }

  private validateRange(start: Date, end: Date): void {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('INVALID_RANGE');
    }

    if (start > end) {
      throw new Error('INVALID_RANGE_ORDER');
    }

    const MAX_RANGE_DAYS = 7;
    const diffInDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (diffInDays > MAX_RANGE_DAYS) {
      throw new Error('RANGE_TOO_LARGE');
    }
  }

  private enumerateDates(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

    while (cursor <= limit) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private getLogFilePathForDate(date: Date): string {
    const iso = date.toISOString().split('T')[0];
    return path.join(this.logDir, `app-${iso}.log`);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL);
