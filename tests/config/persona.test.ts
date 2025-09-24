import { getCurrentPersona, defaultPersona, PersonaConfig } from '../../src/config/persona';

describe('Persona Configuration', () => {
  // 保存原始环境变量
  const originalEnv = process.env.BOT_PERSONA;
  
  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnv) {
      process.env.BOT_PERSONA = originalEnv;
    } else {
      delete process.env.BOT_PERSONA;
    }
  });

  describe('defaultPersona', () => {
    it('should have correct basic information', () => {
      expect(defaultPersona.name).toBe('智能指尖');
      expect(defaultPersona.personality).toBe('活跃直爽、幽默犀利、带点阴阳怪气的群友');
      expect(Array.isArray(defaultPersona.traits)).toBe(true);
      expect(defaultPersona.traits.length).toBeGreaterThan(0);
    });

    it('should have valid system prompt', () => {
      expect(defaultPersona.systemPrompt).toBeTruthy();
      expect(typeof defaultPersona.systemPrompt).toBe('string');
      expect(defaultPersona.systemPrompt.length).toBeGreaterThan(50);
      expect(defaultPersona.systemPrompt).toContain('指尖');
    });

    it('should have proper response style configuration', () => {
      const { responseStyle } = defaultPersona;
      
      expect(responseStyle.tone).toBe('自然有趣');
      expect(['short', 'medium', 'long']).toContain(responseStyle.length);
      expect(typeof responseStyle.emoji).toBe('boolean');
      expect(typeof responseStyle.casual).toBe('boolean');
      expect(responseStyle.emoji).toBe(true);
      expect(responseStyle.casual).toBe(true);
    });

    it('should have proper behavior configuration', () => {
      const { behaviors } = defaultPersona;
      
      expect(typeof behaviors.greeting).toBe('string');
      expect(typeof behaviors.farewell).toBe('string');
      expect(typeof behaviors.uncertainty).toBe('string');
      expect(typeof behaviors.humor).toBe('boolean');
      
      expect(behaviors.greeting).toContain('自然');
      expect(behaviors.farewell).toContain('散了吧');
      expect(behaviors.uncertainty).toContain('看情况');
      expect(behaviors.humor).toBe(true);
    });

    it('should have meaningful personality traits', () => {
      const expectedTraits = [
        '自然随意',
        '一针见血', 
        '机智幽默',
        '爱调侃起哄',
        '有分寸的阴阳怪气',
        '口语化接地气'
      ];
      
      expect(defaultPersona.traits).toEqual(expectedTraits);
    });
  });

  describe('getCurrentPersona', () => {
    it('should return default persona when no environment variable is set', () => {
      delete process.env.BOT_PERSONA;
      
      const persona = getCurrentPersona();
      
      expect(persona).toEqual(defaultPersona);
      expect(persona.name).toBe('智能指尖');
    });

    it('should return default persona when BOT_PERSONA is set to default', () => {
      process.env.BOT_PERSONA = 'default';
      
      const persona = getCurrentPersona();
      
      expect(persona).toEqual(defaultPersona);
    });

    it('should return default persona for unknown persona values', () => {
      process.env.BOT_PERSONA = 'unknown_persona';
      
      const persona = getCurrentPersona();
      
      expect(persona).toEqual(defaultPersona);
    });
  });

  describe('PersonaConfig interface compliance', () => {
    it('should match PersonaConfig interface structure', () => {
      const persona = getCurrentPersona();
      
      // 基础信息
      expect(typeof persona.name).toBe('string');
      expect(typeof persona.personality).toBe('string');
      expect(Array.isArray(persona.traits)).toBe(true);
      expect(typeof persona.systemPrompt).toBe('string');
      
      // 回复风格
      expect(typeof persona.responseStyle).toBe('object');
      expect(typeof persona.responseStyle.tone).toBe('string');
      expect(['short', 'medium', 'long']).toContain(persona.responseStyle.length);
      expect(typeof persona.responseStyle.emoji).toBe('boolean');
      expect(typeof persona.responseStyle.casual).toBe('boolean');
      
      // 行为规则
      expect(typeof persona.behaviors).toBe('object');
      expect(typeof persona.behaviors.greeting).toBe('string');
      expect(typeof persona.behaviors.farewell).toBe('string');
      expect(typeof persona.behaviors.uncertainty).toBe('string');
      expect(typeof persona.behaviors.humor).toBe('boolean');
    });
  });

  describe('system prompt content validation', () => {
    it('should contain key personality elements in system prompt', () => {
      const { systemPrompt } = defaultPersona;
      
      // 检查包含关键人设元素
      expect(systemPrompt).toContain('指尖');
      expect(systemPrompt).toContain('活跃');
      expect(systemPrompt).toContain('幽默');
      expect(systemPrompt).toContain('阴阳怪气');
      expect(systemPrompt).toContain('口语化');
      
      // 检查包含网络用语指导
      expect(systemPrompt).toContain('网络用语');
      expect(systemPrompt).toContain('emoji');
      
      // 检查包含群友互动指导
      expect(systemPrompt).toContain('@群友');
      expect(systemPrompt).toContain('调侃');
      
      // 检查包含回复风格指导
      expect(systemPrompt).toContain('简短回');
      expect(systemPrompt).toContain('自然口语化');
    });

    it('should mention specific group members in system prompt', () => {
      const { systemPrompt } = defaultPersona;
      
      const expectedMembers = ['悄得乐', '小沐', '小镜', '米饭', 'Nova'];
      expectedMembers.forEach(member => {
        expect(systemPrompt).toContain(member);
      });
    });

    it('should include example expressions in system prompt', () => {
      const { systemPrompt } = defaultPersona;
      
      const expectedExpressions = [
        '我上班啊',
        '笑死',
        '卧槽',
        '艹',
        'tm'
      ];
      
      expectedExpressions.forEach(expr => {
        expect(systemPrompt).toContain(expr);
      });
    });
  });

  describe('persona consistency', () => {
    it('should have consistent personality across all fields', () => {
      const persona = defaultPersona;
      
      // 人设描述应该与系统提示词一致
      expect(persona.personality).toContain('活跃');
      expect(persona.personality).toContain('幽默');
      expect(persona.systemPrompt).toContain('活跃');
      expect(persona.systemPrompt).toContain('幽默');
      
      // 特征应该与人设描述一致
      expect(persona.traits.join(' ')).toContain('幽默');
      expect(persona.traits.join(' ')).toContain('调侃');
      
      // 行为配置应该与人设一致
      expect(persona.behaviors.humor).toBe(true);
      expect(persona.responseStyle.casual).toBe(true);
      expect(persona.responseStyle.emoji).toBe(true);
    });
  });
});