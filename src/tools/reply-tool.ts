import { Tool, ToolCall, ToolResult, ToolExecutionContext } from './types';

/**
 * 回复消息工具 - 让AI通过Function Call发送回复消息
 */
export class ReplyTool implements Tool {
  name = 'reply_message';
  description = '发送回复消息给用户。可以发送一条或多条消息。';
  parameters = [
    {
      name: 'messages',
      type: 'array' as const,
      description: '要发送的消息列表（字符串数组），可以是一条或多条',
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
    const { messages, thinking } = call.arguments;

    // 验证参数
    if (!messages || !Array.isArray(messages)) {
      return {
        success: false,
        error: 'messages 参数必须是数组'
      };
    }

    if (messages.length === 0) {
      return {
        success: false,
        error: 'messages 数组不能为空'
      };
    }

    // 验证所有消息都是字符串
    const validMessages = messages.filter(msg => typeof msg === 'string' && msg.trim());

    if (validMessages.length === 0) {
      return {
        success: false,
        error: 'messages 数组中没有有效的字符串消息'
      };
    }

    // 返回回复信息
    return {
      success: true,
      result: {
        action: 'reply',
        messages: validMessages,
        thinking: thinking || '处理用户请求并生成回复'
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
          messages: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: '要发送的消息列表（字符串数组），可以是一条或多条'
          },
          thinking: {
            type: 'string',
            description: '内部思考过程（用于日志记录和调试）'
          }
        },
        required: ['messages']
      }
    };
  }
}
