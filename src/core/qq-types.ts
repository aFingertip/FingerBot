// QQ相关类型定义
export interface QQMessage {
  post_type: 'message';
  message_type: 'private' | 'group';
  sub_type?: string;
  message_id: number;
  user_id: number;
  message: string | QQMessageSegment[];
  raw_message: string;
  font: number;
  sender: QQSender;
  time: number;
  group_id?: number; // 群消息时存在
}

export interface QQSender {
  user_id: number;
  nickname: string;
  card?: string; // 群名片
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  area?: string;
  level?: string;
  role?: 'owner' | 'admin' | 'member'; // 群角色
  title?: string;
}

export interface QQMessageSegment {
  type: string;
  data: any;
}

// OneBot API 发送消息格式
export interface OneBotSendMessage {
  action: 'send_private_msg' | 'send_group_msg';
  params: {
    user_id?: number;
    group_id?: number;
    message: string | QQMessageSegment[];
    auto_escape?: boolean;
  };
  echo?: string;
}

// WebSocket 事件类型
export interface WSEvent {
  post_type: string;
  [key: string]: any;
}

// 快速回复消息格式
export interface QuickReplyMessage {
  reply: string;
  at_sender?: boolean;
  delete?: boolean;
}