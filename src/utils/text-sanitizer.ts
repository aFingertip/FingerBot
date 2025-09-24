const BANNED_PHRASES = ['哎呦喂'];

const LEADING_PUNCTUATION = /^[，,。！？!~…\s]+/;

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeReplyText(raw: string): string {
  if (!raw) {
    return '';
  }

  let text = raw.trimStart();

  for (const phrase of BANNED_PHRASES) {
    const escaped = escapeForRegExp(phrase);

    // Remove repeated occurrences at the beginning, including trailing punctuation.
    const leadingPattern = new RegExp(`^(?:${escaped})(?:[!！~…。，,。?？\s]{0,3})`, 'i');
    while (leadingPattern.test(text)) {
      text = text.replace(leadingPattern, '').trimStart();
    }

    // Remove inline occurrences and collapse any leftover punctuation.
    const inlinePattern = new RegExp(`${escaped}`, 'gi');
    text = text.replace(inlinePattern, '');
  }

  text = text.replace(LEADING_PUNCTUATION, '');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/([，,。！？!~…]){2,}/g, '$1');
  text = text.replace(/\s+([，,。！？!~…])/g, '$1');

  return text.trim();
}

export function sanitizeReplies(replies: string[]): string[] {
  return replies
    .map(reply => sanitizeReplyText(reply))
    .map(reply => reply.trim())
    .filter(reply => reply.length > 0);
}
