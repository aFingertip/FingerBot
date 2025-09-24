<template>
  <div class="search-container">
    <div class="search-row">
      <div class="search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索日志内容..."
          class="search-input"
          @input="debouncedEmitFilter"
          @keyup.escape="clearSearch"
        />
        <button 
          v-if="searchQuery"
          @click="clearSearch"
          class="clear-search-btn"
          title="清空搜索"
        >
          ✕
        </button>
      </div>
      
      <select v-model="selectedLevel" @change="emitFilter" class="level-filter">
        <option value="">全部级别</option>
        <option value="info">信息</option>
        <option value="warn">警告</option>
        <option value="error">错误</option>
        <option value="debug">调试</option>
      </select>
      
      <button 
        @click="toggleAdvanced" 
        class="advanced-toggle"
        :class="{ active: showAdvanced }"
      >
        高级筛选 {{ showAdvanced ? '▲' : '▼' }}
      </button>
    </div>

    <div v-if="showAdvanced" class="advanced-filters">
      <div class="filter-row">
        <div class="date-filter">
          <label for="start-date">开始时间:</label>
          <input
            id="start-date"
            v-model="startDate"
            type="datetime-local"
            @change="emitFilter"
            class="date-input"
          />
        </div>
        
        <div class="date-filter">
          <label for="end-date">结束时间:</label>
          <input
            id="end-date"
            v-model="endDate"
            type="datetime-local"
            @change="emitFilter"
            class="date-input"
          />
        </div>
        
        <div class="regex-filter">
          <label for="use-regex">
            <input
              id="use-regex"
              v-model="useRegex"
              type="checkbox"
              @change="emitFilter"
            />
            正则表达式
          </label>
        </div>
      </div>

      <div class="filter-actions">
        <button @click="clearAllFilters" class="clear-filters-btn">
          清空所有筛选
        </button>
        <button @click="saveFilter" class="save-filter-btn">
          保存筛选条件
        </button>
      </div>
    </div>

    <div class="search-stats" v-if="totalCount !== undefined">
      <span class="results-count">
        显示 {{ filteredCount }} / {{ totalCount }} 条日志
      </span>
      <span v-if="searchQuery" class="search-terms">
        搜索: "{{ searchQuery }}"
      </span>
      <span v-if="selectedLevel" class="filter-terms">
        级别: {{ levelLabels[selectedLevel] }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LogFilter } from '../composables/useLogFilter'

const props = defineProps<{
  totalCount?: number
  filteredCount?: number
}>()

const emit = defineEmits<{
  filter: [filter: LogFilter]
  save: [filter: LogFilter]
}>()

// 搜索状态
const searchQuery = ref('')
const selectedLevel = ref('')
const startDate = ref('')
const endDate = ref('')
const useRegex = ref(false)
const showAdvanced = ref(false)

// 级别标签映射
const levelLabels: Record<string, string> = {
  info: '信息',
  warn: '警告', 
  error: '错误',
  debug: '调试'
}

// 防抖定时器
let debounceTimer: number | null = null

// 当前筛选条件
const currentFilter = computed((): LogFilter => ({
  query: searchQuery.value,
  level: selectedLevel.value,
  startDate: startDate.value,
  endDate: endDate.value,
  useRegex: useRegex.value
}))

// 发送筛选事件
function emitFilter() {
  emit('filter', currentFilter.value)
}

// 防抖搜索
function debouncedEmitFilter() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    emitFilter()
  }, 300) as any
}

// 清空搜索
function clearSearch() {
  searchQuery.value = ''
  emitFilter()
}

// 清空所有筛选
function clearAllFilters() {
  searchQuery.value = ''
  selectedLevel.value = ''
  startDate.value = ''
  endDate.value = ''
  useRegex.value = false
  emitFilter()
}

// 保存筛选条件
function saveFilter() {
  emit('save', currentFilter.value)
}

// 切换高级筛选
function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
}

// 监听筛选条件变化
watch(currentFilter, (newFilter) => {
  // 可以在这里添加筛选条件验证逻辑
  if (newFilter.startDate && newFilter.endDate) {
    const start = new Date(newFilter.startDate)
    const end = new Date(newFilter.endDate)
    if (start > end) {
      console.warn('开始时间不能晚于结束时间')
    }
  }
}, { deep: true })

// 暴露方法供父组件调用
defineExpose({
  clearAllFilters,
  getCurrentFilter: () => currentFilter.value
})
</script>

<style scoped>
.search-container {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.search-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 250px;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  background: #0d1117;
  color: #f0f6fc;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 0.875rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
}

.clear-search-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #7d8590;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 3px;
  font-size: 0.75rem;
  transition: color 0.2s, background-color 0.2s;
}

.clear-search-btn:hover {
  color: #f0f6fc;
  background: rgba(248, 81, 73, 0.1);
}

.level-filter {
  padding: 0.5rem 0.75rem;
  background: #0d1117;
  color: #f0f6fc;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  min-width: 120px;
}

.level-filter:focus {
  outline: none;
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
}

.advanced-toggle {
  padding: 0.5rem 0.75rem;
  background: #21262d;
  color: #f0f6fc;
  border: 1px solid #30363d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s, border-color 0.2s;
}

.advanced-toggle:hover {
  background: #30363d;
  border-color: #58a6ff;
}

.advanced-toggle.active {
  background: #58a6ff;
  color: #fff;
  border-color: #58a6ff;
}

.advanced-filters {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #21262d;
}

.filter-row {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.date-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.date-filter label {
  color: #7d8590;
  font-size: 0.875rem;
  white-space: nowrap;
}

.date-input {
  padding: 0.5rem;
  background: #0d1117;
  color: #f0f6fc;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 0.875rem;
}

.date-input:focus {
  outline: none;
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
}

.regex-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.regex-filter label {
  color: #7d8590;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.regex-filter input[type="checkbox"] {
  accent-color: #58a6ff;
}

.filter-actions {
  display: flex;
  gap: 0.75rem;
}

.clear-filters-btn,
.save-filter-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-filters-btn {
  background: #0d1117;
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.3);
}

.clear-filters-btn:hover {
  background: rgba(248, 81, 73, 0.1);
  border-color: #f85149;
}

.save-filter-btn {
  background: #0d1117;
  color: #58a6ff;
  border-color: rgba(88, 166, 255, 0.3);
}

.save-filter-btn:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
}

.search-stats {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #21262d;
  font-size: 0.8125rem;
  flex-wrap: wrap;
}

.results-count {
  color: #7d8590;
}

.search-terms {
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  border: 1px solid rgba(88, 166, 255, 0.3);
}

.filter-terms {
  color: #a5d6ff;
  background: rgba(165, 214, 255, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  border: 1px solid rgba(165, 214, 255, 0.3);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .search-row {
    flex-direction: column;
  }
  
  .search-input-wrapper {
    min-width: unset;
  }
  
  .filter-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  
  .date-filter {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .filter-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .search-stats {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>