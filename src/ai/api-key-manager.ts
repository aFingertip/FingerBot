import { logger } from '../utils/logger';
import { config } from '../utils/config';

interface ApiKeyStatus {
  key: string;
  isBlocked: boolean;
  errorCount: number;
  lastErrorTime: number;
  blockStartTime: number | null;
}

export class ApiKeyManager {
  private static instance: ApiKeyManager;
  private apiKeys: string[] = [];
  private keyStatus: Map<string, ApiKeyStatus> = new Map();
  private currentKeyIndex: number = 0;
  private resetTimer: NodeJS.Timeout | null = null;
  
  // 配置参数
  private readonly MAX_ERRORS_IN_WINDOW = 5; // 5分钟内最大错误数
  private readonly ERROR_WINDOW_MS = 5 * 60 * 1000; // 5分钟窗口
  private readonly BLOCK_DURATION_MS = 60 * 60 * 1000; // 1小时阻断时间

  private constructor() {
    this.initializeKeys();
    this.setupDailyReset();
  }

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  private initializeKeys(): void {
    // 直接使用配置中已经合并和去重的API Keys
    this.apiKeys = [...config.gemini.apiKeys];
    
    if (this.apiKeys.length === 0) {
      throw new Error('至少需要配置一个Gemini API Key，请设置GEMINI_API_KEY环境变量');
    }

    // 初始化所有key状态
    this.apiKeys.forEach(key => {
      this.keyStatus.set(key, {
        key,
        isBlocked: false,
        errorCount: 0,
        lastErrorTime: 0,
        blockStartTime: null
      });
    });

    logger.info('🔑 API Key管理器初始化完成', {
      totalKeys: this.apiKeys.length,
      primaryKey: this.apiKeys[0] ? `${this.apiKeys[0].substring(0, 10)}...` : 'none',
      keysPreview: this.apiKeys.map((key, index) => 
        `Key${index + 1}: ${key.substring(0, 10)}...`
      )
    });
  }

  /**
   * 获取当前可用的API Key
   */
  getCurrentApiKey(): string {
    this.cleanExpiredBlocks();
    
    // 从当前索引开始寻找可用key
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const key = this.apiKeys[keyIndex];
      const status = this.keyStatus.get(key);
      
      if (status && !status.isBlocked) {
        this.currentKeyIndex = keyIndex;
        return key;
      }
    }

