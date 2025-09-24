<template>
  <div class="card">
    <!-- 搜索和过滤组件 -->
    <LogSearch
      :total-count="props.logs.length"
      :filtered-count="filteredLogs.length"
      @filter="handleFilter"
      @save="handleSaveFilter"
    />
    
    <!-- 日期范围与批量控制 -->
    <div class="range-controls">
      <div class="range-fields">
        <div class="range-group">
          <label>开始</label>
          <input type="date" v-model="rangeStartDate" />
          <input type="time" v-model="rangeStartTime" />
        </div>
        <div class="range-group">
          <label>结束</label>
          <input type="date" v-model="rangeEndDate" />
          <input type="time" v-model="rangeEndTime" />
        </div>
        <div class="range-group limit-group">
          <label>每次加载</label>
          <select v-model.number="selectedLimit">
            <option 
              v-for="size in limitOptions" 
              :key="size" 
              :value="size"
            >
              {{ size }} 条
            </option>
          </select>
        </div>
        <div class="range-actions">
          <button @click="applyRange">查询</button>
          <button @click="loadMore" :disabled="!canLoadMore">加载更多</button>
          <button @click="resetRange" :disabled="!canResetRange">返回实时</button>
        </div>
      </div>
      <div class="range-meta" v-if="rangeSummary || paginationSummary">
        <span v-if="rangeSummary" class="range-meta-item">{{ rangeSummary }}</span>
        <span v-if="paginationSummary" class="range-meta-item">{{ paginationSummary }}</span>
      </div>
      <div v-if="rangeError" class="range-error">{{ rangeError }}</div>
    </div>

    <!-- 快速筛选和统计 -->
    <div class="quick-filters" v-if="quickFilters.length > 0">
      <div class="quick-filter-label">快速筛选:</div>
      <button
        v-for="quickFilter in quickFilters"
        :key="quickFilter.name"
        @click="applyQuickFilter(quickFilter.name)"
        class="quick-filter-btn"
      >
        {{ quickFilter.name }}
      </button>
      <div class="level-stats">
        <span class="stat-item">
          错误: <span class="stat-error">{{ levelStats.error }}</span>
        </span>
        <span class="stat-item">
          警告: <span class="stat-warn">{{ levelStats.warn }}</span>
        </span>
        <span class="stat-item">
          信息: <span class="stat-info">{{ levelStats.info }}</span>
        </span>
      </div>
    </div>

    <div class="controls">
      <button @click="refreshLogs">刷新日志</button>
      <button @click="downloadLogs">下载日志</button>
      <button @click="exportFilteredLogs" :disabled="filteredLogs.length === 0">
        导出筛选结果
      </button>
      <div class="auto-refresh">
        <input 
          type="checkbox" 
          id="auto-refresh" 
          v-model="autoRefresh"
        >
        <label for="auto-refresh">自动刷新</label>
        <div 
          class="refresh-indicator" 
          v-show="refreshing"
        ></div>
      </div>
    </div>
    <div class="log-container" ref="logContainer">
      <div v-if="props.logs.length === 0" class="log-entry log-info">
        等待日志数据...
      </div>
      <div v-else-if="filteredLogs.length === 0 && filterStats.hasActiveFilter" class="log-entry log-info">
        没有找到符合筛选条件的日志
      </div>
      <div v-else-if="filteredLogs.length === 0 && !filterStats.hasActiveFilter" class="log-entry log-warn">
        调试信息：原始日志数量 {{ props.logs.length }}，筛选后数量 {{ filteredLogs.length }}
      </div>
      <div 
        v-for="(log, index) in filteredLogs" 
        :key="getLogKey(log, index)"
        class="log-entry"
        :class="`log-${log.level}`"
      >
        <div>
          <span class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</span>
          <span class="log-level" :class="`log-level-${log.level}`">{{ log.level }}</span>
          <span 
            class="log-message" 
            v-html="highlightedMessage(log.message)"
          ></span>
        </div>
        <div 
          v-if="log.meta" 
          class="json-controls"
        >
          <div 
            class="json-preview"
            role="button"
            tabindex="0"
            @click="openJsonModal(log.meta)"
            @keydown.enter.prevent="openJsonModal(log.meta)"
            @keydown.space.prevent="openJsonModal(log.meta)"
          >
            <span class="json-preview-icon">🔍</span>
            <span class="json-preview-text">查看 JSON ({{ Object.keys(log.meta).length }} 字段)</span>
            <span class="json-preview-size">{{ getJsonSize(log.meta) }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- JSON 详细查看模态框 -->
    <JsonModal 
      v-model:visible="jsonModalVisible"
      :data="jsonModalData"
      @close="jsonModalData = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import type { LogEntry, LogQueryResponse, LogFetchParams } from '../types'
import { useFormatters } from '../composables/useFormatters'
import { useLogFilter, highlightSearchTerm, type LogFilter } from '../composables/useLogFilter'
import LogSearch from './LogSearch.vue'
import JsonModal from './JsonModal.vue'

const props = defineProps<{
  logs: LogEntry[]
  refreshing?: boolean
  pagination?: Pick<LogQueryResponse, 'total' | 'offset' | 'limit' | 'hasMore' | 'range'>
  initialLimit?: number
}>()

const emit = defineEmits<{
  refresh: [payload?: RefreshPayload]
}>()

interface RefreshPayload extends LogFetchParams {
  append?: boolean
  reset?: boolean
}

const autoRefresh = ref(true)
let suppressAutoRefresh = false
const logContainer = ref<HTMLElement>()
const { formatTimestamp } = useFormatters()

// JSON 模态框状态
const jsonModalVisible = ref(false)
const jsonModalData = ref<Record<string, any> | null>(null)

const selectedLimit = ref(props.initialLimit && props.initialLimit > 0 ? props.initialLimit : 500)
const rangeStartDate = ref('')
const rangeStartTime = ref('')
const rangeEndDate = ref('')
const rangeEndTime = ref('')
const rangeError = ref<string | null>(null)
const currentOffset = ref(0)
const activeRange = reactive<{ start?: string; end?: string }>({})

// 恢复完整的日志过滤功能
const logRef = computed(() => props.logs)
const {
  filteredLogs,
  filterStats,
  levelStats,
  quickFilters,
  updateFilter,
  applyQuickFilter,
  saveFilter,
  exportFilteredLogs: exportLogs,
  currentFilter
} = useLogFilter(logRef)

// 恢复高亮功能
const highlightedMessage = computed(() => (message: string) => {
  return highlightSearchTerm(message, currentFilter.value.query, currentFilter.value.useRegex)
})

const limitOptions = computed(() => {
  const base = new Set([100, 200, 500, 1000])
  if (props.initialLimit && props.initialLimit > 0) {
    base.add(props.initialLimit)
  }
  if (props.pagination?.limit && props.pagination.limit > 0) {
    base.add(props.pagination.limit)
  }
  base.add(selectedLimit.value)
  return Array.from(base).sort((a, b) => a - b)
})

const hasActiveRange = computed(() => Boolean(activeRange.start || activeRange.end))

const canLoadMore = computed(() => props.pagination?.hasMore ?? false)

const canResetRange = computed(() => hasActiveRange.value || currentOffset.value > 0 || !autoRefresh.value)

const rangeSummary = computed(() => {
  const range = props.pagination?.range
  if (!range || (!range.start && !range.end)) {
    return ''
  }

  const segments: string[] = []

  if (range.start) {
    segments.push(`开始 ${formatTimestamp(range.start)}`)
  }

  if (range.end) {
    segments.push(`结束 ${formatTimestamp(range.end)}`)
  }

  const sourceLabel = range.source === 'file' ? '历史日志文件' : 
                        range.source === 'hybrid' ? '混合数据源(文件+实时)' : '实时缓存'
  segments.push(`来源 ${sourceLabel}`)

  return segments.join(' · ')
})

const paginationSummary = computed(() => {
  if (!props.pagination) return ''

  const total = props.pagination.total
  const current = props.logs.length
  const hasMore = props.pagination.hasMore

  if (!total && !hasMore) {
    return ''
  }

  let summary = `已加载 ${current}`
  if (total) {
    summary += ` / ${total}`
  }
  summary += ' 条'

  if (hasMore) {
    summary += '，可继续加载'
  }

  return summary
})

// 处理筛选事件
function handleFilter(filter: LogFilter) {
  updateFilter(filter)
}

// 处理保存筛选条件
function handleSaveFilter(filter: LogFilter) {
  const name = prompt('请输入筛选条件名称:')
  if (name) {
    saveFilter(name)
  }
}

function refreshLogs() {
  rangeError.value = null
  const payload: RefreshPayload = {
    limit: selectedLimit.value,
    offset: 0
  }

  if (hasActiveRange.value) {
    payload.start = activeRange.start
    payload.end = activeRange.end
  }

  emit('refresh', payload)
}

function downloadLogs() {
  const logsText = props.logs.map(log => 
    `${formatTimestamp(log.timestamp)} [${log.level.toUpperCase()}] ${log.message}`
  ).join('\n')
  
  const blob = new Blob([logsText], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function exportFilteredLogs() {
  exportLogs('txt')
}

// 生成稳定的日志项key，用于持久化展开状态
function getLogKey(log: LogEntry, index: number): string {
  // 使用时间戳、日志级别、消息hash生成唯一且稳定的key
  // 这样即使日志列表顺序改变或部分刷新，展开状态也能正确保持
  const messageHash = log.message.replace(/\s+/g, '').slice(0, 30)
  const metaKeys = log.meta ? Object.keys(log.meta).join(',').slice(0, 20) : 'none'
  return `${log.timestamp}-${log.level}-${messageHash}-${metaKeys}`
}

// 打开JSON详细查看模态框
function openJsonModal(data: Record<string, any>) {
  jsonModalData.value = data
  jsonModalVisible.value = true
}

// 获取JSON大小
function getJsonSize(obj: any): string {
  const size = new Blob([JSON.stringify(obj)]).size
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB'
  return Math.round(size / (1024 * 1024)) + ' MB'
}

function applyRange() {
  rangeError.value = null

  if (!rangeStartDate.value && !rangeEndDate.value) {
    rangeError.value = '请选择开始与结束时间'
    return
  }

  const startIso = combineDateTime(rangeStartDate.value, rangeStartTime.value)
  const endIso = combineDateTime(rangeEndDate.value || rangeStartDate.value, rangeEndTime.value, true)

  if (!startIso || !endIso) {
    rangeError.value = '请选择有效的时间范围'
    return
  }

  if (new Date(startIso) > new Date(endIso)) {
    rangeError.value = '开始时间不能晚于结束时间'
    return
  }

  autoRefresh.value = false
  currentOffset.value = 0
  activeRange.start = startIso
  activeRange.end = endIso

  emit('refresh', {
    start: startIso,
    end: endIso,
    limit: selectedLimit.value,
    offset: 0
  })
}

function resetRange() {
  rangeError.value = null
  rangeStartDate.value = ''
  rangeStartTime.value = ''
  rangeEndDate.value = ''
  rangeEndTime.value = ''
  activeRange.start = undefined
  activeRange.end = undefined
  currentOffset.value = 0
  suppressAutoRefresh = true
  autoRefresh.value = true
  emit('refresh', {
    reset: true,
    limit: selectedLimit.value,
    offset: 0
  })
}

function loadMore() {
  rangeError.value = null

  const payload: RefreshPayload = {
    append: true,
    limit: selectedLimit.value,
    offset: props.logs.length
  }

  if (hasActiveRange.value) {
    payload.start = activeRange.start
    payload.end = activeRange.end
  }

  autoRefresh.value = false
  currentOffset.value = payload.offset ?? 0
  emit('refresh', payload)
}

function combineDateTime(date: string, time: string, endOfDay = false): string | null {
  if (!date) return null
  const safeTime = time && time.trim() ? time : (endOfDay ? '23:59:59' : '00:00:00')
  const composed = new Date(`${date}T${safeTime}`)
  if (Number.isNaN(composed.getTime())) {
    return null
  }
  return composed.toISOString()
}

function toDateInputValue(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimeInputValue(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

watch(() => props.pagination?.offset, (newOffset) => {
  currentOffset.value = typeof newOffset === 'number' ? newOffset : 0
})

watch(() => props.pagination?.limit, (newLimit) => {
  if (typeof newLimit === 'number' && newLimit > 0) {
    selectedLimit.value = newLimit
  }
}, { immediate: true })

watch(() => props.initialLimit, (newLimit) => {
  if (typeof newLimit === 'number' && newLimit > 0) {
    selectedLimit.value = newLimit
  }
}, { immediate: true })

watch(() => props.pagination?.range, (newRange) => {
  if (newRange?.start || newRange?.end) {
    rangeStartDate.value = toDateInputValue(newRange.start) || rangeStartDate.value
    rangeStartTime.value = toTimeInputValue(newRange.start) || rangeStartTime.value
    rangeEndDate.value = toDateInputValue(newRange.end) || rangeEndDate.value
    rangeEndTime.value = toTimeInputValue(newRange.end) || rangeEndTime.value
  } else {
    rangeStartDate.value = ''
    rangeStartTime.value = ''
    rangeEndDate.value = ''
    rangeEndTime.value = ''
  }

  activeRange.start = newRange?.start
  activeRange.end = newRange?.end
}, { immediate: true })

watch(autoRefresh, (value, previous) => {
  if (value && !previous) {
    if (suppressAutoRefresh) {
      suppressAutoRefresh = false
      return
    }
    rangeError.value = null
    rangeStartDate.value = ''
    rangeStartTime.value = ''
    rangeEndDate.value = ''
    rangeEndTime.value = ''
    activeRange.start = undefined
    activeRange.end = undefined
    currentOffset.value = 0

    emit('refresh', {
      reset: true,
      limit: selectedLimit.value,
      offset: 0
    })
  }
})

defineExpose({
  autoRefresh
})
</script>

<style scoped>
.log-container {
  height: 500px;
  overflow-y: auto;
  background: #0d1117;
  color: #f0f6fc;
  padding: 1rem;
  border-radius: 8px;
  font-family: 'SFMono-Regular', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  border: 1px solid #21262d;
}

.range-controls {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.range-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: flex-end;
}

.range-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #8b949e;
  font-size: 0.8rem;
}

.range-group input,
.range-group select {
  background: #0d1117;
  border: 1px solid #30363d;
  color: #f0f6fc;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.limit-group {
  min-width: 140px;
}

.range-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.range-actions button {
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
}

.range-meta {
  color: #8b949e;
  font-size: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.range-meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.range-error {
  color: #f85149;
  font-size: 0.8rem;
}

.log-entry {
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  border-left: 4px solid transparent;
  padding-left: 1rem;
  border-radius: 0 4px 4px 0;
  background: rgba(56, 139, 253, 0.05);
  transition: background 0.2s;
}

.log-entry:hover {
  background: rgba(56, 139, 253, 0.1);
}

.log-info { 
  border-left-color: #58a6ff;
  background: rgba(88, 166, 255, 0.05);
}

.log-warn { 
  border-left-color: #f85149;
  background: rgba(248, 81, 73, 0.05);
}

.log-error { 
  border-left-color: #da3633;
  background: rgba(218, 54, 51, 0.1);
}

.log-debug { 
  border-left-color: #8b949e;
  background: rgba(139, 148, 158, 0.05);
}

.log-timestamp {
  color: #7d8590;
  font-size: 0.8125rem;
  margin-right: 0.75rem;
}

.log-level {
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  margin-right: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.log-level-info {
  background: rgba(88, 166, 255, 0.2);
  color: #58a6ff;
}

.log-level-warn {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}

.log-level-error {
  background: rgba(218, 54, 51, 0.2);
  color: #da3633;
}

.log-level-debug {
  background: rgba(139, 148, 158, 0.2);
  color: #8b949e;
}

.log-message {
  color: #f0f6fc;
  word-wrap: break-word;
}

:deep(.json-key) { color: #79c0ff; }
:deep(.json-string) { color: #a5d6ff; }
:deep(.json-number) { color: #79c0ff; }
:deep(.json-boolean) { color: #ff7b72; }
:deep(.json-null) { color: #8b949e; }
:deep(.json-punctuation) { color: #f0f6fc; }

/* 搜索高亮样式 */
:deep(.search-highlight) {
  background: rgba(255, 223, 0, 0.3);
  color: #ffd700;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-weight: 600;
}

/* 快速筛选样式 */
.quick-filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  flex-wrap: wrap;
}

.quick-filter-label {
  color: #7d8590;
  font-size: 0.875rem;
  font-weight: 500;
}

.quick-filter-btn {
  padding: 0.375rem 0.75rem;
  background: #21262d;
  color: #f0f6fc;
  border: 1px solid #30363d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  transition: all 0.2s;
}

.quick-filter-btn:hover {
  background: #30363d;
  border-color: #58a6ff;
  color: #58a6ff;
}

.level-stats {
  display: flex;
  gap: 1rem;
  margin-left: auto;
  flex-wrap: wrap;
}

.stat-item {
  font-size: 0.8125rem;
  color: #7d8590;
}

.stat-error { 
  color: #da3633;
  font-weight: 600;
}

.stat-warn { 
  color: #f85149;
  font-weight: 600;
}

.stat-info { 
  color: #58a6ff;
  font-weight: 600;
}

/* JSON 控制组件样式 */
.json-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.json-preview {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #f0f6fc;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 0.375rem 0.75rem;
  transition: all 0.2s;
  min-width: 0;
}

.json-preview-icon {
  font-size: 0.875rem;
}

.json-preview:hover,
.json-preview:focus {
  color: #58a6ff;
  border-color: #58a6ff;
  background: #30363d;
  outline: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.json-preview-text {
  font-weight: 500;
}

.json-preview-size {
  font-size: 0.75rem;
  color: #8b949e;
  padding: 0.125rem 0.375rem;
  background: rgba(139, 148, 158, 0.1);
  border-radius: 4px;
  font-family: monospace;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .quick-filters {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .level-stats {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
  
  .json-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
}
</style>
