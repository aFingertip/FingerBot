import { GoogleGenAI } from '@google/genai';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { ChatResponse, ChatTask, ToolCallInfo } from '../core/types';
import { getCurrentPersona } from '../config/persona';
import { ApiKeyManager } from './api-key-manager';
import { ToolManager, ToolCall, ToolExecutionContext } from '../tools';

export class GeminiClient {
  private keyManager: ApiKeyManager;
  private currentGenAI!: GoogleGenAI;
  private currentApiKey!: string;
  private toolManager: ToolManager;

  // 重试配置
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_BASE = 1000; // 1秒基础延迟

  constructor() {
    this.keyManager = ApiKeyManager.getInstance();
    this.toolManager = new ToolManager();
    this.initializeClient();
  }

  private initializeClient(): void {
    this.currentApiKey = this.keyManager.getCurrentApiKey();
    this.currentGenAI = new GoogleGenAI({ apiKey: this.currentApiKey });

    logger.debug('🔧 Gemini客户端初始化', {
      model: config.gemini.model,
      apiKey: `${this.currentApiKey.substring(0, 10)}...`
    });
  }

  private switchApiKey(): void {
    const oldKey = this.currentApiKey;
    this.currentApiKey = this.keyManager.getCurrentApiKey();

    if (oldKey !== this.currentApiKey) {
      this.currentGenAI = new GoogleGenAI({ apiKey: this.currentApiKey });

      logger.info('🔄 Gemini API Key已切换', {
        from: `${oldKey.substring(0, 10)}...`,
        to: `${this.currentApiKey.substring(0, 10)}...`
      });
    }
  }

  async generateResponse(prompt: string, context?: string, toolContext?: ToolExecutionContext): Promise<ChatResponse> {
    const fullPrompt = this.buildPromptWithThinking(prompt, context);

    return await this.executeWithRetry(async () => {
      logger.info('🤖 调用Gemini API', {
        model: config.gemini.model,
        promptLength: fullPrompt.length,
        apiKey: `${this.currentApiKey.substring(0, 10)}...`,
        prompt: fullPrompt
      });

      // 调用Gemini - 直接使用文本格式
      const response = await this.currentGenAI.models.generateContent({
        model: config.gemini.model,
        contents: fullPrompt
      });

      const textResponse = response.text || '';
      let thinking = '';
      let skipReply = false;

      // 解析文本响应
      const result = await this.parseTextResponse(textResponse);

      thinking = result.thinking || '';

      // 准备工具调用记录（即使没有实际调用工具）
      const toolCalls: ToolCallInfo[] = [];

      // 根据解析结果决定是否跳过回复
      if (result.messages && result.messages.length > 0) {
        // 添加模拟工具调用用于记录
        toolCalls.push({
          name: 'reply_message',
          arguments: { messages: result.messages, thinking: result.thinking },
          result: { action: 'reply', messages: result.messages, thinking: result.thinking }
        });
      } else if (result.reason) {
        skipReply = true;
        toolCalls.push({
          name: 'no_reply',
          arguments: { reason: result.reason, thinking: result.thinking },
          result: { action: 'no_reply', reason: result.reason, thinking: result.thinking }
        });
      } else if (textResponse.trim()) {
        // 如果解析失败但有文本，使用原始文本
        toolCalls.push({
          name: 'reply_message',
          arguments: { messages: [textResponse], thinking: `返回原始文本响应` },
          result: { action: 'reply', messages: [textResponse], thinking: `返回原始文本响应` }
        });
      }

      // 确保有thinking内容
      if (!thinking) {
        thinking = '处理用户请求中...';
      }

      const tokensUsed = response.usageMetadata?.totalTokenCount || this.estimateTokens(textResponse);

      // 构建任务数组（如果需要保持兼容性）
      const tasks: ChatTask[] = [];

      // 根据结果添加任务
      if (result.messages && result.messages.length > 0) {
        tasks.push({ type: 'reply', content: result.messages });
      } else if (result.reason) {
        tasks.push({ type: 'thinking', content: `决定不回复：${result.reason}` });
      }

      logger.info('✅ Gemini API响应成功', {
        thinkingProcess: thinking,
        skipReply,
        toolCalls: toolCalls.length,
        tokensUsed,
        apiKey: `${this.currentApiKey.substring(0, 10)}...`
      });

      // 构建返回对象 with just the first reply message if available or empty string
      let content = '';
      let replies: string[] | undefined;

      if (result.messages && result.messages.length > 0) {
        content = result.messages[0];
        replies = result.messages;
      }

      return {
        content: content,
        timestamp: new Date(),
        tokensUsed,
        thinking,
        skipReply,
        replies, // Only include if there are replies
        tasks: tasks.length > 0 ? tasks : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };
    }, 'generateResponse');
  }

