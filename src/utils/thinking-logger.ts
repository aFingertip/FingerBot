import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './logger';

export interface ThinkingLogEntry {
  memoryType: 'thinking' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'thinking-log.ndjson');

export async function appendThinkingLog(entry: ThinkingLogEntry): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(LOG_FILE, line, 'utf8');
  } catch (error) {
    logger.warn('⚠️ 写入思维链日志失败', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
