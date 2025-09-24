import { sanitizeReplyText, sanitizeReplies } from '../../src/utils/text-sanitizer';

describe('text sanitizer', () => {
  it('removes leading banned catchphrase and punctuation', () => {
    expect(sanitizeReplyText('哎呦喂，这也太夸张了吧')).toBe('这也太夸张了吧');
  });

  it('cleans inline occurrences without leaving gaps', () => {
    expect(sanitizeReplyText('这也太哎呦喂离谱了')).toBe('这也太离谱了');
  });

  it('handles emphatic punctuation gracefully', () => {
    expect(sanitizeReplyText('哎呦喂！！ 绝了')).toBe('绝了');
  });

  it('sanitizes reply arrays and filters empty entries', () => {
    const replies = ['哎呦喂！ 绝了', '哎呦喂   兄弟', ''];
    expect(sanitizeReplies(replies)).toEqual(['绝了', '兄弟']);
  });
});
