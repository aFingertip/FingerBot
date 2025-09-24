import { logger } from './logger';

export class BotStateManager {
  private static instance: BotStateManager;
  private isGroupChatEnabled: boolean = true;

  private constructor() {}

  static getInstance(): BotStateManager {
    if (!BotStateManager.instance) {
      BotStateManager.instance = new BotStateManager();
    }
    return BotStateManager.instance;
  }

  isGroupChatActive(): boolean {
    return this.isGroupChatEnabled;
  }

  enableGroupChat(): boolean {
    if (this.isGroupChatEnabled) {
      return false; // Already enabled
    }
    this.isGroupChatEnabled = true;
    logger.info('🟢 Bot group chat functionality enabled');
    return true;
  }

  disableGroupChat(): boolean {
    if (!this.isGroupChatEnabled) {
      return false; // Already disabled
    }
    this.isGroupChatEnabled = false;
    logger.info('🔴 Bot group chat functionality disabled');
    return true;
  }

  getStatus(): { groupChatEnabled: boolean } {
    return {
      groupChatEnabled: this.isGroupChatEnabled
    };
  }
}