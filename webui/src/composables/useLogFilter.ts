import { ref, computed, watch, unref, type MaybeRef } from 'vue'
import type { LogEntry } from '../types'

export interface LogFilter {
  query: string
  level: string
  startDate: string
  endDate: string
  useRegex: boolean
}

export interface SavedFilter extends LogFilter {
  name: string
  id: string
  createdAt: string
}

export function useLogFilter(logs: MaybeRef<LogEntry[]>) {
  // 当前筛选条件
  const currentFilter = ref<LogFilter>({
    query: '',
    level: '',
    startDate: '',
    endDate: '',
    useRegex: false
  })

  // 保存的筛选条件
  const savedFilters = ref<SavedFilter[]>([])

  // 筛选后的日志
  const filteredLogs = computed(() => {
    const logList = unref(logs)
    let result = [...logList]
    const filter = currentFilter.value

    // 按级别筛选
    if (filter.level) {
      result = result.filter(log => log.level === filter.level)
    }

    // 按时间范围筛选
    if (filter.startDate) {
      const startTime = new Date(filter.startDate).getTime()
      result = result.filter(log => new Date(log.timestamp).getTime() >= startTime)
    }

    if (filter.endDate) {
      const endTime = new Date(filter.endDate).getTime()
      result = result.filter(log => new Date(log.timestamp).getTime() <= endTime)
    }

    // 按内容搜索
    if (filter.query) {
      result = result.filter(log => {
        const searchTarget = `${log.message} ${JSON.stringify(log.meta || {})}`
        
        if (filter.useRegex) {
          try {
            const regex = new RegExp(filter.query, 'i')
            return regex.test(searchTarget)
          } catch (e) {
            // 如果正则表达式无效，回退到普通搜索
            console.warn('Invalid regex pattern:', filter.query)
            return searchTarget.toLowerCase().includes(filter.query.toLowerCase())
          }
        } else {
          return searchTarget.toLowerCase().includes(filter.query.toLowerCase())
        }
      })
    }

    return result
  })

  // 筛选统计信息
  const filterStats = computed(() => {
    const logList = unref(logs)
    return {
      total: logList.length,
      filtered: filteredLogs.value.length,
      hasActiveFilter: !!(
        currentFilter.value.query || 
        currentFilter.value.level || 
        currentFilter.value.startDate || 
        currentFilter.value.endDate
      )
    }
  })

  // 按级别统计
  const levelStats = computed(() => {
    const stats = {
      info: 0,
      warn: 0,
      error: 0,
      debug: 0
    }

    filteredLogs.value.forEach(log => {
      if (stats.hasOwnProperty(log.level)) {
        stats[log.level as keyof typeof stats]++
      }
    })

    return stats
  })

  // 更新筛选条件
  function updateFilter(newFilter: Partial<LogFilter>) {
    currentFilter.value = {
      ...currentFilter.value,
      ...newFilter
    }
  }

  // 清空筛选条件
  function clearFilter() {
    currentFilter.value = {
      query: '',
      level: '',
      startDate: '',
      endDate: '',
      useRegex: false
    }
  }

  // 保存筛选条件
  function saveFilter(name: string) {
    const savedFilter: SavedFilter = {
      ...currentFilter.value,
      name,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    }

    savedFilters.value.push(savedFilter)
    
    // 保存到 localStorage
    try {
      localStorage.setItem('logFilters', JSON.stringify(savedFilters.value))
    } catch (e) {
      console.warn('Failed to save filters to localStorage:', e)
    }

    return savedFilter
  }

  // 加载筛选条件
  function loadFilter(filterId: string) {
    const filter = savedFilters.value.find(f => f.id === filterId)
    if (filter) {
      currentFilter.value = {
        query: filter.query,
        level: filter.level,
        startDate: filter.startDate,
        endDate: filter.endDate,
        useRegex: filter.useRegex
      }
    }
  }

  // 删除保存的筛选条件
  function deleteSavedFilter(filterId: string) {
    const index = savedFilters.value.findIndex(f => f.id === filterId)
    if (index > -1) {
      savedFilters.value.splice(index, 1)
      
      // 更新 localStorage
      try {
        localStorage.setItem('logFilters', JSON.stringify(savedFilters.value))
      } catch (e) {
        console.warn('Failed to update filters in localStorage:', e)
      }
    }
  }

  // 从 localStorage 加载保存的筛选条件
  function loadSavedFilters() {
    try {
      const saved = localStorage.getItem('logFilters')
      if (saved) {
        savedFilters.value = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Failed to load filters from localStorage:', e)
      savedFilters.value = []
    }
  }

  // 快速筛选预设
  const quickFilters = [
    {
      name: '错误日志',
      filter: { level: 'error', query: '', startDate: '', endDate: '', useRegex: false }
    },
    {
      name: '警告日志',
      filter: { level: 'warn', query: '', startDate: '', endDate: '', useRegex: false }
    },
    {
      name: '最近1小时',
      filter: {
        level: '',
        query: '',
        startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16),
        endDate: new Date().toISOString().slice(0, 16),
        useRegex: false
      }
    },
    {
      name: 'API调用',
      filter: { level: '', query: 'api|request|response', startDate: '', endDate: '', useRegex: true }
    }
  ]

  // 应用快速筛选
  function applyQuickFilter(filterName: string) {
    const quickFilter = quickFilters.find(f => f.name === filterName)
    if (quickFilter) {
      currentFilter.value = { ...quickFilter.filter }
    }
  }

  // 导出筛选结果
  function exportFilteredLogs(format: 'json' | 'txt' | 'csv' = 'txt') {
    const logs = filteredLogs.value
    let content = ''
    let filename = `logs-filtered-${new Date().toISOString().slice(0, 10)}`
    let mimeType = 'text/plain'

    switch (format) {
      case 'json':
        content = JSON.stringify(logs, null, 2)
        filename += '.json'
        mimeType = 'application/json'
        break
        
      case 'csv':
        const headers = ['Timestamp', 'Level', 'Message', 'Meta']
        const rows = logs.map(log => [
          log.timestamp,
          log.level,
          log.message.replace(/"/g, '""'), // 转义CSV中的双引号
          JSON.stringify(log.meta || {}).replace(/"/g, '""')
        ])
        content = [headers, ...rows].map(row => 
          row.map(cell => `"${cell}"`).join(',')
        ).join('\n')
        filename += '.csv'
        mimeType = 'text/csv'
        break
        
      default: // txt
        content = logs.map(log => 
          `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${
            log.meta ? '\n  ' + JSON.stringify(log.meta, null, 2).split('\n').join('\n  ') : ''
          }`
        ).join('\n\n')
        filename += '.txt'
        break
    }

    // 下载文件
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // 初始化时加载保存的筛选条件
  loadSavedFilters()

  return {
    // 状态
    currentFilter,
    savedFilters,
    filteredLogs,
    filterStats,
    levelStats,
    quickFilters,

    // 方法
    updateFilter,
    clearFilter,
    saveFilter,
    loadFilter,
    deleteSavedFilter,
    applyQuickFilter,
    exportFilteredLogs
  }
}

// 高亮搜索结果的工具函数
export function highlightSearchTerm(text: string, searchTerm: string, useRegex: boolean = false): string {
  if (!searchTerm) return text

  try {
    const pattern = useRegex ? new RegExp(searchTerm, 'gi') : new RegExp(
      searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'
    )
    
    return text.replace(pattern, (match) => `<mark class="search-highlight">${match}</mark>`)
  } catch (e) {
    // 如果正则表达式无效，不进行高亮
    return text
  }
}

// 格式化筛选条件描述
export function formatFilterDescription(filter: LogFilter): string {
  const parts: string[] = []

  if (filter.query) {
    parts.push(`搜索: "${filter.query}"${filter.useRegex ? ' (正则)' : ''}`)
  }

  if (filter.level) {
    const levelNames = { info: '信息', warn: '警告', error: '错误', debug: '调试' }
    parts.push(`级别: ${levelNames[filter.level as keyof typeof levelNames] || filter.level}`)
  }

  if (filter.startDate) {
    parts.push(`开始: ${new Date(filter.startDate).toLocaleString()}`)
  }

  if (filter.endDate) {
    parts.push(`结束: ${new Date(filter.endDate).toLocaleString()}`)
  }

  return parts.length > 0 ? parts.join(', ') : '无筛选条件'
}