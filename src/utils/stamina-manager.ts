/**
 * 体力管理器 - 根据体力值控制机器人回复频率
 */

import { logger } from './logger';
import { config } from './config';
import { EventEmitter } from 'events';

export interface StaminaConfig {
  maxStamina: number;           // 最大体力值 (默认: 100)
  replyStaminaCost: number;     // 每次回复消耗体力 (默认: 10)
  regenRate: number;            // 体力恢复速率 (每分钟) (默认: 5)
  regenInterval: number;        // 体力恢复间隔 (毫秒) (默认: 60000 = 1分钟)
  lowStaminaThreshold: number;  // 低体力阈值，低于此值会降低回复频率 (默认: 30)
  criticalStaminaThreshold: number; // 极低体力阈值，低于此值几乎不回复 (默认: 10)
  restMode: boolean;            // 休息模式，暂停体力消耗 (默认: false)
}

export interface StaminaStatus {
  current: number;
  max: number;
  percentage: number;
  level: 'high' | 'medium' | 'low' | 'critical';
  canReply: boolean;
  restMode: boolean;
  nextRegenTime?: Date;
}

export class StaminaManager extends EventEmitter {
  private config: StaminaConfig;
  private currentStamina: number;
  private regenTimer?: NodeJS.Timeout;
  private lastReplyTime: Date = new Date();

  constructor(customConfig?: Partial<StaminaConfig>) {
    super();
    
    this.config = {
      maxStamina: config.stamina.maxStamina,
      replyStaminaCost: config.stamina.replyStaminaCost,
      regenRate: config.stamina.regenRate,
      regenInterval: config.stamina.regenInterval,
      lowStaminaThreshold: config.stamina.lowStaminaThreshold,
      criticalStaminaThreshold: config.stamina.criticalStaminaThreshold,
      restMode: config.stamina.restMode,
      ...customConfig
    };

    this.currentStamina = this.config.maxStamina;
    this.startRegeneration();

    logger.info('🔋 体力管理器已启动', {
      maxStamina: this.config.maxStamina,
      replyStaminaCost: this.config.replyStaminaCost,
      regenRate: this.config.regenRate
    });
  }

  /**
   * 获取当前体力状态
   */
  getStatus(): StaminaStatus {
    const percentage = Math.round((this.currentStamina / this.config.maxStamina) * 100);
    let level: 'high' | 'medium' | 'low' | 'critical';
    
    if (this.currentStamina >= this.config.lowStaminaThreshold) {
      level = 'high';
    } else if (this.currentStamina >= this.config.criticalStaminaThreshold) {
      level = 'low';
    } else {
      level = 'critical';
    }

    const canReply = this.canReply();

    return {
      current: Math.round(this.currentStamina),
      max: this.config.maxStamina,
      percentage,
      level,
      canReply,
      restMode: this.config.restMode,
      nextRegenTime: this.getNextRegenTime()
    };
  }

  /**
   * 检查是否可以回复消息
   */
  canReply(): boolean {
    if (this.config.restMode) {
      return false;
    }

    // 体力不足时不能回复
    if (this.currentStamina < this.config.replyStaminaCost) {
      return false;
    }

    // 基于体力水平的概率回复
    const probability = this.getReplyProbability();
    return Math.random() < probability;
  }

  /**
   * 获取回复概率（基于当前体力水平）
   */
  private getReplyProbability(): number {
    if (this.currentStamina >= this.config.lowStaminaThreshold) {
      return 1.0; // 高体力时100%回复
    } else if (this.currentStamina >= this.config.criticalStaminaThreshold) {
      // 低体力时线性衰减到50%
      const ratio = (this.currentStamina - this.config.criticalStaminaThreshold) / 
                   (this.config.lowStaminaThreshold - this.config.criticalStaminaThreshold);
      return 0.5 + ratio * 0.5;
    } else {
      // 极低体力时20%回复概率
      return 0.2;
    }
  }

