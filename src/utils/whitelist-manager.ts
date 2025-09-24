import { config } from './config';
import { logger } from './logger';

export class WhitelistManager {
  private static instance: WhitelistManager;
  private groupWhitelist: Set<string>;

  private constructor() {
    this.groupWhitelist = new Set(config.groupWhitelist.groups);
    this.logWhitelistStatus();
  }

  static getInstance(): WhitelistManager {
    if (!WhitelistManager.instance) {
      WhitelistManager.instance = new WhitelistManager();
    }
    return WhitelistManager.instance;
  }

  private logWhitelistStatus(): void {
    if (!config.groupWhitelist.enabled) {
      logger.info('📢 群聊白名单: 未启用 (所有群聊都可以使用机器人)');
    } else if (this.groupWhitelist.size === 0) {
      logger.warn('⚠️  群聊白名单: 已启用但列表为空 (将拒绝所有群聊消息)');
    } else {
      logger.info(`📋 群聊白名单: 已启用，允许 ${this.groupWhitelist.size} 个群聊`, {
        groups: Array.from(this.groupWhitelist)
      });
    }
  }

  // 检查群组是否在白名单中
  isGroupAllowed(groupId: number | string): boolean {
    // 如果未启用白名单，则允许所有群组
    if (!config.groupWhitelist.enabled) {
      return true;
    }

    const groupIdStr = String(groupId);
    const allowed = this.groupWhitelist.has(groupIdStr);
    
    if (!allowed) {
      logger.debug(`🚫 群聊被白名单拒绝: ${groupIdStr}`);
    } else {
      logger.debug(`✅ 群聊通过白名单检查: ${groupIdStr}`);
    }
    
    return allowed;
  }

  // 检查私聊是否允许（私聊通常都允许，除非特殊配置）
  isPrivateMessageAllowed(userId: number | string): boolean {
    // 私聊消息默认允许，可以在这里添加私聊白名单逻辑
    return true;
  }

  // 添加群组到白名单
  addGroup(groupId: number | string): boolean {
    const groupIdStr = String(groupId);
    
    if (this.groupWhitelist.has(groupIdStr)) {
      logger.info(`📋 群组已在白名单中: ${groupIdStr}`);
      return false;
    }
    
    this.groupWhitelist.add(groupIdStr);
    logger.info(`✅ 群组已添加到白名单: ${groupIdStr}`);
    return true;
  }

  // 从白名单移除群组
  removeGroup(groupId: number | string): boolean {
    const groupIdStr = String(groupId);
    
    if (!this.groupWhitelist.has(groupIdStr)) {
      logger.info(`📋 群组不在白名单中: ${groupIdStr}`);
      return false;
    }
    
    this.groupWhitelist.delete(groupIdStr);
    logger.info(`❌ 群组已从白名单移除: ${groupIdStr}`);
    return true;
  }

  // 获取白名单群组列表
  getWhitelistedGroups(): string[] {
    return Array.from(this.groupWhitelist);
  }

  // 获取白名单状态
  getWhitelistStatus() {
    return {
      enabled: config.groupWhitelist.enabled,
      groupCount: this.groupWhitelist.size,
      groups: this.getWhitelistedGroups()
    };
  }

  // 清空白名单
  clearWhitelist(): void {
    const previousCount = this.groupWhitelist.size;
    this.groupWhitelist.clear();
    logger.info(`🧹 已清空群聊白名单 (原有${previousCount}个群组)`);
  }

  // 批量添加群组
  addGroups(groupIds: (number | string)[]): { added: string[]; existing: string[] } {
    const added: string[] = [];
    const existing: string[] = [];

    groupIds.forEach(groupId => {
      const groupIdStr = String(groupId);
      if (this.groupWhitelist.has(groupIdStr)) {
        existing.push(groupIdStr);
      } else {
        this.groupWhitelist.add(groupIdStr);
        added.push(groupIdStr);
      }
    });

    if (added.length > 0) {
      logger.info(`✅ 批量添加群组到白名单: ${added.join(', ')}`);
    }
    if (existing.length > 0) {
      logger.info(`📋 以下群组已在白名单中: ${existing.join(', ')}`);
    }

    return { added, existing };
  }

  // 检查消息是否应该被处理（综合检查）
  shouldProcessMessage(messageType: 'private' | 'group', id: number | string): boolean {
    if (messageType === 'private') {
      return this.isPrivateMessageAllowed(id);
    } else if (messageType === 'group') {
      return this.isGroupAllowed(id);
    }
    
    return false;
  }
}