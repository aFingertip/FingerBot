import { logger } from '../utils/logger';

export type TaskType = 'send_message' | 'store_memory';

export interface BaseTaskPayload {
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageTaskPayload extends BaseTaskPayload {
  target: {
    userId?: number;
    groupId?: number;
    atUser?: number;
  };
  message: string;
}

export interface StoreMemoryTaskPayload extends BaseTaskPayload {
  memoryType: 'thinking' | 'system';
  content: string;
}

export interface TaskPayloadMap {
  send_message: SendMessageTaskPayload;
  store_memory: StoreMemoryTaskPayload;
}

export interface TaskOptions {
  priority?: 'high' | 'normal';
  maxAttempts?: number;
}

interface InternalTask<T extends TaskType> {
  id: string;
  type: T;
  payload: TaskPayloadMap[T];
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

type TaskHandler<T extends TaskType> = (task: InternalTask<T>) => Promise<void>;

export class TaskQueue {
  private readonly retryDelayStrategy: (attempt: number) => number;
  private readonly handlers = new Map<TaskType, TaskHandler<any>>();
  private readonly queue: InternalTask<TaskType>[] = [];
  private isProcessing = false;
  private stopRequested = false;

  constructor(options: { retryDelayStrategy?: (attempt: number) => number } = {}) {
    this.retryDelayStrategy = options.retryDelayStrategy ?? ((attempt: number) => {
      return Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
    });
  }

  registerHandler<T extends TaskType>(type: T, handler: TaskHandler<T>): void {
    this.handlers.set(type, handler as TaskHandler<any>);
  }

  async enqueue<T extends TaskType>(
    type: T,
    payload: TaskPayloadMap[T],
    options: TaskOptions = {}
  ): Promise<void> {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for task type: ${type}`);
    }

    const task: InternalTask<T> = {
      id: this.generateTaskId(type),
      type,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      createdAt: Date.now(),
      resolve: () => {},
      reject: () => {}
    };

    const taskPromise = new Promise<void>((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    if (options.priority === 'high') {
      this.queue.unshift(task);
    } else {
      this.queue.push(task);
    }

    logger.debug('📥 任务已入队', {
      taskId: task.id,
      type,
      queueSize: this.queue.length
    });

    this.processQueue().catch(error => {
      logger.error('任务队列处理错误', error);
    });

    return taskPromise;
  }

  async shutdown(): Promise<void> {
    this.stopRequested = true;

    // 等待正在处理的任务完成
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.info('🛑 任务队列已停止', {
      remainingTasks: this.queue.length
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.stopRequested) {
      return;
    }

    this.isProcessing = true;

    try {
      while (!this.stopRequested && this.queue.length > 0) {
        const task = this.queue.shift()!;
        const handler = this.handlers.get(task.type);

        if (!handler) {
          logger.error('未找到任务处理器', { taskType: task.type });
          task.reject(new Error(`No handler for task type: ${task.type}`));
          continue;
        }

        try {
          task.attempts += 1;
          logger.debug('⚙️ 开始处理任务', {
            taskId: task.id,
            taskType: task.type,
            attempts: task.attempts
          });

          await handler(task);
          task.resolve();

          logger.debug('✅ 任务处理完成', {
            taskId: task.id,
            taskType: task.type,
            attempts: task.attempts
          });
        } catch (error) {
          logger.error('❌ 任务处理失败', {
            taskId: task.id,
            taskType: task.type,
            attempts: task.attempts,
            error: error instanceof Error ? error.message : String(error)
          });

          if (task.attempts < task.maxAttempts) {
            const delay = Math.max(0, this.retryDelayStrategy(task.attempts));
            logger.warn('🔁 任务准备重试', {
              taskId: task.id,
              delay
            });

            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            this.queue.unshift(task);
          } else {
            const finalError = error instanceof Error ? error : new Error(String(error));
            task.reject(finalError);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    // 如果处理过程中有新任务加入且未请求停止，则继续处理
    if (!this.stopRequested && this.queue.length > 0) {
      setImmediate(() => {
        this.processQueue().catch(error => {
          logger.error('任务队列处理错误', error);
        });
      });
    }
  }

  private generateTaskId(type: TaskType): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
