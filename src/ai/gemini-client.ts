import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { ChatResponse, ChatTask, ToolCallInfo } from '../core/types';
import { getCurrentPersona } from '../config/persona';
import { ApiKeyManager } from './api-key-manager';
import { ToolManager, ToolCall, ToolExecutionContext } from '../tools';

export class GeminiClient {
  private keyManager: ApiKeyManager;
  private currentGenAI!: GoogleGenerativeAI;
  private currentModel: any;
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
    this.currentGenAI = new GoogleGenerativeAI(this.currentApiKey);
    this.currentModel = this.currentGenAI.getGenerativeModel({ model: config.gemini.model });
    
    logger.debug('🔧 Gemini客户端初始化', {
      model: config.gemini.model,
      apiKey: `${this.currentApiKey.substring(0, 10)}...`
    });
  }

  private switchApiKey(): void {
    const oldKey = this.currentApiKey;
    this.currentApiKey = this.keyManager.getCurrentApiKey();
    
    if (oldKey !== this.currentApiKey) {
      this.currentGenAI = new GoogleGenerativeAI(this.currentApiKey);
      this.currentModel = this.currentGenAI.getGenerativeModel({ model: config.gemini.model });
      
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
      
      const result = await this.currentModel.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      // 使用简化的解析方法
      const parsedResponse = await this.parseResponseWithRetry(text, fullPrompt, toolContext);
      const replies = parsedResponse.replies ?? [];
      const tokensUsed = this.estimateTokens(text);

      // 构建任务数组（保持兼容性）
      const tasks: ChatTask[] = [];
      // if (parsedResponse.thinking) {
      //   tasks.push({ type: 'thinking', content: parsedResponse.thinking });
      // }
      if (replies.length > 0) {
        tasks.push({ type: 'reply', content: replies });
      }

      logger.info('✅ Gemini API响应成功', { 
        responseLength: text.length,
        fullResponse: text,
        thinkingProcess: parsedResponse.thinking,
        finalReplies: replies,
        taskCount: tasks.length,
        toolCalls: parsedResponse.toolCalls?.length || 0,
        tokensUsed,
        apiKey: `${this.currentApiKey.substring(0, 10)}...`
      });

      return {
        content: replies[0] || '',
        timestamp: new Date(),
        tokensUsed,
        thinking: parsedResponse.thinking,
        tasks,
        replies,
        toolCalls: parsedResponse.toolCalls
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
      prompt += `\n\n以下是结构化上下文（JSON 对象），包含当前队列摘要、待处理消息以及最近50条对话历史：\n${context}`;
      prompt += `\n请重点参考 recentHistory 数组（按时间升序，字段 role="user"/"assistant"）还原对话节奏，同时结合 queueMessages 数组理解本次待处理内容。`;
      prompt += `\n\n最新待回复的消息通常是 queueMessages 数组中的最后一项（若为空，则 recentHistory 的最后一项即为最新消息）。请仅代表 role="assistant" 的机器人「${persona.name}」发言。`;
    } else {
      prompt += `\n\n最新待回复的消息：${userMessage}`;
    }

    prompt += `\n若最后一条消息的 role 为 "assistant"，表示你已经回应过，本次无需生成新回复。`;

    // 添加工具说明
    const toolsSchema = this.toolManager.getToolsSchema();
    if (toolsSchema.length > 0) {
      prompt += `\n\n你可以使用以下工具：\n${JSON.stringify(toolsSchema, null, 2)}`;
      prompt += `\n使用工具时，添加 {"type": "tool_call", "name": "工具名", "arguments": {...}} 到数组中。`;
    }

    // 输出结构化任务数组
    prompt += `\n\n请先进行严格的内部思考（必须输出并仅输出一条 {"type":"thinking"}，且置于数组第一项），再决定是否回复。输出必须严格为 JSON 数组字符串，不包含任何额外文本或Markdown代码块。数组元素格式如下：
      {
        "type": "thinking",
        "content": "字符串"
      }
      或
      {
        "type": "reply",
        "content": ["字符串", ...]
      }
      或
      {
        "type": "tool_call",
        "name": "工具名",
        "arguments": {...}
      }
      要求：
      - 必须输出且仅输出一条 {"type":"thinking"} 元素，且作为数组第一项
      - {"type":"reply"} 的 content 必须是字符串数组；若没有合适的回复，可省略 reply 元素
      - {"type":"tool_call"} 用于调用工具，如@用户等特殊操作
      - 回复条数可为 0 条或多条，由你根据上下文自行决定
      - 字段名固定为 type、content/name/arguments，不要添加多余字段`;

    return prompt;
  }

  /**
   * 简化的响应解析方法，支持自动重新格式化和工具调用
   */
  private async parseResponseWithRetry(text: string, originalPrompt?: string, context?: ToolExecutionContext): Promise<{ thinking: string; replies: string[]; toolCalls?: ToolCallInfo[] }> {
    // 1. 尝试JSON解析（首选）
    const jsonResult = await this.trySimpleJsonParse(text, context);
    if (jsonResult) return jsonResult;
    
    // 2. 请求Gemini重新格式化（仅一次，防止死循环）
    if (originalPrompt) {
      logger.info('🔄 响应格式异常，尝试重新格式化', {
        originalLength: text.length,
        preview: text.substring(0, 100)
      });
      
      const reformatted = await this.requestReformat(text, originalPrompt);
      const retryResult = await this.trySimpleJsonParse(reformatted, context);
      if (retryResult) {
        logger.info('✅ 重新格式化成功');
        return retryResult;
      }
    }
    
    // 3. 最终兜底：直接作为回复内容
    logger.warn('⚠️ 格式解析完全失败，使用原始文本作为回复');
    return {
      thinking: "格式解析失败，已直接返回原始内容",
      replies: text.trim() ? [text.trim()] : ["抱歉，我的回复格式出现了问题"]
    };
  }

  /**
   * 简化的JSON解析，支持工具调用
   */
  private async trySimpleJsonParse(text: string, context?: ToolExecutionContext): Promise<{ thinking: string; replies: string[]; toolCalls?: ToolCallInfo[] } | null> {
    try {
      // 清理常见的格式问题
      let cleaned = text.replace(/\r/g, '').trim();
      
      // 移除代码块标记
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return null;

      let thinking = '';
      let replies: string[] = [];
      const toolCalls: ToolCallInfo[] = [];

      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;

        const type = String(item.type).toLowerCase();
        if (type === 'thinking') {
          thinking = String(item.content || '').trim();
        } else if (type === 'reply') {
          const content = item.content;
          if (Array.isArray(content)) {
            replies.push(...content.map(c => String(c).trim()).filter(c => c));
          } else if (typeof content === 'string' && content.trim()) {
            replies.push(content.trim());
          }
        } else if (type === 'tool_call') {
          // 处理工具调用
          const toolName = String(item.name || '').trim();
          const toolArgs = item.arguments || {};
          
          if (toolName && context) {
            try {
              const result = await this.toolManager.executeTool(
                { name: toolName, arguments: toolArgs },
                context
              );
              
              toolCalls.push({
                name: toolName,
                arguments: toolArgs,
                result: result.result
              });
            } catch (error) {
              logger.error(`工具调用失败: ${toolName}`, { error });
              toolCalls.push({
                name: toolName,
                arguments: toolArgs,
                result: { error: `工具调用失败: ${error}` }
              });
            }
          }
        }
      }

      // 确保有thinking内容
      if (!thinking) {
        thinking = replies.length > 0 
          ? `处理用户请求，准备回复：${replies[0].substring(0, 50)}...`
          : "处理用户请求中...";
      }

      return { 
        thinking, 
        replies, 
        ...(toolCalls.length > 0 && { toolCalls })
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 请求Gemini重新格式化响应
   */
  private async requestReformat(malformedResponse: string, originalPrompt: string): Promise<string> {
    const reformatPrompt = `原始用户输入：
${originalPrompt}

你之前的回复格式有误：
${malformedResponse}

请将上述回复重新整理为标准JSON数组格式，包含thinking和reply元素：
[
  {"type": "thinking", "content": "你的思考过程"},
  {"type": "reply", "content": ["实际回复内容"]}
]

只返回JSON数组，不要任何额外说明文字。`;

    try {
      const result = await this.currentModel.generateContent(reformatPrompt);
      const reformattedText = result.response.text();
      
      logger.debug('📝 重新格式化请求完成', {
        originalLength: malformedResponse.length,
        reformattedLength: reformattedText.length
      });
      
      return reformattedText;
    } catch (error) {
      logger.warn('❌ 重新格式化请求失败', { 
        error: (error as any)?.message || String(error) 
      });
      return malformedResponse; // 返回原始响应
    }
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
        const result = await this.currentModel.generateContent("Hello");
        const response = await result.response;
        response.text();
        
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
      this.currentGenAI = new GoogleGenerativeAI(this.currentApiKey);
      this.currentModel = this.currentGenAI.getGenerativeModel({ model: config.gemini.model });
      
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
