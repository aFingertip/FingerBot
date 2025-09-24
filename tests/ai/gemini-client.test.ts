import { GeminiClient } from '../../src/ai/gemini-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as personaModule from '../../src/config/persona';

// Mock the Google Generative AI and persona
jest.mock('@google/generative-ai');
jest.mock('../../src/utils/config');
jest.mock('../../src/config/persona');

const MockedGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;

// Mock persona
const mockPersona = {
  name: '智能指尖',
  personality: '活跃直爽、幽默犀利、带点阴阳怪气的群友',
  traits: ['自然随意', '一针见血', '机智幽默'],
  systemPrompt: '你是群聊中的「指尖」，一个活跃直爽、幽默犀利、带点阴阳怪气的群友',
  responseStyle: {
    tone: '自然有趣',
    length: 'medium' as const,
    emoji: true,
    casual: true
  },
  behaviors: {
    greeting: '随意自然',
    farewell: '轻松带点调侃',
    uncertainty: '用调侃或阴阳怪气方式回应',
    humor: true
  }
};

describe('GeminiClient', () => {
  let geminiClient: GeminiClient;
  let mockModel: any;
  let mockGenAI: any;

  beforeEach(() => {
    mockModel = {
      generateContent: jest.fn()
    };

    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    };

    MockedGoogleGenerativeAI.mockImplementation(() => mockGenAI);

    // Mock persona function
    (personaModule.getCurrentPersona as jest.MockedFunction<typeof personaModule.getCurrentPersona>)
      .mockReturnValue(mockPersona);

    geminiClient = new GeminiClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize GoogleGenerativeAI with API key', () => {
      expect(MockedGoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith({ model: 'test-model' });
    });
  });

  describe('generateResponse', () => {
    it('should generate response successfully', async () => {
      const mockResponseText = 'Hello, this is a test response';
      const mockResponse = {
        text: jest.fn().mockReturnValue(mockResponseText)
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test prompt');

      expect(result.content).toBe(mockResponseText);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.tokensUsed).toBe(6); // "Hello this is a test response" = 6 words
    });

    it('should include context in prompt when provided', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response with context')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const userMessage = 'Hello';
      const context = 'Previous conversation context';

      await geminiClient.generateResponse(userMessage, context);

      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('最近的对话历史：\nPrevious conversation context')
      );
    });

    it('should build prompt with persona system instructions', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Test message');

      const expectedPromptParts = [
        '你是群聊中的「指尖」',
        '活跃直爽、幽默犀利、带点阴阳怪气的群友',
        '用户消息：Test message',
        '请回复：'
      ];

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      expectedPromptParts.forEach(part => {
        expect(calledPrompt).toContain(part);
      });
    });

    it('should handle API errors gracefully', async () => {
      const errorMessage = 'API quota exceeded';
      mockModel.generateContent.mockRejectedValue(new Error(errorMessage));

      await expect(geminiClient.generateResponse('Test prompt'))
        .rejects.toThrow(errorMessage);
    });

    it('should handle response parsing errors', async () => {
      const mockResult = {
        response: Promise.resolve({
          text: jest.fn().mockImplementation(() => {
            throw new Error('Failed to parse response');
          })
        })
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await expect(geminiClient.generateResponse('Test prompt'))
        .rejects.toThrow('Failed to parse response');
    });

    it('should estimate tokens correctly for mixed content', async () => {
      const responseWithMixedContent = 'Hello 世界 how are you 今天？';
      const mockResponse = {
        text: jest.fn().mockReturnValue(responseWithMixedContent)
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      // Should count Chinese characters (世界今天？ = 4) + English words (Hello how are you = 4) + punctuation counted as words = 1
      expect(result.tokensUsed).toBe(9);
    });

    it('should handle long responses without throwing errors', async () => {
      const longResponse = 'A'.repeat(300);
      const mockResponse = {
        text: jest.fn().mockReturnValue(longResponse)
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      expect(result.content).toBe(longResponse);
      expect(result.tokensUsed).toBe(1); // 300 'A' characters without spaces = 1 word
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection test', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Hello')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.testConnection();

      expect(result).toBe(true);
      expect(mockModel.generateContent).toHaveBeenCalledWith('Hello');
    });

    it('should return false for failed connection test', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('Connection failed'));

      const result = await geminiClient.testConnection();

      expect(result).toBe(false);
    });

    it('should handle response parsing errors in connection test', async () => {
      const mockResult = {
        response: Promise.resolve({
          text: jest.fn().mockImplementation(() => {
            throw new Error('Parse error');
          })
        })
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens for English text', async () => {
      const englishText = 'Hello world this is a test';
      const mockResponse = {
        text: jest.fn().mockReturnValue(englishText)
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      // "Hello world this is a test" = 6 words
      expect(result.tokensUsed).toBe(6);
    });

    it('should estimate tokens for Chinese text', async () => {
      const chineseText = '你好世界测试';
      const mockResponse = {
        text: jest.fn().mockReturnValue(chineseText)
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      // "你好世界测试" = 6 Chinese characters + 1 word from splitting empty string after Chinese removal
      expect(result.tokensUsed).toBe(7); // 6 + 1
    });

    it('should handle empty text', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      expect(result.tokensUsed).toBe(1); // Empty string split gives 1 element
    });

    it('should handle text with only whitespace', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('   \n  \t  ')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const result = await geminiClient.generateResponse('Test');

      expect(result.tokensUsed).toBe(1); // Trimmed empty string
    });
  });

  describe('prompt building', () => {
    it('should build prompt without context', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Hello world');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('你是群聊中的「指尖」');
      expect(calledPrompt).toContain('用户消息：Hello world');
      expect(calledPrompt).toContain('请回复：');
      expect(calledPrompt).not.toContain('最近的对话历史');
    });

    it('should build prompt with context', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      const context = 'User A: Hi\nUser B: Hello';
      await geminiClient.generateResponse('How are you?', context);

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('最近的对话历史：\nUser A: Hi\nUser B: Hello');
      expect(calledPrompt).toContain('用户消息：How are you?');
    });
  });

  describe('persona integration', () => {
    it('should include persona traits in prompt', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Tell me about yourself');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('你的个性特征：自然随意、一针见血、机智幽默');
    });

    it('should include emoji guidance when persona allows emoji', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Test message');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('可以适当使用emoji表情来增加亲和力');
    });

    it('should include casual language guidance when persona is casual', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Test message');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('语言风格：使用口语化、亲近的表达方式');
    });

    it('should include humor guidance when persona supports humor', async () => {
      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Test message');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('可以适当使用幽默来活跃气氛，但要注意场合');
    });

    it('should build different prompt for different persona settings', async () => {
      const professionalPersona = {
        ...mockPersona,
        systemPrompt: '你是一个专业的商务助手',
        traits: ['专业严谨', '高效准确'],
        responseStyle: {
          tone: '专业正式',
          length: 'medium' as const,
          emoji: false,
          casual: false
        },
        behaviors: {
          ...mockPersona.behaviors,
          humor: false
        }
      };

      // Mock different persona for this test
      (personaModule.getCurrentPersona as jest.MockedFunction<typeof personaModule.getCurrentPersona>)
        .mockReturnValueOnce(professionalPersona);

      const mockResponse = {
        text: jest.fn().mockReturnValue('Response')
      };
      const mockResult = {
        response: Promise.resolve(mockResponse)
      };

      mockModel.generateContent.mockResolvedValue(mockResult);

      await geminiClient.generateResponse('Test message');

      const calledPrompt = mockModel.generateContent.mock.calls[0][0];
      
      expect(calledPrompt).toContain('你是一个专业的商务助手');
      expect(calledPrompt).toContain('你的个性特征：专业严谨、高效准确');
      expect(calledPrompt).toContain('语言风格：保持专业、正式的表达方式');
      expect(calledPrompt).not.toContain('可以适当使用emoji表情');
      expect(calledPrompt).not.toContain('可以适当使用幽默');
    });
  });
});