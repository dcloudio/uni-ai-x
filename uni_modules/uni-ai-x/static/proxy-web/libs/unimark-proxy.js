(function () {
  function toNumberFlag(value) {
    return value ? 1 : 0
  }

  function createTextToken(text, raw) {
    return {
      type: 'text',
      raw: raw ?? text,
      text: text ?? ''
    }
  }

  function convertInlineToken(token) {
    if (!token || typeof token.type !== 'string') {
      return null
    }

    switch (token.type) {
      case 'text':
      case 'escape':
        return createTextToken(token.text ?? '', token.raw)
      case 'strong':
      case 'em':
      case 'del':
        return {
          type: token.type,
          raw: token.raw,
          text: token.text ?? '',
          tokens: convertInlineTokens(token.tokens)
        }
      case 'codespan':
        return {
          type: 'code',
          raw: token.raw,
          text: token.text ?? ''
        }
      case 'br':
        return createTextToken('\n', token.raw)
      case 'link':
        return {
          type: 'link',
          raw: token.raw,
          text: token.text ?? '',
          href: token.href ?? '',
          title: token.title ?? '',
          tokens: convertInlineTokens(token.tokens)
        }
      case 'image':
        return {
          type: 'image',
          raw: token.raw,
          text: token.text ?? '',
          href: token.href ?? '',
          title: token.title ?? '',
          tokens: [createTextToken(token.text ?? '', token.raw)]
        }
      case 'html':
        return createTextToken(token.text ?? '', token.raw)
      default:
        if (Array.isArray(token.tokens) && token.tokens.length > 0) {
          return {
            type: token.type,
            raw: token.raw,
            text: token.text ?? '',
            tokens: convertInlineTokens(token.tokens)
          }
        }
        return createTextToken(token.text ?? token.raw ?? '', token.raw)
    }
  }

  function convertInlineTokens(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return []
    }

    const result = []
    for (const token of tokens) {
      const converted = convertInlineToken(token)
      if (converted != null) {
        result.push(converted)
      }
    }
    return result
  }

  function convertTableCell(cell) {
    return {
      type: 'table_cell',
      text: cell.text ?? '',
      align: cell.align ?? null,
      tokens: convertInlineTokens(cell.tokens)
    }
  }

  function convertTableRow(cells, isHeader) {
    return {
      type: isHeader ? 'table_header' : 'table_row',
      tokens: cells.map(convertTableCell)
    }
  }

  function convertBlockToken(token) {
    if (!token || typeof token.type !== 'string') {
      return null
    }

    switch (token.type) {
      case 'space':
      case 'def':
        return null
      case 'heading':
        return {
          type: 'heading',
          raw: token.raw,
          text: token.text ?? '',
          depth: token.depth ?? 1,
          tokens: convertInlineTokens(token.tokens)
        }
      case 'paragraph':
        return {
          type: 'paragraph',
          raw: token.raw,
          text: token.text ?? '',
          pre: toNumberFlag(token.pre),
          tokens: convertInlineTokens(token.tokens)
        }
      case 'text':
        if (Array.isArray(token.tokens) && token.tokens.length > 0) {
          return {
            type: 'paragraph',
            raw: token.raw,
            text: token.text ?? '',
            tokens: convertInlineTokens(token.tokens)
          }
        }
        return createTextToken(token.text ?? '', token.raw)
      case 'code':
        return {
          type: 'code_block',
          raw: token.raw,
          text: token.text ?? '',
          lang: token.lang ?? '',
          codeBlockStyle: token.codeBlockStyle,
          escaped: toNumberFlag(token.escaped)
        }
      case 'blockquote':
        return {
          type: 'block_quote',
          raw: token.raw,
          text: token.text ?? '',
          tokens: convertBlockTokens(token.tokens)
        }
      case 'list':
        return {
          type: 'list',
          raw: token.raw,
          ordered: toNumberFlag(token.ordered),
          loose: toNumberFlag(token.loose),
          start: token.start === '' ? 1 : (token.start ?? 1),
          items: token.items.map((item) => ({
            type: item.task ? 'tasklist' : 'list_item',
            raw: item.raw,
            text: item.text ?? '',
            task: toNumberFlag(item.task),
            checked: toNumberFlag(item.checked),
            loose: toNumberFlag(item.loose),
            tokens: convertBlockTokens(item.tokens)
          }))
        }
      case 'table': {
        const rows = [convertTableRow(token.header, true)]
        for (const row of token.rows) {
          rows.push(convertTableRow(row, false))
        }
        return {
          type: 'table',
          raw: token.raw,
          align: token.align ?? [],
          tokens: rows
        }
      }
      case 'hr':
        return {
          type: 'thematic_break',
          raw: token.raw,
          text: ''
        }
      case 'html':
        return {
          type: token.block ? 'paragraph' : 'text',
          raw: token.raw,
          text: token.text ?? '',
          html: token.text ?? '',
          block: toNumberFlag(token.block),
          pre: toNumberFlag(token.pre)
        }
      default:
        if (Array.isArray(token.tokens) && token.tokens.length > 0) {
          return {
            type: token.type,
            raw: token.raw,
            text: token.text ?? '',
            tokens: convertBlockTokens(token.tokens)
          }
        }
        return createTextToken(token.text ?? token.raw ?? '', token.raw)
    }
  }

  function convertBlockTokens(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return []
    }

    const result = []
    for (const token of tokens) {
      const converted = convertBlockToken(token)
      if (converted != null) {
        result.push(converted)
      }
    }
    return result
  }

  function md2json(markdownText) {
    try {
      const tokens = marked.lexer(markdownText ?? '', {
        gfm: true,
        breaks: false
      })
      return {
        data: convertBlockTokens(tokens),
        errorMsg: ''
      }
    } catch (error) {
      return {
        data: [],
        errorMsg: error instanceof Error ? error.message : String(error)
      }
    }
  }

  window.unimarkProxy = {
    md2json
  }
})()
