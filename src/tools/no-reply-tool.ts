import { Tool, ToolCall, ToolResult, ToolExecutionContext } from './types';

/**
 * 不回复工具 - 让AI明确决定不回复消息
 */
export class NoReplyTool implements Tool {
  name = 'no_reply';
  description = '明确决定不回复消息。当AI判断不需要回复时调用此工具。例如：已经回复过、消息不需要响应、等待更多上下文等场景。';
  parameters = [
    {
      name: 'reason',
      type: 'string' as const,
      description: '不回复的原因（用于日志记录）',
      required: true
    },
    {
      name: 'thinking',
      type: 'string' as const,
      description: '内部思考过程（用于日志记录和调试）',
      required: false
    }
  ];

  async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const { reason, thinking } = call.arguments;

    // 验证参数
    if (!reason || typeof reason !== 'string') {
      return {
        success: false,
        error: 'reason 参数必须是非空字符串'
      };
    }

    // 返回不回复的信息
    return {
      success: true,
      result: {
        action: 'no_reply',
        reason: reason.trim(),
        thinking: thinking || '分析上下文后决定不回复'
      }
    };
  }

  /**
   * 生成工具的JSON Schema描述
   */
  toSchema(): object {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '不回复的原因（用于日志记录）'
          },
          thinking: {
            type: 'string',
            description: '内部思考过程（用于日志记录和调试）'
          }
        },
        required: ['reason']
      }
    };
  }
}
