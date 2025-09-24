import { BatchMessageProcessor } from '../../src/core/batch-message-processor'
import { QueuedMessage } from '../../src/core/message-queue-types'
import { ChatResponse } from '../../src/core/types'

const generateResponseMock = jest.fn<Promise<ChatResponse>, [string, string | undefined]>()

jest.mock('../../src/ai/gemini-client', () => {
  return {
    GeminiClient: jest.fn().mockImplementation(() => ({
      generateResponse: (...args: [string, string | undefined]) => generateResponseMock(...args)
    }))
  }
})

describe('BatchMessageProcessor context generation', () => {
  beforeEach(() => {
    generateResponseMock.mockResolvedValue({
      content: 'ok',
      replies: ['ok'],
      timestamp: new Date(),
      tokensUsed: 1
    })
  })

  function createMessage(index: number): QueuedMessage {
    return {
      userId: `user-${index % 3}`,
      userName: `User ${index}`,
      groupId: 'group-1',
      content: `message-${index}`,
      timestamp: Math.floor(Date.now() / 1000) + index,
      messageId: `${index}`,
      isHighPriority: index % 10 === 0,
      contextId: 'group-1',
      receivedAt: Date.now() + index
    }
  }

  test('should embed queue summary and recent history with max 50 items', async () => {
    const processor = new BatchMessageProcessor()

    const messages: QueuedMessage[] = Array.from({ length: 60 }, (_, i) => createMessage(i))
    const queueContext = JSON.stringify(messages.map(msg => ({
      content: msg.content,
      senderId: msg.userId,
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
      role: 'user'
    })))

    await processor.processMessages(messages, queueContext)

    expect(generateResponseMock).toHaveBeenCalledTimes(1)
    const [, context] = generateResponseMock.mock.calls[0]
    expect(context).toBeDefined()

    const parsed = JSON.parse(context as string) as {
      summary: { messageCount: number; userCount: number; timespanSeconds: number; hasHighPriority: boolean }
      queueMessages: Array<Record<string, unknown>>
      recentHistory: Array<Record<string, unknown>>
    }

    expect(parsed.summary.messageCount).toBe(messages.length)
    expect(parsed.queueMessages.length).toBe(messages.length)
    expect(parsed.recentHistory.length).toBeLessThanOrEqual(50)
    expect(parsed.recentHistory[parsed.recentHistory.length - 1]?.content).toBe('message-59')
  })
})
