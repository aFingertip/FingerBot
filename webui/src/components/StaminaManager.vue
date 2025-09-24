<template>
  <div class="stamina-manager">
    <div class="card">
      <div class="card-header">
        <h3>🔋 体力管理</h3>
        <div class="header-actions">
          <button @click="refresh" :disabled="refreshing" class="btn-refresh">
            <span v-if="refreshing">⏳</span>
            <span v-else>🔄</span>
            刷新
          </button>
        </div>
      </div>

      <div v-if="error" class="error-banner">
        <span>❌ {{ error }}</span>
      </div>

      <div v-if="loading && !staminaData" class="loading">
        <div class="loading-spinner"></div>
        <span>加载体力状态中...</span>
      </div>

      <div v-else-if="staminaData" class="stamina-content">
        <!-- 体力状态概览 -->
        <div class="stamina-overview">
          <div class="stamina-bar-container">
            <div class="stamina-info">
              <div class="stamina-level">
                <span class="level-icon">{{ getLevelIcon(staminaData.status.level) }}</span>
                <span class="level-text">{{ getLevelText(staminaData.status.level) }}</span>
                <span class="stamina-value">{{ staminaData.status.current }}/{{ staminaData.status.max }}</span>
              </div>
              <div class="stamina-percentage">{{ staminaData.status.percentage }}%</div>
            </div>
            
            <div class="stamina-bar">
              <div 
                class="stamina-fill" 
                :class="getBarClass(staminaData.status.level)"
                :style="{ width: `${staminaData.status.percentage}%` }"
              ></div>
            </div>
          </div>

          <!-- 状态指示器 -->
          <div class="status-indicators">
            <div class="indicator" :class="{ active: staminaData.status.canReply }">
              <span class="indicator-icon">{{ staminaData.status.canReply ? '✅' : '❌' }}</span>
              <span>可回复状态</span>
            </div>
            <div class="indicator" :class="{ active: staminaData.status.restMode }">
              <span class="indicator-icon">{{ staminaData.status.restMode ? '😴' : '😊' }}</span>
              <span>{{ staminaData.status.restMode ? '休息模式' : '工作模式' }}</span>
            </div>
          </div>
        </div>

        <!-- 详细统计信息 -->
        <div class="stamina-stats">
          <div class="stat-row">
            <div class="stat-item">
              <span class="stat-label">🎯 回复概率</span>
              <span class="stat-value">{{ Math.round(staminaData.stats.replyProbability * 100) }}%</span>
            </div>
            <div class="stat-item" v-if="staminaData.status.nextRegenTime">
              <span class="stat-label">⏱️ 下次恢复</span>
              <span class="stat-value">{{ getTimeUntilRegen(staminaData.status.nextRegenTime) }}</span>
            </div>
          </div>
          <div class="stat-row">
            <div class="stat-item">
              <span class="stat-label">⏰ 上次回复</span>
              <span class="stat-value">{{ formatTimeSince(staminaData.stats.timeSinceLastReply) }}</span>
            </div>
            <div class="stat-item" v-if="staminaData.stats.estimatedFullRegenTime > 0">
              <span class="stat-label">🔄 完全恢复</span>
              <span class="stat-value">{{ formatDuration(staminaData.stats.estimatedFullRegenTime) }}</span>
            </div>
          </div>
        </div>

        <!-- 控制面板 -->
        <div class="stamina-controls">
          <div class="control-section">
            <h4>快速操作</h4>
            <div class="control-buttons">
              <button 
                @click="toggleRestMode" 
                :disabled="loading"
                :class="['btn-control', staminaData.status.restMode ? 'btn-warning' : 'btn-success']"
              >
                {{ staminaData.status.restMode ? '😊 退出休息' : '😴 启用休息' }}
              </button>
              
              <button 
                @click="showSetStaminaModal = true" 
                :disabled="loading"
                class="btn-control btn-primary"
              >
                🔧 设置体力值
              </button>
            </div>
          </div>

          <div class="control-section">
            <h4>预设体力值</h4>
            <div class="preset-buttons">
              <button 
                v-for="preset in presetValues" 
                :key="preset.value"
                @click="setStamina(preset.value)" 
                :disabled="loading"
                class="btn-preset"
              >
                {{ preset.icon }} {{ preset.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置体力值模态框 -->
    <div v-if="showSetStaminaModal" class="modal-overlay" @click="showSetStaminaModal = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h4>🔧 设置体力值</h4>
          <button @click="showSetStaminaModal = false" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label for="stamina-input">体力值 (0-100)</label>
            <input 
              id="stamina-input"
              v-model.number="customStaminaValue" 
              type="number" 
              min="0" 
              max="100" 
              step="1"
              placeholder="请输入体力值"
            />
          </div>
          <div class="range-input">
            <input 
              v-model.number="customStaminaValue"
              type="range" 
              min="0" 
              max="100" 
              step="1"
              class="stamina-slider"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showSetStaminaModal = false" class="btn-cancel">取消</button>
          <button 
            @click="setCustomStamina" 
            :disabled="loading || customStaminaValue < 0 || customStaminaValue > 100"
            class="btn-confirm"
          >
            确认设置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

interface StaminaStatus {
  current: number
  max: number
  percentage: number
  level: 'high' | 'medium' | 'low' | 'critical'
  canReply: boolean
  restMode: boolean
  nextRegenTime?: string
}

interface StaminaStats {
  status: StaminaStatus
  timeSinceLastReply: number
  estimatedFullRegenTime: number
  replyProbability: number
}

interface StaminaResponse {
  success: boolean
  status: StaminaStatus
  stats: StaminaStats
  message?: string
  error?: string
}

const loading = ref(false)
const refreshing = ref(false)
const error = ref<string>('')
const staminaData = ref<{ status: StaminaStatus; stats: StaminaStats } | null>(null)
const showSetStaminaModal = ref(false)
const customStaminaValue = ref(50)
const refreshTimer = ref<number>()

const presetValues = [
  { value: 100, label: '满血', icon: '💚' },
  { value: 75, label: '良好', icon: '💛' },
  { value: 50, label: '一般', icon: '🧡' },
  { value: 25, label: '疲惫', icon: '❤️' },
  { value: 0, label: '耗尽', icon: '💀' }
]

const getLevelIcon = (level: string) => {
  const icons = {
    high: '💚',
    medium: '💛', 
    low: '🧡',
    critical: '❤️'
  }
  return icons[level as keyof typeof icons] || '⚪'
}

const getLevelText = (level: string) => {
  const texts = {
    high: '充沛',
    medium: '良好',
    low: '偏低', 
    critical: '极低'
  }
  return texts[level as keyof typeof texts] || '未知'
}

const getBarClass = (level: string) => {
  return `stamina-level-${level}`
}

const formatTimeSince = (milliseconds: number) => {
  const minutes = Math.floor(milliseconds / 60000)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟前`
  }
  return `${minutes}分钟前`
}

const formatDuration = (milliseconds: number) => {
  const minutes = Math.ceil(milliseconds / 60000)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `约${hours}小时${minutes % 60}分钟`
  }
  return `约${minutes}分钟`
}

const getTimeUntilRegen = (nextRegenTime: string) => {
  const now = Date.now()
  const target = new Date(nextRegenTime).getTime()
  const diff = Math.max(0, target - now)
  
  if (diff === 0) {
    return '即将恢复'
  }
  
  const seconds = Math.ceil(diff / 1000)
  if (seconds < 60) {
    return `${seconds}秒后`
  }
  
  const minutes = Math.ceil(seconds / 60)
  return `${minutes}分钟后`
}

const fetchStaminaStatus = async () => {
  try {
    error.value = ''
    const response = await fetch('/api/stamina/status')
    const data: StaminaResponse = await response.json()
    
    if (data.success && data.status && data.stats) {
      staminaData.value = {
        status: data.status,
        stats: data.stats
      }
    } else {
      throw new Error(data.error || 'Failed to fetch stamina status')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '获取体力状态失败'
  }
}

const refresh = async () => {
  refreshing.value = true
  try {
    await fetchStaminaStatus()
  } finally {
    refreshing.value = false
  }
}

const setStamina = async (value: number) => {
  loading.value = true
  try {
    const response = await fetch('/api/stamina/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    })
    
    const data: StaminaResponse = await response.json()
    
    if (data.success && data.status) {
      staminaData.value = {
        ...staminaData.value!,
        status: data.status
      }
    } else {
      throw new Error(data.error || 'Failed to set stamina')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置体力失败'
  } finally {
    loading.value = false
  }
}

const setCustomStamina = async () => {
  await setStamina(customStaminaValue.value)
  showSetStaminaModal.value = false
}

const toggleRestMode = async () => {
  if (!staminaData.value) return
  
  loading.value = true
  try {
    const newMode = !staminaData.value.status.restMode
    const response = await fetch('/api/stamina/rest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled: newMode })
    })
    
    const data: StaminaResponse = await response.json()
    
    if (data.success && data.status) {
      staminaData.value = {
        ...staminaData.value!,
        status: data.status
      }
    } else {
      throw new Error(data.error || 'Failed to toggle rest mode')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换休息模式失败'
  } finally {
    loading.value = false
  }
}

const startAutoRefresh = () => {
  refreshTimer.value = window.setInterval(() => {
    fetchStaminaStatus()
  }, 5000) // 每5秒刷新一次
}

const stopAutoRefresh = () => {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await fetchStaminaStatus()
    startAutoRefresh()
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.stamina-manager {
  max-width: 800px;
  margin: 0 auto;
}

.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.card-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-refresh {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  background: #fee;
  color: #c53030;
  padding: 16px 24px;
  border-bottom: 1px solid #fed7d7;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: #666;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.stamina-content {
  padding: 24px;
}

.stamina-overview {
  margin-bottom: 32px;
}

.stamina-bar-container {
  margin-bottom: 20px;
}

.stamina-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stamina-level {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-icon {
  font-size: 1.5rem;
}

.level-text {
  font-weight: 600;
  color: #2d3748;
}

.stamina-value {
  color: #666;
  margin-left: 8px;
}

.stamina-percentage {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2d3748;
}

.stamina-bar {
  width: 100%;
  height: 12px;
  background: #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.stamina-fill {
  height: 100%;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.stamina-level-high {
  background: linear-gradient(90deg, #48bb78, #38a169);
}

.stamina-level-medium {
  background: linear-gradient(90deg, #ed8936, #dd6b20);
}

.stamina-level-low {
  background: linear-gradient(90deg, #f56565, #e53e3e);
}

.stamina-level-critical {
  background: linear-gradient(90deg, #fc8181, #f56565);
}

.status-indicators {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: #f7fafc;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.indicator.active {
  border-color: #48bb78;
  background: #f0fff4;
}

.indicator-icon {
  font-size: 1.2rem;
}

.stamina-stats {
  background: #f8fafc;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 32px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.stat-row:last-child {
  margin-bottom: 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.stat-label {
  font-size: 0.85rem;
  color: #666;
}

.stat-value {
  font-size: 1rem;
  font-weight: 600;
  color: #2d3748;
}

.stamina-controls {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.control-section h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #2d3748;
  font-weight: 600;
}

.control-buttons, .preset-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-control, .btn-preset {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-control {
  flex: 1;
  min-width: 140px;
}

.btn-success {
  background: #48bb78;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #38a169;
}

.btn-warning {
  background: #ed8936;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #dd6b20;
}

.btn-primary {
  background: #4299e1;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3182ce;
}

.btn-preset {
  background: #edf2f7;
  color: #2d3748;
  border: 1px solid #e2e8f0;
}

.btn-preset:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #cbd5e0;
}

.btn-control:disabled, .btn-preset:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  min-width: 400px;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h4 {
  margin: 0;
  color: #2d3748;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #a0aec0;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: #2d3748;
}

.modal-body {
  padding: 24px;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2d3748;
}

.input-group input[type="number"] {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
}

.range-input {
  margin-top: 16px;
}

.stamina-slider {
  width: 100%;
  -webkit-appearance: none;
  height: 8px;
  border-radius: 4px;
  background: #e2e8f0;
  outline: none;
}

.stamina-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #4299e1;
  cursor: pointer;
}

.stamina-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #4299e1;
  cursor: pointer;
  border: none;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px 24px;
  border-top: 1px solid #e2e8f0;
}

.btn-cancel, .btn-confirm {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-cancel {
  background: #edf2f7;
  color: #2d3748;
}

.btn-cancel:hover {
  background: #e2e8f0;
}

.btn-confirm {
  background: #4299e1;
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  background: #3182ce;
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .control-buttons, .preset-buttons {
    flex-direction: column;
  }
  
  .btn-control {
    flex: none;
    min-width: 0;
  }
  
  .stat-row {
    flex-direction: column;
    gap: 16px;
  }
  
  .modal {
    margin: 16px;
    min-width: 0;
  }
}
</style>