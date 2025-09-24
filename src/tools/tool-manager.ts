import { Tool, ToolCall, ToolResult, ToolExecutionContext } from './types';
import { MentionTool } from './mention-tool';
import { logger } from '../utils/logger';

/**
 * 工具管理器 - 管理所有LLM可用的工具
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerTool(new MentionTool());
  }

  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.debug(`🔧 注册工具: ${tool.name}`, { description: tool.description });
  }

  /**
   * 获取所有工具的Schema描述
   */
  getToolsSchema(): object[] {
    return Array.from(this.tools.values()).map(tool => {
      if ('toSchema' in tool && typeof tool.toSchema === 'function') {
        return tool.toSchema();
      }
      
      // 默认schema生成
      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((props, param) => {
            props[param.name] = {
              type: param.type,
              description: param.description,
              ...(param.enum && { enum: param.enum })
            };
            return props;
          }, {} as Record<string, any>),
          required: tool.parameters.filter(p => p.required).map(p => p.name)
        }
      };
    });
  }

  /**
   * 执行工具调用
   */
  async executeTool(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    
    if (!tool) {
      logger.warn(`❌ 未知工具: ${call.name}`);
      return {
        success: false,
        error: `未知工具: ${call.name}`
      };
    }

    try {
      logger.info(`🔧 执行工具: ${call.name}`, {
        arguments: call.arguments,
        context
      });

      if ('execute' in tool && typeof tool.execute === 'function') {
        const result = await tool.execute(call, context);
        
        logger.info(`✅ 工具执行完成: ${call.name}`, {
          success: result.success,
          result: result.result
        });
        
        return result;
      }

      return {
        success: false,
        error: '工具不支持执行'
      };
    } catch (error) {
      logger.error(`❌ 工具执行失败: ${call.name}`, {
        error: (error as any)?.message || String(error),
        arguments: call.arguments
      });

      return {
        success: false,
        error: `工具执行失败: ${(error as any)?.message || String(error)}`
      };
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}