  /**
   * 消耗体力（回复消息时调用）
   */
  consumeStamina(amount?: number): boolean {
    if (this.config.restMode) {
      return false;
    }

    const cost = amount || this.config.replyStaminaCost;
    
    if (this.currentStamina < cost) {
      logger.warn('⚡ 体力不足，无法回复', {
        current: Math.round(this.currentStamina),
        required: cost
      });
      return false;
    }

    const previousLevel = this.getStatus().level;
    this.currentStamina = Math.max(0, this.currentStamina - cost);
    this.lastReplyTime = new Date();
    
    const newStatus = this.getStatus();
    
    // 发出体力变化事件
    this.emit('staminaChanged', {
      previous: Math.round(this.currentStamina + cost),
      current: Math.round(this.currentStamina),
      consumed: cost,
      status: newStatus
    });

    // 体力水平变化时发出警告
    if (newStatus.level !== previousLevel) {
      this.emit('staminaLevelChanged', {
        previous: previousLevel,
        current: newStatus.level,
        status: newStatus
      });

      if (newStatus.level === 'low') {
        logger.warn('⚠️ 体力水平降低，回复频率将下降', newStatus);
      } else if (newStatus.level === 'critical') {
        logger.warn('🔴 体力极低，几乎不会回复消息', newStatus);
      }
    }

    logger.debug('⚡ 消耗体力', {
      consumed: cost,
      remaining: Math.round(this.currentStamina),
      percentage: newStatus.percentage
    });

    return true;
  }

  /**
   * 恢复体力
   */
  restoreStamina(amount?: number): void {
    const restore = amount || this.config.regenRate;
    const previousStamina = this.currentStamina;
    
    this.currentStamina = Math.min(this.config.maxStamina, this.currentStamina + restore);
    
    if (this.currentStamina > previousStamina) {
      const status = this.getStatus();
      
      this.emit('staminaRestored', {
        previous: Math.round(previousStamina),
        current: Math.round(this.currentStamina),
        restored: Math.round(this.currentStamina - previousStamina),
        status
      });

      logger.debug('🔋 体力恢复', {
        restored: Math.round(this.currentStamina - previousStamina),
        current: Math.round(this.currentStamina),
        percentage: status.percentage
      });
    }
  }

  /**
   * 设置休息模式
   */
  setRestMode(enabled: boolean): void {
    const wasResting = this.config.restMode;
    this.config.restMode = enabled;

    if (enabled && !wasResting) {
      logger.info('😴 启动休息模式，暂停消耗体力');
      this.emit('restModeChanged', { enabled: true });
    } else if (!enabled && wasResting) {
      logger.info('😊 退出休息模式，恢复正常运行');
      this.emit('restModeChanged', { enabled: false });
    }
  }

  /**
   * 强制设置体力值
   */
  setStamina(value: number): void {
    const previousStamina = this.currentStamina;
    this.currentStamina = Math.max(0, Math.min(this.config.maxStamina, value));
    
    if (this.currentStamina !== previousStamina) {
      const status = this.getStatus();
      this.emit('staminaChanged', {
        previous: Math.round(previousStamina),
        current: Math.round(this.currentStamina),
        consumed: 0,
        status
      });

      logger.info('🔧 体力值已调整', {
        from: Math.round(previousStamina),
        to: Math.round(this.currentStamina)
      });
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<StaminaConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // 重启恢复定时器如果间隔时间改变了
    if (oldConfig.regenInterval !== this.config.regenInterval ||
        oldConfig.regenRate !== this.config.regenRate) {
      this.startRegeneration();
    }

    logger.info('⚙️ 体力管理配置已更新', {
      changes: newConfig,
      currentStatus: this.getStatus()
    });
  }

  /**
   * 启动体力恢复定时器
   */
  private startRegeneration(): void {
    if (this.regenTimer) {
      clearInterval(this.regenTimer);
    }

    this.regenTimer = setInterval(() => {
      if (!this.config.restMode && this.currentStamina < this.config.maxStamina) {
        this.restoreStamina();
      }
    }, this.config.regenInterval);
  }

  /**
   * 获取下次体力恢复时间
   */
  private getNextRegenTime(): Date | undefined {
    if (this.config.restMode || this.currentStamina >= this.config.maxStamina) {
      return undefined;
    }
    
    return new Date(Date.now() + this.config.regenInterval);
  }

  /**
   * 获取详细统计信息
   */
  getStats(): {
    status: StaminaStatus;
    timeSinceLastReply: number;
    estimatedFullRegenTime: number;
    replyProbability: number;
  } {
    const status = this.getStatus();
    const timeSinceLastReply = Date.now() - this.lastReplyTime.getTime();
    const missingStamina = this.config.maxStamina - this.currentStamina;
    const estimatedFullRegenTime = Math.ceil(missingStamina / this.config.regenRate) * this.config.regenInterval;
    
    return {
      status,
      timeSinceLastReply,
      estimatedFullRegenTime,
      replyProbability: this.getReplyProbability()
    };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.regenTimer) {
      clearInterval(this.regenTimer);
      this.regenTimer = undefined;
    }
    this.removeAllListeners();
    logger.info('🔋 体力管理器已关闭');
  }
}

// 创建全局单例实例
export const staminaManager = new StaminaManager();