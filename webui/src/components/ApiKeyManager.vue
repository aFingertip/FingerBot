<template>
  <div class="card">
    <div class="header">
      <h3>🔑 API Key 管理</h3>
      <div class="header-stats">
        <span class="stat-item">
          总计: <span class="stat-total">{{ keyStatus?.totalKeys || 0 }}</span>
        </span>
        <span class="stat-item">
          可用: <span class="stat-available">{{ keyStatus?.availableKeys || 0 }}</span>
        </span>
        <span class="stat-item">
          阻断: <span class="stat-blocked">{{ keyStatus?.blockedKeys || 0 }}</span>
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      加载API Key状态...
    </div>

    <div v-else-if="error" class="error-message">
      <span class="error-icon">⚠️</span>
      {{ error }}
      <button @click="fetchStatus" class="retry-btn">重试</button>
    </div>

    <div v-else-if="keyStatus" class="content">
      <div class="current-key">
        <div class="current-label">当前使用的API Key:</div>
        <div class="current-value">{{ keyStatus.currentKey }}</div>
        <button 
          @click="switchApiKey" 
          :disabled="switchingKey || keyStatus.availableKeys <= 1"
          class="switch-btn"
        >
          {{ switchingKey ? '切换中...' : '切换到下一个' }}
        </button>
      </div>

      <div class="keys-list">
        <div class="list-header">
          <h4>API Key 详细状态</h4>
          <button @click="fetchStatus" class="refresh-btn">🔄 刷新</button>
        </div>
        
        <div class="key-grid">
          <div 
            v-for="(key, index) in keyStatus.keyDetails" 
            :key="index"
            class="key-card"
            :class="{ 
              blocked: key.isBlocked, 
              current: key.keyPreview === keyStatus.currentKey 
            }"
          >
            <div class="key-header">
              <span class="key-preview">{{ key.keyPreview }}</span>
              <div class="key-badges">
                <span v-if="key.keyPreview === keyStatus.currentKey" class="badge current-badge">
                  当前
                </span>
                <span v-if="key.isBlocked" class="badge blocked-badge">
                  阻断中
                </span>
                <span v-else class="badge available-badge">
                  可用
                </span>
              </div>
            </div>

            <div class="key-stats">
              <div class="stat-row">
                <span class="stat-label">错误次数:</span>
                <span class="stat-value" :class="{ warning: key.errorCount >= 3 }">
                  {{ key.errorCount }}/5
                </span>
              </div>
              
              <div v-if="key.isBlocked && key.blockTimeRemaining !== undefined" class="stat-row">
                <span class="stat-label">恢复时间:</span>
                <span class="stat-value blocked-time">
                  {{ formatBlockTime(key.blockTimeRemaining) }}
                </span>
              </div>
            </div>

            <div class="key-actions">
              <button 
                v-if="key.isBlocked || key.errorCount > 0"
                @click="resetApiKey(key.keyPreview)"
                :disabled="resetting.has(key.keyPreview)"
                class="reset-btn"
              >
                {{ resetting.has(key.keyPreview) ? '重置中...' : '重置状态' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>💡 说明</h4>
        <ul class="info-list">
          <li><strong>错误统计</strong>：每个API Key在5分钟内超过5次错误会被自动阻断1小时</li>
          <li><strong>自动切换</strong>：当前Key被阻断时会自动切换到下一个可用Key</li>
          <li><strong>每日重置</strong>：所有API Key的错误计数会在每天午夜重置</li>
          <li><strong>手动管理</strong>：您可以手动重置Key状态或切换到其他Key</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

interface ApiKeyStatus {
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

const keyStatus = ref<ApiKeyStatus | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const switchingKey = ref(false)
const resetting = ref(new Set<string>())

// 获取API Key状态
async function fetchStatus() {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch('/api/apikeys/status')
    const data = await response.json()
    
    if (data.success) {
      keyStatus.value = data.data
    } else {
      throw new Error(data.error || 'Failed to fetch API key status')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to fetch API key status:', err)
  } finally {
    loading.value = false
  }
}

// 切换API Key
async function switchApiKey() {
  switchingKey.value = true
  
  try {
    const response = await fetch('/api/apikeys/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    
    if (data.success) {
      // 刷新状态
      await fetchStatus()
      // 可以显示成功消息
      console.log('API Key switched successfully:', data.message)
    } else {
      throw new Error(data.error || 'Failed to switch API key')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to switch API key'
    console.error('Failed to switch API key:', err)
  } finally {
    switchingKey.value = false
  }
}

// 重置API Key状态
async function resetApiKey(keyPreview: string) {
  resetting.value.add(keyPreview)
  
  try {
    const response = await fetch('/api/apikeys/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyPreview })
    })
    const data = await response.json()
    
    if (data.success) {
      // 刷新状态
      await fetchStatus()
      console.log('API Key reset successfully:', data.message)
    } else {
      throw new Error(data.error || 'Failed to reset API key')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reset API key'
    console.error('Failed to reset API key:', err)
  } finally {
    resetting.value.delete(keyPreview)
  }
}

// 格式化阻断剩余时间
function formatBlockTime(minutes: number): string {
  if (minutes <= 0) return '即将恢复'
  if (minutes < 60) return `${minutes}分钟后`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}小时${mins}分钟后` : `${hours}小时后`
}

// 组件挂载时获取状态
onMounted(async () => {
  await fetchStatus()
  
  // 设置自动刷新（每30秒）
  setInterval(fetchStatus, 30000)
})

// 暴露刷新方法供父组件调用
defineExpose({
  refresh: fetchStatus
})
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 1.25rem;
  font-weight: 600;
}

.header-stats {
  display: flex;
  gap: 1rem;
}

.stat-item {
  font-size: 0.875rem;
  color: #6b7280;
}

.stat-total { color: #3b82f6; font-weight: 600; }
.stat-available { color: #10b981; font-weight: 600; }
.stat-blocked { color: #ef4444; font-weight: 600; }

.loading, .error-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: #dc2626;
}

.error-icon {
  display: block;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.retry-btn:hover {
  background: #2563eb;
}

.content {
  padding: 1.5rem;
}

.current-key {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.current-label {
  font-weight: 500;
  color: #0c4a6e;
}

.current-value {
  font-family: monospace;
  font-weight: 600;
  color: #0c4a6e;
  flex: 1;
}

.switch-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.switch-btn:hover:not(:disabled) {
  background: #2563eb;
}

.switch-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.list-header h4 {
  margin: 0;
  color: #1f2937;
  font-size: 1.125rem;
}

.refresh-btn {
  padding: 0.5rem 0.75rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: #e5e7eb;
}

.key-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.key-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  background: #fff;
  transition: all 0.2s;
}

.key-card:hover {
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.key-card.current {
  border-color: #3b82f6;
  background: #f8faff;
}

.key-card.blocked {
  border-color: #ef4444;
  background: #fef2f2;
}

.key-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.key-preview {
  font-family: monospace;
  font-weight: 600;
  color: #1f2937;
}

.key-badges {
  display: flex;
  gap: 0.25rem;
}

.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.current-badge {
  background: #dbeafe;
  color: #1d4ed8;
}

.available-badge {
  background: #d1fae5;
  color: #065f46;
}

.blocked-badge {
  background: #fee2e2;
  color: #991b1b;
}

.key-stats {
  margin-bottom: 1rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.stat-label {
  color: #6b7280;
  font-size: 0.875rem;
}

.stat-value {
  font-weight: 500;
  color: #1f2937;
}

.stat-value.warning {
  color: #dc2626;
}

.blocked-time {
  color: #dc2626;
  font-family: monospace;
}

.key-actions {
  display: flex;
  gap: 0.5rem;
}

.reset-btn {
  padding: 0.375rem 0.75rem;
  background: #f59e0b;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.reset-btn:hover:not(:disabled) {
  background: #d97706;
}

.reset-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.info-section {
  border-top: 1px solid #e5e7eb;
  padding-top: 1.5rem;
}

.info-section h4 {
  margin: 0 0 1rem 0;
  color: #1f2937;
  font-size: 1rem;
}

.info-list {
  margin: 0;
  padding-left: 1.25rem;
  color: #6b7280;
}

.info-list li {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .current-key {
    flex-direction: column;
    align-items: flex-start;
  }

  .key-grid {
    grid-template-columns: 1fr;
  }

  .key-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>