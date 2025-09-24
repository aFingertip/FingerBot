import { EnhancedQQChatAgentServer } from '../../src/core/enhanced-qq-agent-server'
import type { StoreMemoryTaskPayload } from '../../src/core/task-queue'

const appendThinkingLog = jest.fn().mockResolvedValue(undefined)

jest.mock('../../src/core/ws-server', () => {
  return {
    WSServer: jest.fn().mockImplementation(() => ({
      onMessage: jest.fn(),
      onEvent: jest.fn(),
      sendGroupMessage: jest.fn().mockResolvedValue(true),
      sendPrivateMessage: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true),
      getConnectionInfo: jest.fn().mockReturnValue({}),
      close: jest.fn().mockResolvedValue(undefined)
    }))
  }
})

jest.mock('../../src/utils/thinking-logger', () => ({
  appendThinkingLog: (...args: any[]) => appendThinkingLog(...args)
}))

jest.mock('../../src/ai/gemini-client', () => ({
  GeminiClient: jest.fn().mockImplementation(() => ({
    testConnection: jest.fn().mockResolvedValue(true)
  }))
}))

describe('EnhancedQQChatAgentServer thinking log', () => {
  afterEach(() => {
    appendThinkingLog.mockClear()
  })

  test('should persist thinking payload through task queue', async () => {
    const server = new EnhancedQQChatAgentServer()
    await server.initialize()

    const payload: StoreMemoryTaskPayload = {
      memoryType: 'thinking',
      content: '模型的内部推理',
      metadata: {
        contextId: 'ctx-123',
        associatedMessageIds: ['1', '2'],
        createdAt: new Date().toISOString(),
        finalReplies: ['回复A', '回复B']
      }
    }

    await ((server as any).taskQueue.enqueue('store_memory', payload))

    expect(appendThinkingLog).toHaveBeenCalledTimes(1)
    expect(appendThinkingLog).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryType: 'thinking',
        content: '模型的内部推理',
        metadata: expect.objectContaining({
          contextId: 'ctx-123',
          finalReplies: ['回复A', '回复B']
        }),
        recordedAt: expect.any(String)
      })
    )

    await server.shutdown()
  })
})
