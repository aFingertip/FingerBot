<template>
  <div class="header">
    <h1>🤖 智能QQ机器人 - 监控面板</h1>
    <div class="status-bar">
      <div class="status-item">
        <div 
          class="status-dot" 
          :class="status.connected ? 'status-online' : 'status-offline'"
        ></div>
        WebSocket: <span>{{ status.connected ? '已连接' : '未连接' }}</span>
      </div>
      <div class="status-item">
        <div 
          class="status-dot" 
          :class="status.ai_ready ? 'status-online' : 'status-offline'"
        ></div>
        AI服务: <span>{{ status.ai_ready ? '正常' : '异常' }}</span>
      </div>
      <div class="status-item stamina-status" v-if="staminaStatus">
        <div class="stamina-indicator">
          <span class="stamina-icon">{{ getStaminaIcon(staminaStatus.level) }}</span>
          <span class="stamina-text">
            体力: {{ staminaStatus.current }}/{{ staminaStatus.max }} ({{ staminaStatus.percentage }}%)
          </span>
          <div class="stamina-mini-bar">
            <div 
              class="stamina-mini-fill"
              :class="getStaminaBarClass(staminaStatus.level)"
              :style="{ width: `${staminaStatus.percentage}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { SystemStatus } from '../types'

interface StaminaStatus {
  current: number
  max: number
  percentage: number
  level: 'high' | 'medium' | 'low' | 'critical'
  canReply: boolean
  restMode: boolean
}

defineProps<{
  status: SystemStatus
}>()

const staminaStatus = ref<StaminaStatus | null>(null)
const staminaRefreshTimer = ref<number>()

const getStaminaIcon = (level: string) => {
  const icons = {
    high: '💚',
    medium: '💛', 
    low: '🧡',
    critical: '❤️'
  }
  return icons[level as keyof typeof icons] || '⚪'
}

const getStaminaBarClass = (level: string) => {
  return `stamina-mini-level-${level}`
}

const fetchStaminaStatus = async () => {
  try {
    const response = await fetch('/api/stamina/status')
    const data = await response.json()
    
    if (data.success && data.status) {
      staminaStatus.value = data.status
    }
  } catch (error) {
    // Silently fail - stamina is optional feature
    console.debug('Failed to fetch stamina status:', error)
  }
}

const startStaminaRefresh = () => {
  staminaRefreshTimer.value = window.setInterval(() => {
    fetchStaminaStatus()
  }, 10000) // Every 10 seconds
}

const stopStaminaRefresh = () => {
  if (staminaRefreshTimer.value) {
    clearInterval(staminaRefreshTimer.value)
  }
}

onMounted(() => {
  fetchStaminaStatus()
  startStaminaRefresh()
})

onUnmounted(() => {
  stopStaminaRefresh()
})
</script>

<style scoped>
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.status-bar {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-online {
  background-color: #48bb78;
  box-shadow: 0 0 6px rgba(72, 187, 120, 0.4);
}

.status-offline {
  background-color: #f56565;
  box-shadow: 0 0 6px rgba(245, 101, 101, 0.4);
}

.stamina-status {
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 1.5rem;
  margin-left: 1rem;
}

.stamina-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stamina-icon {
  font-size: 1.1rem;
}

.stamina-text {
  font-size: 0.85rem;
  white-space: nowrap;
}

.stamina-mini-bar {
  width: 60px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.stamina-mini-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.stamina-mini-level-high {
  background: #48bb78;
}

.stamina-mini-level-medium {
  background: #ed8936;
}

.stamina-mini-level-low {
  background: #f56565;
}

.stamina-mini-level-critical {
  background: #fc8181;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  
  .header h1 {
    font-size: 1.25rem;
  }
  
  .status-bar {
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .status-item {
    font-size: 0.8rem;
  }
  
  .stamina-status {
    border-left: none;
    padding-left: 0;
    margin-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 0.5rem;
  }
  
  .stamina-text {
    font-size: 0.8rem;
  }
  
  .stamina-mini-bar {
    width: 40px;
  }
}
</style>