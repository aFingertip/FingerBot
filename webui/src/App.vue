<template>
  <div class="app">
    <AppHeader :status="status" />
    
    <div class="container">
      <div class="tabs">
        <div 
          class="tab"
          :class="{ active: activeTab === 'logs' }"
          @click="switchTab('logs')"
        >
          📋 实时日志
        </div>
        <div 
          class="tab"
          :class="{ active: activeTab === 'conversations' }"
          @click="switchTab('conversations')"
        >
          💬 对话历史
        </div>
        <div 
          class="tab"
          :class="{ active: activeTab === 'whitelist' }"
          @click="switchTab('whitelist')"
        >
          ⚙️ 白名单管理
        </div>
        <div 
          class="tab"
          :class="{ active: activeTab === 'apikeys' }"
          @click="switchTab('apikeys')"
        >
          🔑 API Key管理
        </div>
        <div 
          class="tab"
          :class="{ active: activeTab === 'stamina' }"
          @click="switchTab('stamina')"
        >
          🔋 体力管理
        </div>
      </div>

      <div v-show="activeTab === 'logs'">
        <LogViewer 
          :logs="logs" 
          :refreshing="refreshing"
          :pagination="logPagination"
          :initial-limit="currentLogParams.limit || defaultLogLimit"
          @refresh="handleLogRefresh"
          ref="logViewer"
        />
      </div>

      <div v-show="activeTab === 'conversations'">
        <ConversationList :conversations="conversations" />
      </div>

      <div v-show="activeTab === 'whitelist'">
        <WhitelistManager 
          :whitelist="whitelist"
          :loading="loading"
          :error="error"
          @add-group="addGroupToWhitelist"
          @remove-group="removeGroupFromWhitelist"
          @refresh="fetchWhitelist"
        />
      </div>

      <div v-show="activeTab === 'apikeys'">
        <ApiKeyManager />
      </div>

      <div v-show="activeTab === 'stamina'">
        <StaminaManager />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import LogViewer from './components/LogViewer.vue'
import ConversationList from './components/ConversationList.vue'
import WhitelistManager from './components/WhitelistManager.vue'
import ApiKeyManager from './components/ApiKeyManager.vue'
import StaminaManager from './components/StaminaManager.vue'
import { useApi } from './composables/useApi'
import type { LogFetchParams } from './types'

type TabType = 'logs' | 'conversations' | 'whitelist' | 'apikeys' | 'stamina'

const activeTab = ref<TabType>('logs')
const refreshing = ref(false)
const logViewer = ref<InstanceType<typeof LogViewer>>()
const refreshInterval = ref<number>()

const {
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
} = useApi()

const defaultLogLimit = 500
const currentLogParams = reactive<LogFetchParams>({
  limit: defaultLogLimit
})

function switchTab(tab: TabType) {
  activeTab.value = tab
  
  if (tab === 'conversations') {
    fetchConversations()
  } else if (tab === 'whitelist') {
    fetchWhitelist()
  }
}

interface LogRefreshPayload extends LogFetchParams {
  append?: boolean
  reset?: boolean
}

function getCurrentLogParams(overrides: LogFetchParams = {}): LogFetchParams {
  return {
    limit: overrides.limit ?? currentLogParams.limit,
    start: overrides.start ?? currentLogParams.start,
    end: overrides.end ?? currentLogParams.end,
    offset: overrides.offset ?? 0
  }
}

async function handleLogRefresh(payload: LogRefreshPayload = {}) {
  const { append, reset, ...query } = payload

  if (reset) {
    currentLogParams.limit = defaultLogLimit
    currentLogParams.start = undefined
    currentLogParams.end = undefined
  }

  if (typeof query.limit === 'number') {
    currentLogParams.limit = query.limit
  }

  if (query.start !== undefined) {
    currentLogParams.start = query.start || undefined
  }

  if (query.end !== undefined) {
    currentLogParams.end = query.end || undefined
  }

  const requestParams: LogFetchParams = {
    limit: currentLogParams.limit,
    start: currentLogParams.start,
    end: currentLogParams.end,
    offset: append ? logs.value.length : query.offset ?? 0
  }

  await fetchLogs(requestParams, { append })
}

async function refreshLogs() {
  if (!logViewer.value?.autoRefresh) return
  
  refreshing.value = true
  try {
    await fetchLogs(getCurrentLogParams())
  } finally {
    refreshing.value = false
  }
}

function startAutoRefresh() {
  refreshInterval.value = window.setInterval(async () => {
    await fetchStatus()
    if (activeTab.value === 'logs') {
      await refreshLogs()
    }
  }, 3000)
}

function stopAutoRefresh() {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
}

onMounted(async () => {
  // 初始加载
  await fetchStatus()
  await fetchLogs(getCurrentLogParams())
  
  // 开始自动刷新
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style>
.app {
  min-height: 100vh;
  background: #f5f5f5;
}
</style>
