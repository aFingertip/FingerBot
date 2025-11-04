/**
 * 体力管理器 - 基于惯性疲劳模型的体力滑坡算法
 *
 * 核心思想：
 *  - 强度越大，体力消耗越快（非线性放大）
 *  - 消耗还会生成"惯性疲劳"（momentum），短期内抑制恢复
 *  - 停下后体力不会立刻回升，而是"滑坡式"继续下降后再缓慢恢复
 *
 * 作者：指尖
 */

import { logger } from './logger';
import { config } from './config';
import { EventEmitter } from 'events';

export interface StaminaConfig {
  maxStamina: number;           // 最大体力值 S_max (默认: 100)
  replyStaminaCost: number;     // 每次回复基础消耗 (用于计算 k, 默认: 5)
  regenRate: number;            // 基础恢复速率 r，点/秒 (默认: 0.33, 即每分钟20点)
  regenInterval: number;        // 更新间隔 (毫秒) (默认: 1000 = 1秒)
  lowStaminaThreshold: number;  // 低体力阈值 (默认: 30)
  criticalStaminaThreshold: number; // 极低体力阈值 (默认: 10)
  restMode: boolean;            // 休息模式，暂停体力消耗 (默认: false)

  // 惯性疲劳模型参数
  k: number;                    // 基础消耗系数 (默认: 1, 每条消息消耗约1点)
  p: number;                    // 强度非线性指数 (默认: 1, 线性消耗)
  alpha: number;                // 惯性累积速率 (默认: 0.5)
  beta: number;                 // 惯性衰减速率 (默认: 0.1)
  gamma: number;                // 惯性抑制恢复系数 (默认: 0.4)
}

export interface StaminaStatus {
  current: number;              // 当前体力值
  max: number;                  // 最大体力值
  momentum: number;             // 惯性疲劳值
  percentage: number;           // 体力百分比
  momentumPercentage: number;   // 惯性疲劳百分比（相对于最大体力）
  level: 'high' | 'medium' | 'low' | 'critical';
  canReply: boolean;            // 是否有足够体力回复
  isRecovering: boolean;        // 是否正在恢复（净恢复 > 0）
  restMode: boolean;            // 是否为休息模式
  nextRegenTime?: Date;         // 下次更新时间
}

export class StaminaManager extends EventEmitter {
  private config: StaminaConfig;
  private currentStamina: number;     // S - 当前体力值
  private momentum: number;           // M - 惯性疲劳值
  private updateTimer?: NodeJS.Timeout;
  private lastUpdateTime: number;     // 上次更新的时间戳
  private lastReplyTime: Date = new Date();
  private lastNetRecovery: number = 0; // 上次净恢复量

  constructor(customConfig?: Partial<StaminaConfig>) {
    super();

    // 合并配置，添加惯性疲劳模型的默认参数
    this.config = {
      maxStamina: config.stamina.maxStamina,
      replyStaminaCost: config.stamina.replyStaminaCost,
      regenRate: config.stamina.regenRate || 0.33,  // 默认每秒0.33点，即每分钟20点
      regenInterval: config.stamina.regenInterval || 1000, // 1秒更新一次
      lowStaminaThreshold: config.stamina.lowStaminaThreshold,
      criticalStaminaThreshold: config.stamina.criticalStaminaThreshold,
      restMode: config.stamina.restMode,

      // 惯性疲劳模型参数（可通过环境变量覆盖）
      k: 1,      // 每条消息基础消耗约1点
      p: 1,      // 线性消耗
      alpha: 0.5,
      beta: 0.1,
      gamma: 0.4,

      ...customConfig
    };

    this.currentStamina = this.config.maxStamina;
    this.momentum = 0;
    this.lastUpdateTime = Date.now();

    this.startContinuousUpdate();

    logger.info('🔋 体力管理器已启动（惯性疲劳模型）', {
      maxStamina: this.config.maxStamina,
      replyStaminaCost: this.config.replyStaminaCost,
      regenRate: this.config.regenRate,
      updateInterval: this.config.regenInterval,
      modelParams: {
        k: this.config.k,
        p: this.config.p,
        alpha: this.config.alpha,
        beta: this.config.beta,
        gamma: this.config.gamma
      }
    });
  }

