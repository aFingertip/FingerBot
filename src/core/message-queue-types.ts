import { Message, ChatResponse } from './types';

/**
 * 消息队列中的消息项
 */
export interface QueuedMessage {
  userId: string;
  userName?: string;
  groupId?: string;
  content: string;
  timestamp: number; // Unix timestamp in seconds
  messageId: string;
  isHighPriority: boolean;
  contextId: string;
  receivedAt: number; // Enqueued timestamp in ms
}

/**
 * 队列配置
 */
export interface QueueConfig {
  /** 机器人名称，用于检测@机器人 */
  botName: string;
  /** 静默时间（秒），对话停止后多长时间触发处理 */
  silenceSeconds: number;
  /** 队列最大消息数 */
  maxQueueSize: number;
  /** 队列最大存在时间（秒） */
  maxQueueAgeSeconds: number;
}

/**
 * 触发队列处理的原因
 */
export type FlushReason = 
  | 'high_priority_trigger'    // 高优先级消息触发
  | 'silence_trigger'          // 静默时间到达
  | 'max_size_trigger'         // 队列大小达到上限
  | 'max_age_trigger'          // 队列消息过老
  | 'manual_trigger'           // 手动触发
  | 'stamina_insufficient';    // 体力不足跳过处理

/**
 * 队列状态信息
 */
export interface QueueStatus {
  currentSize: number;
  isProcessing: boolean;
  lastFlushTime?: number;
  lastFlushReason?: FlushReason;
  totalProcessed: number;
  silenceTimerActive: boolean;
  queueCount?: number;
}

/**
 * 队列处理结果
 */
export interface QueueProcessResult {
  processed: boolean;
  messageCount: number;
  response?: ChatResponse;
  error?: Error;
  reason: FlushReason;
  messages?: QueueMessageLog[];
  contextId?: string;
}

/**
 * 下游处理器接口
 */
export interface IMessageProcessor {
  processMessages(messages: QueuedMessage[], context: string): Promise<ChatResponse>;
}

/**
 * 队列事件监听器
 */
export interface QueueEventListener {
  onMessageQueued?(message: QueuedMessage): void;
  onQueueFlushed?(result: QueueProcessResult): void;
  onQueueError?(error: Error, context: string): void;
}

/**
 * 用于日志记录的消息摘要
 */
export interface QueueMessageLog {
  messageId: string;
  userId: string;
  userName?: string;
  groupId?: string;
  contentPreview: string;
  contextId?: string;
}