  /**
   * 带重试机制的执行函数
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 记录错误到key管理器
        this.keyManager.recordError(this.currentApiKey, error);

        logger.warn(`🔄 ${operationName} 第${attempt}次尝试失败`, {
          attempt,
          maxRetries: this.MAX_RETRIES,
          error: (error as any)?.message || String(error),
          apiKey: `${this.currentApiKey.substring(0, 10)}...`
        });

        // 如果是429错误或其他需要切换key的错误，尝试切换
        if (this.shouldSwitchKey(error)) {
          this.switchApiKey();
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.MAX_RETRIES) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`⏳ ${delay}ms后进行第${attempt + 1}次重试`);
          await this.sleep(delay);
        }
      }
    }

    // 所有重试都失败了
    logger.error(`❌ ${operationName} 重试${this.MAX_RETRIES}次后仍然失败`, {
      finalError: (lastError as any)?.message || String(lastError),
      apiKeyStatus: this.keyManager.getStatus()
    });

    throw lastError;
  }

  /**
   * 判断是否需要切换API Key
   */
  private shouldSwitchKey(error: any): boolean {
    if (!error) return false;

    // 429错误肯定要切换
    if (error.status === 429 || error.code === 429) return true;
    if (error.message && error.message.includes('429')) return true;
    if (error.message && error.message.toLowerCase().includes('rate limit')) return true;
    if (error.message && error.message.toLowerCase().includes('quota exceeded')) return true;

    // API Key相关错误也切换
    if (error.message && error.message.toLowerCase().includes('api key')) return true;
    if (error.message && error.message.toLowerCase().includes('invalid key')) return true;

    return false;
  }

  /**
   * 计算重试延迟（指数退避）
   */
  private calculateRetryDelay(attempt: number): number {
    // 指数退避 + 随机抖动
    const exponentialDelay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // 0-1秒随机抖动
    return Math.min(exponentialDelay + jitter, 10000); // 最大10秒
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 构建包含思维链的提示词
   */
  private buildPromptWithThinking(userMessage: string, context?: string): string {
    const persona = getCurrentPersona();
    const systemPrompt = persona.systemPrompt;

    // 构建人设相关的指导信息
    let personalityGuide = '';
    if (persona.traits.length > 0) {
      personalityGuide += `\n\n你的个性特征：${persona.traits.join('、')}`;
    }

    if (persona.responseStyle.emoji) {
      personalityGuide += '\n注意：可以适当使用emoji表情来增加亲和力';
    }

    if (persona.responseStyle.casual) {
      personalityGuide += '\n语言风格：使用口语化、亲近的表达方式';
    } else {
      personalityGuide += '\n语言风格：保持专业、正式的表达方式';
    }

    if (persona.behaviors.humor) {
      personalityGuide += '\n可以适当使用幽默来活跃气氛，但要注意场合';
    }

    const botId = config.botId || 'assistant';
    let prompt = systemPrompt + personalityGuide;
    prompt += `\n\n机器人ID：${botId}`;

    if (context && context.trim() !== '') {
      prompt += `\n\n以下是上下文信息，包含当前队列消息、待处理消息以及最近的对话历史：\n${context}`;
      prompt += `\n请重点参考 recentHistory 数组（按时间升序，字段 role="user"/"assistant"）还原对话节奏，同时结合 queueMessages 数组理解本次待处理内容。`;
      prompt += `\n\n最新待回复的消息通常是 queueMessages 数组中的最后一项（若为空，则 recentHistory 的最后一项即为最新消息）。请仅代表机器人「${persona.name}」发言。`;
    } else {
      prompt += `\n\n最新待回复的消息：${userMessage}`;
    }

    prompt += `\n若最后一条消息的 role 为 "assistant"，表示你已经回应过，请使用 no_reply 工具明确不回复。`;

    // 工具使用指导 - 更明确的函数调用指令
    prompt += `\n\n重要：你必须返回符合以下格式的JSON响应，不要包含任何其他文本说明。
      
      选择以下一种JSON格式进行回复：
      
      格式1 - 回复消息：
      {
        "messages": ["你的回复内容1", "你的回复内容2"],
        "thinking": "你的详细思考过程，解释为什么这样回复"
      }
      
      格式2 - 不回复消息：
      {
        "reason": "不回复的原因",
        "thinking": "你的详细思考过程，解释为什么不回复"
      }

      规则：
      - 每次响应必须返回上述两种JSON格式之一
      - thinking 字段必须包含详细的分析和思考过程
      - messages 数组最多包含3条消息，避免内容过长
      - 仔细分析上下文决定是否需要回复，避免无意义的回应`;

    return prompt;
  }

  /**
   * 将ToolManager的Schema转换为Gemini Function Calling格式
   */
  private convertToolsToGeminiFormat(): any[] {
    const toolsSchema = this.toolManager.getToolsSchema();

    if (toolsSchema.length === 0) {
      return [];
    }

    const functionDeclarations = toolsSchema.map((tool: any) => {
      // 将参数类型转换为Gemini格式
      const convertType = (type: string): string => {
        const typeMap: Record<string, string> = {
          'string': 'STRING',
          'number': 'NUMBER',
          'boolean': 'BOOLEAN',
          'array': 'ARRAY'
        };
        return typeMap[type.toLowerCase()] || 'STRING';
      };

      // 转换参数properties
      const properties: Record<string, any> = {};
      if (tool.parameters?.properties) {
        Object.entries(tool.parameters.properties).forEach(([key, value]: [string, any]) => {
          properties[key] = {
            type: convertType(value.type),
            description: value.description
          };
        });
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties,
          required: tool.parameters?.required || []
        }
      };
    });

    return [{
      functionDeclarations
    }];
  }

