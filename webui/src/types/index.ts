export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  meta?: Record<string, any>
}

export interface LogFetchParams {
  limit?: number
  offset?: number
  start?: string
  end?: string
}

export interface LogQueryResponse {
  logs: LogEntry[]
  count: number
  total: number
  offset: number
  limit: number
  hasMore: boolean
  range?: {
    start?: string
    end?: string
    source: 'memory' | 'file' | 'hybrid'
  }
}

export interface SystemStatus {
  connected: boolean
  ai_ready: boolean
  connectionCount?: number
  uptime?: number
}

export interface Message {
  userId: string
  userName?: string
  content: string
  timestamp: string
}

export interface Conversation {
  userId: string
  groupId?: string
  messages: Message[]
  lastActive: string
}

export interface WhitelistStatus {
  enabled: boolean
  groupCount: number
  groups: string[]
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface ApiKeyStatus {
  key: string
  status: 'active' | 'blocked' | 'error'
  errorCount: number
  lastError?: string
  blockedUntil?: string
}

export interface AdminStatus {
  websocketConnections: number
  aiStatus: string
  uptime: string
  conversationCount: number
  apiKeys: ApiKeyStatus[]
}

export interface ApiKeyManagerStatus {
  totalKeys: number
  availableKeys: number
  blockedKeys: number
  currentKey: string
  keyDetails: Array<{
    keyPreview: string
    isBlocked: boolean
    errorCount: number
    blockTimeRemaining?: number
  }>
}
