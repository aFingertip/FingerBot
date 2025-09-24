import { ref, reactive } from 'vue'
import { apiClient } from '../api/client'
import type { LogEntry, SystemStatus, Conversation, WhitelistStatus, LogFetchParams, LogQueryResponse } from '../types'

export function useApi() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const status = reactive<SystemStatus>({
    connected: false,
    ai_ready: false
  })

  const logs = ref<LogEntry[]>([])
  const logPagination = reactive({
    total: 0,
    offset: 0,
    limit: 0,
    hasMore: false,
    range: undefined as LogQueryResponse['range'] | undefined
  })
  const conversations = ref<Conversation[]>([])
  const whitelist = reactive<WhitelistStatus>({
    enabled: false,
    groupCount: 0,
    groups: []
  })

  async function fetchStatus() {
    try {
      loading.value = true
      error.value = null
      const statusData = await apiClient.getStatus()
      Object.assign(status, statusData)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch status:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchLogs(params: LogFetchParams = {}, options: { append?: boolean } = {}) {
    try {
      error.value = null
      const response = await apiClient.getLogs(params)

      if (options.append) {
        const existing = logs.value
        const existingKeys = new Set(existing.map(createLogKey))
        const newEntries: LogEntry[] = []
        for (const entry of response.logs) {
          const key = createLogKey(entry)
          if (!existingKeys.has(key)) {
            existingKeys.add(key)
            newEntries.push(entry)
          }
        }
        logs.value = [...newEntries, ...existing]
      } else {
        logs.value = response.logs
      }

      Object.assign(logPagination, {
        total: response.total,
        offset: response.offset,
        limit: response.limit || params.limit || response.logs.length,
        hasMore: response.hasMore,
        range: response.range
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch logs:', err)
    }
  }

  async function fetchConversations() {
    try {
      loading.value = true
      error.value = null
      const conversationsData = await apiClient.getConversations()
      conversations.value = conversationsData
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch conversations:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchWhitelist() {
    try {
      loading.value = true
      error.value = null
      const whitelistData = await apiClient.getWhitelistStatus()
      Object.assign(whitelist, whitelistData)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch whitelist:', err)
    } finally {
      loading.value = false
    }
  }

  async function addGroupToWhitelist(groupId: string) {
    try {
      loading.value = true
      error.value = null
      await apiClient.addGroupToWhitelist([groupId])
      await fetchWhitelist() // Refresh whitelist
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to add group:', err)
    } finally {
      loading.value = false
    }
  }

  async function removeGroupFromWhitelist(groupId: string) {
    try {
      loading.value = true
      error.value = null
      await apiClient.removeGroupFromWhitelist([groupId])
      await fetchWhitelist() // Refresh whitelist
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to remove group:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    status,
    logs,
    conversations,
    whitelist,
    fetchStatus,
    fetchLogs,
    fetchConversations,
    fetchWhitelist,
    addGroupToWhitelist,
    removeGroupFromWhitelist,
    logPagination
  }
}

function createLogKey(log: LogEntry): string {
  return `${log.timestamp}|${log.level}|${log.message}`
}
