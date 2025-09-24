export interface Message {
  id: string;
  userId: string;
  userName?: string;  // 用户显示名称（群昵称或QQ昵称）
  groupId?: string;
  conversationId?: string;  // 会话唯一标识，优先使用群ID或私聊用户ID
  content: string;
  timestamp: Date;
  type: 'text' | 'command';
}

export type ChatTask = ThinkingTask | ReplyTask;

export interface ThinkingTask {
  type: 'thinking';
  content: string;
}

export interface ReplyTask {
  type: 'reply';
  content: string[];
}

export interface ChatResponse {
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  skipReply?: boolean;  // 标记是否跳过发送回复
  thinking?: string;    // AI的思维过程链
  replies?: string[];   // 批量回复内容
  messageIds?: string[]; // 批处理时关联的消息ID列表
  tasks?: ChatTask[];   // 结构化任务列表
  toolCalls?: ToolCallInfo[]; // 工具调用信息
}

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface User {
  id: string;
  name: string;
  joinedAt: Date;
}

export interface Group {
  id: string;
  name: string;
  members: User[];
  createdAt: Date;
}