  /**
   * 解析文本响应，支持JSON格式的messages和thinking字段
   */
  private async parseTextResponse(text: string): Promise<{ messages?: string[], thinking?: string, reason?: string }> {
    if (!text) return {};

    try {
      // 清理文本，移除可能的markdown代码块标记
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```json\n?/i, '').replace(/```\s*$/g, '');

      // 尝试解析JSON
      const parsed = JSON.parse(cleaned);

      // 检查是否包含预期的字段
      if (parsed.messages || parsed.thinking || parsed.reason) {
        return {
          messages: Array.isArray(parsed.messages) ? parsed.messages : (typeof parsed.messages === 'string' ? [parsed.messages] : undefined),
          thinking: typeof parsed.thinking === 'string' ? parsed.thinking : undefined,
          reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
        };
      }
    } catch (error) {
      logger.debug(`JSON解析失败，尝试提取文本内容: ${error}`);
    }

    // 如果JSON解析失败但文本非空，返回文本作为消息
    if (text.trim()) {
      return {
        messages: [text.trim()]
      };
    }

    return {};
  }


  private estimateTokens(text: string): number {
    // 粗略估算 token 数量（中文按字符计算，英文按单词）
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text.replace(/[\u4e00-\u9fff]/g, '').trim().split(/\s+/).length;

    return chineseChars + englishWords;
  }

  async testConnection(): Promise<boolean> {
    try {
      return await this.executeWithRetry(async () => {
        const response = await this.currentGenAI.models.generateContent({
          model: config.gemini.model,
          contents: "Hello"
        });
        const _ = response.text || '';

        logger.info('✅ Gemini连接测试成功', {
          apiKey: `${this.currentApiKey.substring(0, 10)}...`
        });
        return true;
      }, 'testConnection');
    } catch (error) {
      logger.error('❌ Gemini连接测试失败', {
        error: (error as any)?.message || String(error),
        apiKeyStatus: this.keyManager.getStatus()
      });
      return false;
    }
  }

  /**
   * 获取API Key状态信息
   */
  getApiKeyStatus(): any {
    return this.keyManager.getStatus();
  }

  /**
   * 手动重置API Key状态（管理员功能）
   */
  resetApiKeyStatus(keyPreview: string): boolean {
    return this.keyManager.resetApiKey(keyPreview);
  }

  /**
   * 强制切换到下一个可用的API Key
   */
  forceKeySwitch(): void {
    const oldKey = this.currentApiKey;

    // 使用KeyManager的switchToNext方法切换到下一个key
    const newKey = this.keyManager.switchToNext();

    if (oldKey !== newKey) {
      // 重新初始化客户端使用新的key
      this.currentApiKey = newKey;
      this.currentGenAI = new GoogleGenAI({ apiKey: this.currentApiKey });

      logger.info('🔧 手动强制切换API Key完成', {
        from: `${oldKey.substring(0, 10)}...`,
        to: `${this.currentApiKey.substring(0, 10)}...`
      });
    } else {
      logger.warn('⚠️ 没有其他可用的API Key，保持当前key');
      throw new Error('没有其他可用的API Key可以切换');
    }
  }
}
