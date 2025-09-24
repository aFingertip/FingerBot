import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  gemini: {
    // 合并所有API Keys：主Key + 备用Keys，支持逗号分隔的多个Key
    apiKeys: (() => {
      const mainKeys = process.env.GEMINI_API_KEY?.split(',')?.map(key => key.trim()).filter(key => key) || [];
      const backupKeys = process.env.GEMINI_API_KEYS_BACKUP?.split(',')?.map(key => key.trim()).filter(key => key) || [];
      
      // 合并并去重
      const allKeys = [...mainKeys, ...backupKeys];
      return [...new Set(allKeys)];
    })(),
    // 保持向后兼容
    get apiKey() { return this.apiKeys[0] || ''; },
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  
  ai: {
    maxTokens: parseInt(process.env.MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
  },
  
  memory: {
    limit: parseInt(process.env.MEMORY_LIMIT || '100'),
  },
  
  security: {
    webhookSecret: process.env.WEBHOOK_SECRET || '',
  },
  
  websocket: {
    serverPath: process.env.WS_SERVER_PATH || '/ws',
  },
  
  groupWhitelist: {
    enabled: !!process.env.GROUP_WHITELIST,
    groups: process.env.GROUP_WHITELIST 
      ? process.env.GROUP_WHITELIST.split(',').map(id => id.trim()).filter(id => id)
      : []
  },
  messageQueue: {
    silenceSeconds: parseInt(process.env.QUEUE_SILENCE_SECONDS || '8'), // 静默触发时间
    maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE || '10'), // 队列最大消息数
    maxQueueAgeSeconds: parseInt(process.env.QUEUE_MAX_AGE_SECONDS || '30'), // 队列最大存在时间
  },

  botId: process.env.BOT_ID || process.env.BOT_QQ_ID || 'assistant',
  botName: process.env.BOT_NAME || process.env.BOT_QQ_ID || 'FingerBot',

  stamina: {
    maxStamina: parseInt(process.env.STAMINA_MAX_STAMINA || '100'),
    replyStaminaCost: parseInt(process.env.STAMINA_REPLY_COST || '10'),
    regenRate: parseInt(process.env.STAMINA_REGEN_RATE || '5'),
    regenInterval: parseInt(process.env.STAMINA_REGEN_INTERVAL || '60000'),
    lowStaminaThreshold: parseInt(process.env.STAMINA_LOW_THRESHOLD || '30'),
    criticalStaminaThreshold: parseInt(process.env.STAMINA_CRITICAL_THRESHOLD || '10'),
    restMode: process.env.STAMINA_REST_MODE?.toLowerCase() === 'true'
  }
};

export function validateConfig(): boolean {
  if (!config.gemini.apiKeys || !config.gemini.apiKeys.length) {
    console.error('GEMINI_API_KEY is required (can be comma-separated for multiple keys)');
    return false;
  }
  
  return true;
}