    // 如果所有key都被阻断，使用最早阻断的key（紧急情况）
    logger.warn('⚠️  所有API Key都被阻断，使用最早阻断的key');
    const earliestBlockedKey = this.getEarliestBlockedKey();
    return earliestBlockedKey || this.apiKeys[0];
  }

  /**
   * 记录API调用错误
   */
  recordError(apiKey: string, error: any): void {
    const status = this.keyStatus.get(apiKey);
    if (!status) {
      logger.warn('⚠️ 尝试记录未知API Key的错误', { 
        keyPreview: `${apiKey.substring(0, 10)}...` 
      });
      return;
    }

    const now = Date.now();
    const is429Error = this.is429Error(error);
    const errorType = this.getErrorType(error);

    logger.warn('🚫 API Key错误记录', {
      apiKey: `${apiKey.substring(0, 10)}...`,
      errorType,
      errorMessage: error?.message || String(error),
      currentErrorCount: status.errorCount
    });

    if (is429Error) {
      // 清理过期的错误记录（5分钟滑动窗口）
      if (now - status.lastErrorTime > this.ERROR_WINDOW_MS) {
        status.errorCount = 0;
        logger.debug('🔄 清理过期错误记录', { 
          apiKey: `${apiKey.substring(0, 10)}...`,
          timeSinceLastError: `${Math.floor((now - status.lastErrorTime) / 60000)}分钟`
        });
      }

      status.errorCount++;
      status.lastErrorTime = now;

      logger.info('📊 429错误统计更新', {
        apiKey: `${apiKey.substring(0, 10)}...`,
        errorCount: status.errorCount,
        maxErrors: this.MAX_ERRORS_IN_WINDOW,
        timeWindow: '5分钟',
        willBlock: status.errorCount >= this.MAX_ERRORS_IN_WINDOW
      });

      // 检查是否需要阻断这个key
      if (status.errorCount >= this.MAX_ERRORS_IN_WINDOW) {
        this.blockApiKey(apiKey);
      }
    } else {
      logger.debug('📝 非429错误，不影响Key状态', { 
        apiKey: `${apiKey.substring(0, 10)}...`,
        errorType 
      });
    }
  }

  /**
   * 获取错误类型描述
   */
  private getErrorType(error: any): string {
    if (!error) return 'Unknown';
    
    if (error.status === 429 || error.code === 429) return '429-RateLimit';
    if (error.status === 401 || error.code === 401) return '401-Unauthorized';
    if (error.status === 403 || error.code === 403) return '403-Forbidden';
    if (error.status === 500 || error.code === 500) return '500-ServerError';
    
    const message = error.message?.toLowerCase() || '';
    if (message.includes('rate limit')) return 'RateLimit-Text';
    if (message.includes('quota')) return 'Quota-Exceeded';
    if (message.includes('timeout')) return 'Timeout';
    if (message.includes('network')) return 'Network-Error';
    
    return `Other-${error.status || error.code || 'Unknown'}`;
  }

  /**
   * 阻断API Key
   */
  private blockApiKey(apiKey: string): void {
    const status = this.keyStatus.get(apiKey);
    if (!status) return;

    status.isBlocked = true;
    status.blockStartTime = Date.now();

    logger.warn('🔒 API Key已被阻断', {
      apiKey: `${apiKey.substring(0, 10)}...`,
      reason: `5分钟内${status.errorCount}次429错误`,
      blockDuration: '1小时',
      availableKeys: this.getAvailableKeysCount()
    });

    // 如果还有其他可用key，切换到下一个
    if (this.getAvailableKeysCount() > 0) {
      this.switchToNextKey();
    }
  }

  /**
   * 切换到下一个可用的key
   */
  private switchToNextKey(): void {
    const oldKeyIndex = this.currentKeyIndex;
    const oldKey = this.apiKeys[oldKeyIndex];
    
    for (let i = 1; i < this.apiKeys.length; i++) {
      const nextIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const nextKey = this.apiKeys[nextIndex];
      const status = this.keyStatus.get(nextKey);
      
      if (status && !status.isBlocked) {
        this.currentKeyIndex = nextIndex;
        
        logger.info('🔄 API Key已切换', {
          from: `${oldKey.substring(0, 10)}...`,
          to: `${nextKey.substring(0, 10)}...`,
          reason: '当前key被阻断'
        });
        
        return;
      }
    }
  }

  /**
   * 检查是否为429错误
   */
  private is429Error(error: any): boolean {
    if (!error) return false;
    
    // 检查不同的错误表示方式
    if (error.status === 429 || error.code === 429) return true;
    if (error.message && error.message.includes('429')) return true;
    if (error.message && error.message.toLowerCase().includes('rate limit')) return true;
    if (error.message && error.message.toLowerCase().includes('quota exceeded')) return true;
    
    return false;
  }

  /**
   * 清理过期的阻断状态
   */
  private cleanExpiredBlocks(): void {
    const now = Date.now();
    
    for (const [key, status] of this.keyStatus.entries()) {
      if (status.isBlocked && status.blockStartTime) {
        if (now - status.blockStartTime > this.BLOCK_DURATION_MS) {
          status.isBlocked = false;
          status.blockStartTime = null;
          status.errorCount = 0;
          
          logger.info('🔓 API Key阻断已解除', {
            apiKey: `${key.substring(0, 10)}...`,
            blockDuration: `${Math.floor((now - status.blockStartTime!) / 60000)}分钟`
          });
        }
      }
    }
  }

  /**
   * 获取可用key数量
   */
  private getAvailableKeysCount(): number {
    let count = 0;
    for (const status of this.keyStatus.values()) {
      if (!status.isBlocked) count++;
    }
    return count;
  }

  /**
   * 获取最早被阻断的key（紧急情况使用）
   */
  private getEarliestBlockedKey(): string | null {
    let earliestKey: string | null = null;
    let earliestTime = Infinity;

    for (const [key, status] of this.keyStatus.entries()) {
      if (status.isBlocked && status.blockStartTime && status.blockStartTime < earliestTime) {
        earliestTime = status.blockStartTime;
        earliestKey = key;
      }
    }

    return earliestKey;
  }

  /**
   * 设置每日0点重置
   */
  private setupDailyReset(): void {
    const scheduleNextReset = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const timeUntilMidnight = tomorrow.getTime() - now.getTime();
      
      this.resetTimer = setTimeout(() => {
        this.resetAllKeyStatus();
        scheduleNextReset(); // 安排下次重置
      }, timeUntilMidnight);

      logger.info('⏰ 已安排每日API Key状态重置', {
        nextResetTime: tomorrow.toISOString(),
        timeUntilReset: `${Math.floor(timeUntilMidnight / 3600000)}小时${Math.floor((timeUntilMidnight % 3600000) / 60000)}分钟`
      });
    };

    scheduleNextReset();
  }

  /**
   * 重置所有key状态
   */
  private resetAllKeyStatus(): void {
    let resetCount = 0;
    
    for (const [key, status] of this.keyStatus.entries()) {
      if (status.isBlocked || status.errorCount > 0) {
        status.isBlocked = false;
        status.errorCount = 0;
        status.lastErrorTime = 0;
        status.blockStartTime = null;
        resetCount++;
      }
    }

    logger.info('🔄 每日API Key状态重置完成', {
      resetKeys: resetCount,
      totalKeys: this.apiKeys.length,
      time: new Date().toISOString()
    });
  }

  /**
   * 获取当前状态统计
   */
  getStatus(): {
    totalKeys: number;
    availableKeys: number;
    blockedKeys: number;
    currentKey: string;
    keyDetails: Array<{
      keyPreview: string;
      isBlocked: boolean;
      errorCount: number;
      blockTimeRemaining?: number;
    }>;
  } {
    this.cleanExpiredBlocks();
    
    const keyDetails = this.apiKeys.map(key => {
      const status = this.keyStatus.get(key)!;
      const detail: any = {
        keyPreview: `${key.substring(0, 10)}...`,
        isBlocked: status.isBlocked,
        errorCount: status.errorCount
      };
      
      if (status.isBlocked && status.blockStartTime) {
        const remaining = this.BLOCK_DURATION_MS - (Date.now() - status.blockStartTime);
        detail.blockTimeRemaining = Math.max(0, Math.floor(remaining / 60000)); // 分钟
      }
      
      return detail;
    });

    return {
      totalKeys: this.apiKeys.length,
      availableKeys: this.getAvailableKeysCount(),
      blockedKeys: this.apiKeys.length - this.getAvailableKeysCount(),
      currentKey: `${this.getCurrentApiKey().substring(0, 10)}...`,
      keyDetails
    };
  }

  /**
   * 手动重置指定key状态（管理员功能）
   */
  resetApiKey(keyPreview: string): boolean {
    for (const [key, status] of this.keyStatus.entries()) {
      if (key.startsWith(keyPreview.replace('...', ''))) {
        status.isBlocked = false;
        status.errorCount = 0;
        status.lastErrorTime = 0;
        status.blockStartTime = null;
        
        logger.info('🔧 手动重置API Key状态', {
          apiKey: `${key.substring(0, 10)}...`,
          operator: 'admin'
        });
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * 手动切换到下一个可用的API Key（管理员功能）
   */
  switchToNext(): string {
    const oldKeyIndex = this.currentKeyIndex;
    const oldKey = this.apiKeys[oldKeyIndex];
    
    this.cleanExpiredBlocks();
    
    // 寻找下一个可用的key
    for (let i = 1; i < this.apiKeys.length; i++) {
      const nextIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const nextKey = this.apiKeys[nextIndex];
      const status = this.keyStatus.get(nextKey);
      
      if (status && !status.isBlocked) {
        this.currentKeyIndex = nextIndex;
        
        logger.info('🔄 手动切换API Key', {
          from: `${oldKey.substring(0, 10)}...`,
          to: `${nextKey.substring(0, 10)}...`,
          operator: 'admin'
        });
        
        return nextKey;
      }
    }
    
    // 如果没有其他可用key，返回当前key
    logger.warn('⚠️ 没有其他可用的API Key，保持当前key');
    return oldKey;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}