  /**
   * 核心更新函数 - 实现惯性疲劳模型
   * @param intensity 强度（0 = 静默，>0 = 消耗强度）
   * @param dt 时间增量（秒）
   */
  private update(intensity: number, dt: number): void {
    if (this.config.restMode) {
      // 休息模式：不消耗、不恢复，但惯性继续衰减
      this.momentum = Math.max(0, this.momentum * (1 - this.config.beta * dt));
      return;
    }

    const previousStamina = this.currentStamina;
    const previousMomentum = this.momentum;

    // 1. 更新惯性 M：先衰减再累积
    this.momentum = this.momentum * (1 - this.config.beta * dt) + this.config.alpha * intensity * dt;
    this.momentum = Math.max(0, this.momentum);

    // 2. 消耗体力
    const consume = this.config.k * Math.pow(intensity, this.config.p) * dt;
    this.currentStamina -= consume;

    // 3. 恢复体力（同时计算滑坡抑制）
    const recoveryRaw = this.config.regenRate * (1 - this.currentStamina / this.config.maxStamina);
    const recoveryPenalty = this.config.gamma * this.momentum;
    const netRecovery = (recoveryRaw - recoveryPenalty) * dt;

    this.currentStamina += netRecovery;
    this.lastNetRecovery = netRecovery;

    // 4. 限制范围
    this.currentStamina = Math.max(0, Math.min(this.currentStamina, this.config.maxStamina));

    // 5. 发出变化事件
    const staminaChanged = Math.abs(this.currentStamina - previousStamina) > 0.01;
    const momentumChanged = Math.abs(this.momentum - previousMomentum) > 0.01;

    if (staminaChanged || momentumChanged) {
      const previousLevel = this.calculateLevel(previousStamina);
      const currentLevel = this.calculateLevel(this.currentStamina);

      this.emit('staminaChanged', {
        previous: Math.round(previousStamina * 100) / 100,
        current: Math.round(this.currentStamina * 100) / 100,
        momentum: Math.round(this.momentum * 100) / 100,
        consumed: Math.round(consume * 100) / 100,
        recovered: Math.round(netRecovery * 100) / 100,
        status: this.getStatus()
      });

      // 体力水平变化时发出警告
      if (currentLevel !== previousLevel) {
        this.emit('staminaLevelChanged', {
          previous: previousLevel,
          current: currentLevel,
          status: this.getStatus()
        });

        if (currentLevel === 'low') {
          logger.warn('⚠️ 体力水平降低', this.getStatus());
        } else if (currentLevel === 'critical') {
          logger.warn('🔴 体力极低', this.getStatus());
        } else if ((previousLevel === 'low' || previousLevel === 'critical') &&
                   (currentLevel === 'medium' || currentLevel === 'high')) {
          logger.info('✅ 体力水平恢复', this.getStatus());
        }
      }
    }
  }

  /**
   * 获取当前体力状态
   */
  getStatus(): StaminaStatus {
    const percentage = Math.round((this.currentStamina / this.config.maxStamina) * 100);
    const momentumPercentage = Math.round((this.momentum / this.config.maxStamina) * 100);
    const level = this.calculateLevel(this.currentStamina);
    const canReply = this.canReply();
    const isRecovering = this.lastNetRecovery > 0;

    return {
      current: Math.round(this.currentStamina * 100) / 100,
      max: this.config.maxStamina,
      momentum: Math.round(this.momentum * 100) / 100,
      percentage,
      momentumPercentage,
      level,
      canReply,
      isRecovering,
      restMode: this.config.restMode,
      nextRegenTime: this.getNextUpdateTime()
    };
  }

  /**
   * 计算体力等级
   */
  private calculateLevel(stamina: number): 'high' | 'medium' | 'low' | 'critical' {
    const percentage = (stamina / this.config.maxStamina) * 100;

    if (percentage >= 70) {
      return 'high';
    } else if (percentage >= 50) {
      return 'medium';
    } else if (percentage >= this.config.criticalStaminaThreshold) {
      return 'low';
    } else {
      return 'critical';
    }
  }

