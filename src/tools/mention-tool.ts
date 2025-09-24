import { Tool, ToolCall, ToolResult, ToolExecutionContext } from './types';

/**
 * @用户工具 - 让LLM决定是否需要@特定用户
 */
export class MentionTool implements Tool {
  name = 'mention_user';
  description = '在群聊中@特定用户。只有在真正需要引起某个用户注意时才使用此工具。';
  parameters = [
    {
      name: 'user_id',
      type: 'string' as const,
      description: '要@的用户QQ号',
      required: true
    },
    {
      name: 'reason',
      type: 'string' as const,
      description: '@该用户的理由（用于日志记录）',
      required: true
    }
  ];

  async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const { user_id, reason } = call.arguments;

    // 验证参数
    if (!user_id || typeof user_id !== 'string') {
      return {
        success: false,
        error: '缺少或无效的用户ID'
      };
    }

    // 只在群聊中允许@用户
    if (context.messageType !== 'group') {
      return {
        success: false,
        error: '只能在群聊中@用户'
      };
    }

    // 返回@用户的信息
    return {
      success: true,
      result: {
        action: 'mention',
        userId: parseInt(user_id),
        reason: reason || '需要该用户注意此消息'
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
          user_id: {
            type: 'string',
            description: '要@的用户QQ号'
          },
          reason: {
            type: 'string',
            description: '@该用户的理由'
          }
        },
        required: ['user_id', 'reason']
      }
    };
  }
}