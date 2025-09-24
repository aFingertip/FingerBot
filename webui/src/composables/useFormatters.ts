export function useFormatters() {
  function escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function formatJson(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent)
    
    if (obj === null) {
      return '<span class="json-null">null</span>'
    }
    
    if (typeof obj === 'string') {
      return `<span class="json-string">"${escapeHtml(obj)}"</span>`
    }
    
    if (typeof obj === 'number') {
      return `<span class="json-number">${obj}</span>`
    }
    
    if (typeof obj === 'boolean') {
      return `<span class="json-boolean">${obj}</span>`
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return '<span class="json-punctuation">[]</span>'
      }
      
      let result = '<span class="json-punctuation">[</span>\n'
      obj.forEach((item, index) => {
        result += spaces + '  ' + formatJson(item, indent + 1)
        if (index < obj.length - 1) {
          result += '<span class="json-punctuation">,</span>'
        }
        result += '\n'
      })
      result += spaces + '<span class="json-punctuation">]</span>'
      return result
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj)
      if (keys.length === 0) {
        return '<span class="json-punctuation">{}</span>'
      }
      
      let result = '<span class="json-punctuation">{</span>'
      keys.forEach((key, index) => {
        result += '\n' + spaces + '  '
        result += `<span class="json-key">"${escapeHtml(key)}"</span>`
        result += '<span class="json-punctuation">: </span>'
        result += formatJson(obj[key], indent + 1)
        if (index < keys.length - 1) {
          result += '<span class="json-punctuation">,</span>'
        }
      })
      result += '\n' + spaces + '<span class="json-punctuation">}</span>'
      return result
    }
    
    return escapeHtml(String(obj))
  }

  function formatPromptContent(prompt: string): string {
    let formatted = escapeHtml(prompt)
    
    // 高亮系统提示
    formatted = formatted.replace(
      /(你是一个智能群聊助手，具备以下特点：[\s\S]*?- 在群聊中保持适当的活跃度)/,
      '<div style="color: #79c0ff; font-weight: 600;">$1</div>'
    )
    
    // 高亮对话历史部分
    formatted = formatted.replace(
      /(最近的对话历史：[\s\S]*?)(\n\n用户消息：)/,
      '<div style="color: #f85149; font-weight: 600;">对话历史:</div><div style="background: #21262d; padding: 0.5rem; margin: 0.5rem 0; border-radius: 4px;">$1</div>$2'
    )
    
    // 高亮用户消息
    formatted = formatted.replace(
      /(用户消息：)(.*?)(\n\n请回复：)/,
      '<div style="color: #a5d6ff; font-weight: 600;">$1</div><div style="background: #161b22; padding: 0.5rem; margin: 0.5rem 0; border-radius: 4px; color: #f0f6fc;">$2</div><div style="color: #ff7b72; font-weight: 600;">请回复：</div>'
    )
    
    return formatted
  }

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString()
  }

  function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  return {
    escapeHtml,
    formatJson,
    formatPromptContent,
    formatTimestamp,
    truncateText
  }
}