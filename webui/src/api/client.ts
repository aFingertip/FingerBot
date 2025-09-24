import type { LogEntry, SystemStatus, Conversation, WhitelistStatus, ApiResponse, ApiKeyManagerStatus, LogFetchParams, LogQueryResponse } from '../types'

class ApiClient {
  private baseUrl = ''

  async getStatus(): Promise<SystemStatus> {
    const response = await fetch(`${this.baseUrl}/ws/status`)
    const data: ApiResponse<SystemStatus> = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch status')
    }
    return data.data || data
  }

  async getLogs(params: LogFetchParams = {}): Promise<LogQueryResponse> {
    const searchParams = new URLSearchParams()

    if (typeof params.limit === 'number') {
      searchParams.set('limit', params.limit.toString())
    }

    if (typeof params.offset === 'number') {
      searchParams.set('offset', params.offset.toString())
    }

    if (params.start) {
      searchParams.set('start', params.start)
    }

    if (params.end) {
      searchParams.set('end', params.end)
    }

    const query = searchParams.toString()
    const response = await fetch(`${this.baseUrl}/api/logs${query ? `?${query}` : ''}`)
    const data: any = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch logs')
    }

    return {
      logs: data.logs || [],
      count: data.count ?? (Array.isArray(data.logs) ? data.logs.length : 0),
      total: data.total ?? (Array.isArray(data.logs) ? data.logs.length : 0),
      offset: data.offset ?? params.offset ?? 0,
      limit: data.limit ?? params.limit ?? 0,
      hasMore: data.hasMore ?? false,
      range: data.range
    }
  }

  async getConversations(): Promise<Conversation[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations`)
    const data: any = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch conversations')
    }
    return data.conversations || []
  }

  async getWhitelistStatus(): Promise<WhitelistStatus> {
    const response = await fetch(`${this.baseUrl}/whitelist/status`)
    const data: ApiResponse<WhitelistStatus> = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch whitelist status')
    }
    return data.data || data
  }

  async addGroupToWhitelist(groups: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/whitelist/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups })
    })
    const data: ApiResponse = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to add group to whitelist')
    }
  }

  async removeGroupFromWhitelist(groups: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/whitelist/groups`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups })
    })
    const data: ApiResponse = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to remove group from whitelist')
    }
  }

  async clearConversation(userId: string, groupId?: string): Promise<void> {
    const params = new URLSearchParams({ userId })
    if (groupId) params.append('groupId', groupId)
    
    const response = await fetch(`${this.baseUrl}/conversation?${params}`, {
      method: 'DELETE'
    })
    const data: ApiResponse = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to clear conversation')
    }
  }

  // API Key Management
  async getApiKeyStatus(): Promise<ApiKeyManagerStatus> {
    const response = await fetch(`${this.baseUrl}/api/apikeys/status`)
    const data: ApiResponse<ApiKeyManagerStatus> = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch API key status')
    }
    return data.data!
  }

  async resetApiKey(keyPreview: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/apikeys/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyPreview })
    })
    const data: ApiResponse = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to reset API key')
    }
  }

  async switchApiKey(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/apikeys/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data: ApiResponse<{ currentKey: string }> = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to switch API key')
    }
    return data.currentKey || data.data?.currentKey || ''
  }
}

export const apiClient = new ApiClient()
