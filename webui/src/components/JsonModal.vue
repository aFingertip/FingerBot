<template>
  <Teleport to="body">
    <div v-if="visible" class="json-modal-overlay" @click="handleOverlayClick">
      <div class="json-modal" @click.stop>
        <div class="json-modal-header">
          <h3 class="json-modal-title">JSON 详细信息</h3>
          <div class="json-modal-actions">
            <button @click="copyToClipboard" class="json-action-btn" title="复制到剪贴板">
              📋
            </button>
            <button @click="downloadJson" class="json-action-btn" title="下载JSON文件">
              💾
            </button>
            <button @click="close" class="json-close-btn" title="关闭">
              ✕
            </button>
          </div>
        </div>
        <div class="json-modal-content">
          <div class="json-tabs">
            <button 
              :class="['json-tab', { active: activeTab === 'formatted' }]"
              @click="activeTab = 'formatted'"
            >
              格式化视图
            </button>
            <button 
              :class="['json-tab', { active: activeTab === 'raw' }]"
              @click="activeTab = 'raw'"
            >
              原始JSON
            </button>
          </div>
          
          <div class="json-display-container">
            <div v-if="activeTab === 'formatted'" 
                 class="json-formatted" 
                 v-html="formattedJson"
            ></div>
            <div v-else class="json-raw">
              <pre><code>{{ rawJson }}</code></pre>
            </div>
          </div>
        </div>
        
        <!-- 统计信息 -->
        <div class="json-stats">
          <span class="stat-item">字段数量: {{ fieldCount }}</span>
          <span class="stat-item">JSON 大小: {{ jsonSize }}</span>
          <span class="stat-item">嵌套深度: {{ maxDepth }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFormatters } from '../composables/useFormatters'

interface Props {
  visible: boolean
  data: Record<string, any> | null
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'JSON 数据'
})

const emit = defineEmits<{
  close: []
  'update:visible': [value: boolean]
}>()

const { formatJson } = useFormatters()
const activeTab = ref<'formatted' | 'raw'>('formatted')

const formattedJson = computed(() => {
  if (!props.data) return ''
  return formatJson(props.data)
})

const rawJson = computed(() => {
  if (!props.data) return ''
  return JSON.stringify(props.data, null, 2)
})

const fieldCount = computed(() => {
  if (!props.data) return 0
  return countFields(props.data)
})

const jsonSize = computed(() => {
  if (!props.data) return '0 B'
  const size = new Blob([rawJson.value]).size
  return formatFileSize(size)
})

const maxDepth = computed(() => {
  if (!props.data) return 0
  return getMaxDepth(props.data)
})

function countFields(obj: any): number {
  let count = 0
  for (const key in obj) {
    count++
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count += countFields(obj[key])
    }
  }
  return count
}

function getMaxDepth(obj: any, depth = 1): number {
  if (typeof obj !== 'object' || obj === null) return depth
  
  let maxChildDepth = depth
  for (const key in obj) {
    const childDepth = getMaxDepth(obj[key], depth + 1)
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth
    }
  }
  return maxChildDepth
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return Math.round(bytes / (1024 * 1024)) + ' MB'
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(rawJson.value)
    // 可以添加一个简单的提示
    console.log('JSON已复制到剪贴板')
  } catch (err) {
    console.error('复制失败:', err)
  }
}

function downloadJson() {
  if (!props.data) return
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `json-data-${timestamp}.json`
  
  const blob = new Blob([rawJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function handleOverlayClick() {
  close()
}

function close() {
  emit('update:visible', false)
  emit('close')
}

// 键盘事件处理
watch(() => props.visible, (visible) => {
  if (visible) {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', handleEscape)
    
    // 清理事件监听器
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }
})
</script>

<style scoped>
.json-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.json-modal {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 90vw;
  max-height: 90vh;
  width: 800px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.json-modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #21262d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #161b22;
}

.json-modal-title {
  margin: 0;
  color: #f0f6fc;
  font-size: 1.125rem;
  font-weight: 600;
}

.json-modal-actions {
  display: flex;
  gap: 0.5rem;
}

.json-action-btn, .json-close-btn {
  background: transparent;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.json-action-btn:hover {
  background: #21262d;
  border-color: #58a6ff;
}

.json-close-btn {
  background: #da3633;
  border-color: #da3633;
  color: white;
  font-weight: bold;
}

.json-close-btn:hover {
  background: #f85149;
  border-color: #f85149;
}

.json-modal-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.json-tabs {
  display: flex;
  border-bottom: 1px solid #21262d;
  background: #161b22;
}

.json-tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  color: #7d8590;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.json-tab:hover {
  color: #f0f6fc;
  background: rgba(240, 246, 252, 0.05);
}

.json-tab.active {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
}

.json-display-container {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.json-formatted {
  font-family: 'SFMono-Regular', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #f0f6fc;
  white-space: pre-wrap;
  word-break: break-word;
}

.json-raw {
  font-family: 'SFMono-Regular', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}

.json-raw pre {
  margin: 0;
  padding: 0;
  background: transparent;
  border: none;
}

.json-raw code {
  color: #f0f6fc;
  background: transparent;
  border: none;
  padding: 0;
  font-size: inherit;
}

.json-stats {
  padding: 0.75rem 1.5rem;
  background: #161b22;
  border-top: 1px solid #21262d;
  display: flex;
  gap: 1.5rem;
  font-size: 0.8125rem;
  color: #7d8590;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* JSON 语法高亮 */
:deep(.json-key) { color: #79c0ff; font-weight: 600; }
:deep(.json-string) { color: #a5d6ff; }
:deep(.json-number) { color: #79c0ff; }
:deep(.json-boolean) { color: #ff7b72; font-weight: 600; }
:deep(.json-null) { color: #8b949e; font-style: italic; }
:deep(.json-punctuation) { color: #f0f6fc; }

/* 响应式设计 */
@media (max-width: 768px) {
  .json-modal {
    width: 95vw;
    max-height: 95vh;
    margin: 0.5rem;
  }
  
  .json-modal-header {
    padding: 0.75rem 1rem;
  }
  
  .json-modal-title {
    font-size: 1rem;
  }
  
  .json-stats {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .json-tabs {
    overflow-x: auto;
  }
}
</style>