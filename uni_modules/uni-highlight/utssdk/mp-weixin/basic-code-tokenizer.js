const supportedLanguages = new Set([
  'javascript', 'js', 'typescript', 'ts', 'javascriptReact', 'jsx',
  'python', 'py', 'html', 'xml', 'xsl', 'css', 'cpp', 'cuda-cpp',
  'dart', 'go', 'java', 'lua', 'php', 'r', 'sql', 'json', 'jsonc', 'jsonl', 'c'
])
const keywords = new Set(`as async await break case catch class const continue def default delete do else enum export extends false finally for from func function if import in instanceof interface is let new null of package private protected public return self static struct super switch then this throw true try type typeof undefined use var void while with yield
and or not elif except lambda pass raise global nonlocal None True False
bool byte char double float int long short string unsigned namespace template typename virtual
SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE TABLE JOIN LEFT RIGHT ON GROUP BY ORDER LIMIT AS AND OR NOT NULL TRUE FALSE`.split(/\s+/).map(word => word.toLowerCase()))
const constants = new Set(['true', 'false', 'null', 'undefined', 'none', 'nan', 'infinity'])
const markupLanguages = new Set(['html', 'xml', 'xsl'])
const hashCommentLanguages = new Set(['python', 'py', 'r', 'php'])

function isLetter(char) {
  const code = char.charCodeAt(0)
  return code >= 65 && code <= 90 || code >= 97 && code <= 122 || char === '_' || char === '$'
}

function isDigit(char) {
  const code = char.charCodeAt(0)
  return code >= 48 && code <= 57
}

function tokenizeCode(source, language) {
  const lines = [[]]
  if (!supportedLanguages.has(language)) {
    return source.split('\n').map(text => text ? [{ text, className: '' }] : [])
  }

  const append = (text, className) => {
    const parts = text.split('\n')
    for (let index = 0; index < parts.length; index++) {
      if (index > 0) lines.push([])
      if (parts[index].length === 0) continue
      const row = lines[lines.length - 1]
      const last = row[row.length - 1]
      if (last && last.className === className) last.text += parts[index]
      else row.push({ text: parts[index], className })
    }
  }
  const markup = markupLanguages.has(language)
  const hashComments = hashCommentLanguages.has(language)
  let cursor = 0
  let plainStart = 0
  const color = (end, className) => {
    if (plainStart < cursor) append(source.slice(plainStart, cursor), '')
    append(source.slice(cursor, end), className)
    cursor = end
    plainStart = end
  }

  while (cursor < source.length) {
    const char = source[cursor]
    const next = source[cursor + 1]
    if (markup && source.startsWith('<!--', cursor)) {
      const close = source.indexOf('-->', cursor + 4)
      color(close < 0 ? source.length : close + 3, 'comment')
    } else if (!markup && char === '/' && next === '*') {
      const close = source.indexOf('*/', cursor + 2)
      color(close < 0 ? source.length : close + 2, 'comment')
    } else if (!markup && char === '/' && next === '/' && language !== 'sql') {
      const close = source.indexOf('\n', cursor)
      color(close < 0 ? source.length : close, 'comment')
    } else if (hashComments && char === '#') {
      const close = source.indexOf('\n', cursor)
      color(close < 0 ? source.length : close, 'comment')
    } else if (language === 'sql' && char === '-' && next === '-') {
      const close = source.indexOf('\n', cursor)
      color(close < 0 ? source.length : close, 'comment')
    } else if (char === '"' || char === "'" || char === '`') {
      let end = cursor + 1
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue }
        if (source[end++] === char) break
      }
      color(Math.min(end, source.length), 'string')
    } else if (markup && char === '<' && (isLetter(next || '') || next === '/')) {
      let end = cursor + (next === '/' ? 2 : 1)
      while (end < source.length && (isLetter(source[end]) || isDigit(source[end]) || source[end] === '-')) end++
      color(end, 'entity')
    } else if (isDigit(char)) {
      let end = cursor + 1
      while (end < source.length && (isDigit(source[end]) || source[end] === '_' || source[end] === '.')) end++
      color(end, 'constant')
    } else if (isLetter(char)) {
      let end = cursor + 1
      while (end < source.length && (isLetter(source[end]) || isDigit(source[end]))) end++
      const word = source.slice(cursor, end)
      const lower = word.toLowerCase()
      let className = constants.has(lower) ? 'constant' : keywords.has(lower) ? 'keyword' : ''
      if (!className) {
        let after = end
        while (source[after] === ' ' || source[after] === '\t') after++
        if (source[after] === '(') className = 'function'
      }
      if (className) color(end, className)
      else cursor = end
    } else if ('(){}[];,.'.includes(char)) {
      color(cursor + 1, 'punctuation')
    } else {
      cursor++
    }
  }
  if (plainStart < cursor) append(source.slice(plainStart, cursor), '')
  return lines
}

export default { tokenizeCode }