  /**
   * 检查是否可以回复消息
   * 新算法：只检查体力是否充足，不使用概率机制
   */
  canReply(): boolean {
    if (this.config.restMode) {
      return false;
    }

    // 确定性检查：体力是否足够处理至少1条消息
    // 使用基础消耗作为阈值
    const minStaminaRequired = this.config.k * Math.pow(1, this.config.p);
    return this.currentStamina >= minStaminaRequired;
  }

  /**
   * 消耗体力（回复消息时调用）
   * @param messageCount 消息数量（强度）
   * @returns 是否成功消耗
   */
  consumeStamina(messageCount: number = 1): boolean {
    if (this.config.restMode) {
      logger.debug('🛌 休息模式下不消耗体力');
      return false;
    }

    // 先更新到当前时间（处理自然恢复和惯性衰减）
    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000; // 转换为秒
    this.lastUpdateTime = now;

    if (dt > 0.001) {  // 如果有显著的时间间隔，先进行自然更新
      this.update(0, dt);
    }

    // 然后进行消耗（使用固定的时间单位：1秒）
    // 这样消耗量只取决于消息数量，不受调用时机影响
    this.update(messageCount, 1.0);
    this.lastReplyTime = new Date();

    logger.debug('⚡ 处理消息消耗体力', {
      messageCount,
      naturalUpdateTime: `${Math.round(dt * 100) / 100}s`,
      status: this.getStatus()
    });

    return true;
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

    // 重启更新定时器如果间隔时间改变了
    if (oldConfig.regenInterval !== this.config.regenInterval) {
      this.startContinuousUpdate();
    }

    logger.info('⚙️ 体力管理配置已更新', {
      changes: newConfig,
      currentStatus: this.getStatus()
    });
  }

  /**
   * 启动连续更新定时器（惯性疲劳模型核心）
   */
  private startContinuousUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastUpdateTime) / 1000; // 转换为秒
      this.lastUpdateTime = now;

      // 静默状态下，intensity = 0，只进行恢复和惯性衰减
      this.update(0, dt);
    }, this.config.regenInterval);

    logger.debug('🔄 连续更新定时器已启动', {
      interval: this.config.regenInterval
    });
  }

  /**
   * 获取下次更新时间
   */
  private getNextUpdateTime(): Date | undefined {
    if (this.config.restMode) {
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
    momentum: number;
    netRecoveryRate: number;
  } {
    const status = this.getStatus();
    const timeSinceLastReply = Date.now() - this.lastReplyTime.getTime();

    // 估算完全恢复时间（考虑惯性疲劳的影响）
    const currentRecoveryRate = this.config.regenRate * (1 - this.currentStamina / this.config.maxStamina);
    const recoveryPenalty = this.config.gamma * this.momentum;
    const netRecoveryRate = Math.max(0, currentRecoveryRate - recoveryPenalty);

    let estimatedFullRegenTime = 0;
    if (netRecoveryRate > 0) {
      const staminaToRecover = this.config.maxStamina - this.currentStamina;
      // 简化估算：假设恢复速率保持不变
      estimatedFullRegenTime = (staminaToRecover / netRecoveryRate) * 1000;
    } else {
      // 如果当前无法恢复，估算惯性衰减后开始恢复的时间
      const timeForMomentumDecay = Math.log(recoveryPenalty / (this.config.gamma * 0.1)) / this.config.beta;
      estimatedFullRegenTime = timeForMomentumDecay * 1000 + 60000; // 加上恢复时间的粗略估算
    }

    return {
      status,
      timeSinceLastReply,
      estimatedFullRegenTime: Math.max(0, estimatedFullRegenTime),
      momentum: Math.round(this.momentum * 100) / 100,
      netRecoveryRate: Math.round(netRecoveryRate * 1000) / 1000
    };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    this.removeAllListeners();
    logger.info('🔋 体力管理器已关闭（惯性疲劳模型）');
  }
}

// 创建全局单例实例
export const staminaManager = new StaminaManager();