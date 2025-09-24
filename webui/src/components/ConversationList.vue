<template>
  <div class="card">
    <h3>对话列表</h3>
    <div class="conversation-list">
      <div v-if="conversations.length === 0" class="conversation-item">
        <div class="conversation-header">
          <span class="user-info">暂无对话历史</span>
        </div>
      </div>
      <div 
        v-for="conv in conversations" 
        :key="getConversationKey(conv)"
        class="conversation-item"
        :class="{ active: isSelected(conv) }"
        @click="showDetail(conv)"
      >
        <div class="conversation-header">
          <span class="user-info">
            {{ conv.groupId ? `群聊 ${conv.groupId}` : '私聊' }} - {{ getDisplayName(conv) }}
          </span>
          <span class="timestamp">{{ formatTimestamp(getLastMessage(conv).timestamp) }}</span>
        </div>
        <div class="message-preview">{{ getPreviewText(conv) }}</div>
      </div>
    </div>
    
    <div v-if="selectedConversation" class="message-detail">
      <h4>对话详情</h4>
      <div class="message-pairs">
        <div 
          v-for="(pair, index) in getMessagePairs(selectedConversation)" 
          :key="index"
          class="message-pair"
        >
          <div class="user-message">
            <strong>{{ pair.user.userName || `用户${pair.user.userId}` }}:</strong> 
            {{ pair.user.content }}<br>
            <small>{{ formatTimestamp(pair.user.timestamp) }}</small>
          </div>
          <div v-if="pair.bot" class="bot-message">
            <strong>机器人:</strong> 
            {{ pair.bot.content }}<br>
            <small>{{ formatTimestamp(pair.bot.timestamp) }}</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Conversation, Message } from '../types'
import { useFormatters } from '../composables/useFormatters'

const props = defineProps<{
  conversations: Conversation[]
}>()

const selectedConversation = ref<Conversation | null>(null)
const { formatTimestamp, truncateText } = useFormatters()
const conversations = computed(() => props.conversations)

watch(
  () => props.conversations,
  (newConversations) => {
    if (!newConversations || newConversations.length === 0) {
      selectedConversation.value = null
      return
    }

    // 如果当前选中的对话已经不存在或尚未选择，则默认选择最新一条
    if (!selectedConversation.value) {
      selectedConversation.value = newConversations[0]
      return
    }

    const currentKey = getConversationKey(selectedConversation.value)
    const updated = newConversations.find(conv => getConversationKey(conv) === currentKey)
    selectedConversation.value = updated ?? newConversations[0]
  },
  { immediate: true }
)

function getDisplayName(conv: Conversation): string {
  const firstUserMessage = conv.messages.find(msg => msg.userId !== 'assistant')
  return firstUserMessage?.userName || `用户${conv.userId}`
}

function getLastMessage(conv: Conversation): Message {
  return conv.messages[conv.messages.length - 1]
}

function getPreviewText(conv: Conversation): string {
  const lastMessage = getLastMessage(conv)
  let previewMessage = lastMessage
  
  // 如果最后一条是AI回复，找到倒数第二条用户消息
  if (lastMessage.userId === 'assistant') {
    for (let i = conv.messages.length - 2; i >= 0; i--) {
      if (conv.messages[i].userId !== 'assistant') {
        previewMessage = conv.messages[i]
        break
      }
    }
  }
  
  return truncateText(previewMessage.content, 100)
}

function showDetail(conv: Conversation) {
  selectedConversation.value = conv
}

function getConversationKey(conv: Conversation): string {
  return `${conv.userId}-${conv.groupId || 'private'}`
}

function isSelected(conv: Conversation): boolean {
  if (!selectedConversation.value) return false
  return getConversationKey(conv) === getConversationKey(selectedConversation.value)
}

interface MessagePair {
  user: Message
  bot?: Message
}

function getMessagePairs(conv: Conversation): MessagePair[] {
  const pairs: MessagePair[] = []
  let currentPair: MessagePair | null = null
  
  conv.messages.forEach(msg => {
    if (msg.userId === 'assistant') {
      // AI回复消息
      if (currentPair) {
        currentPair.bot = msg
        pairs.push(currentPair)
        currentPair = null
      }
    } else {
      // 用户消息
      if (currentPair) {
        pairs.push(currentPair)
      }
      currentPair = { user: msg }
    }
  })
  
  // 添加最后一个未完成的对话对
  if (currentPair) {
    pairs.push(currentPair)
  }
  
  return pairs
}
</script>

<style scoped>
.conversation-list {
  max-height: 400px;
  overflow-y: auto;
}

.conversation-item {
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background 0.2s;
}

.conversation-item:hover,
.conversation-item.active {
  background: #f8f9fa;
}

.conversation-item.active {
  border-left: 3px solid #3b82f6;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.user-info {
  font-weight: 600;
  color: #2c3e50;
}

.timestamp {
  color: #7f8c8d;
  font-size: 0.875rem;
}

.message-preview {
  color: #666;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-detail {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.message-detail h4 {
  margin-bottom: 1rem;
  color: #2c3e50;
}

.message-pairs {
  max-height: 400px;
  overflow-y: auto;
}

.message-pair {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #dee2e6;
}

.message-pair:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.user-message, .bot-message {
  padding: 0.75rem;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.user-message {
  background: #e3f2fd;
  margin-left: 2rem;
}

.bot-message {
  background: #f3e5f5;
  margin-right: 2rem;
}
</style>
