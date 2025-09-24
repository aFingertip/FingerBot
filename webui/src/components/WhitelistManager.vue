<template>
  <div class="card">
    <h3>白名单管理</h3>
    <div style="margin-bottom: 1rem;">
      <span>状态: </span>
      <span>{{ whitelist.enabled ? `已启用 (${whitelist.groupCount}个群组)` : '未启用' }}</span>
    </div>
    <div class="controls">
      <input 
        type="text" 
        v-model="newGroupId"
        placeholder="输入群号" 
        @keyup.enter="addGroup"
      >
      <button @click="addGroup" :disabled="!newGroupId.trim() || loading">
        添加群组
      </button>
      <button @click="refresh" :disabled="loading">
        刷新
      </button>
    </div>
    <div class="whitelist-groups">
      <div v-if="whitelist.groups.length === 0">
        <p>暂无白名单群组</p>
      </div>
      <div 
        v-for="group in whitelist.groups" 
        :key="group"
        class="group-item"
      >
        <span>群组: {{ group }}</span>
        <button 
          @click="removeGroup(group)" 
          :disabled="loading"
          class="remove-btn"
        >
          移除
        </button>
      </div>
    </div>
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { WhitelistStatus } from '../types'

const props = defineProps<{
  whitelist: WhitelistStatus
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  addGroup: [groupId: string]
  removeGroup: [groupId: string]
  refresh: []
}>()

const newGroupId = ref('')

function addGroup() {
  const groupId = newGroupId.value.trim()
  if (!groupId) return
  
  emit('addGroup', groupId)
  newGroupId.value = ''
}

function removeGroup(groupId: string) {
  emit('removeGroup', groupId)
}

function refresh() {
  emit('refresh')
}
</script>

<style scoped>
.whitelist-groups {
  margin-top: 1rem;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border: 1px solid #ddd;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  background: #f9f9f9;
}

.remove-btn {
  background: #e74c3c;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
}

.remove-btn:hover {
  background: #c0392b;
}

.error-message {
  margin-top: 1rem;
  padding: 0.5rem;
  background: #f8d7da;
  color: #721c24;
  border-radius: 4px;
  border: 1px solid #f5c6cb;
}
</style>