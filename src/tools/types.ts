/**
 * LLM工具系统类型定义
 */

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ToolExecutionContext {
  userId: number;
  groupId?: number;
  messageType: 'group' | 'private';
}