import TurndownService from 'turndown'

const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
converter.addRule('strikethrough', { filter: ['s', 'del'], replacement: text => `~~${text}~~` })
converter.addRule('omitImages', { filter: 'img', replacement: () => '' })

export function noteTime(value) {
  return value == null ? '未知' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}

export function notesMarkdown(notes) {
  return notes.map(note => {
    const title = converter.turndown(String(note.title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).replace(/\r?\n/g, ' ')
    const body = note.contentHtml ? converter.turndown(note.contentHtml) : note.content || ''
    return `# ${title}\n\n创建时间：${noteTime(note.created)}\n\n${body}`
  }).join('\n\n---\n\n') + '\n'
}

export async function notesWord(notes) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink } = await import('docx')
  async function inline(node, style = {}) {
    if (node.nodeType === 3) return [new TextRun({ text: node.textContent, ...style })]
    if (node.nodeType !== 1) return []
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return [new TextRun({ break: 1 })]
    if (tag === 'img') {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = node.getAttribute('src') || ''
      await image.decode()
      const scale = Math.min(1, 600 / image.naturalWidth, 780 / image.naturalHeight)
      const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(image, 0, 0, width, height)
      const data = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0))
      return [new ImageRun({ type: 'png', data, transformation: { width, height }, altText: { title: node.alt || '正文图片', description: node.alt || '正文图片', name: '图片' } })]
    }
    const next = { ...style }
    if (['strong', 'b'].includes(tag)) next.bold = true
    if (['em', 'i'].includes(tag)) next.italics = true
    if (['s', 'del'].includes(tag)) next.strike = true
    if (tag === 'code') next.font = 'Consolas'
    const children = (await Promise.all([...node.childNodes].map(child => inline(child, next)))).flat()
    if (tag === 'a' && /^https?:/i.test(node.getAttribute('href') || '')) return [new ExternalHyperlink({ link: node.getAttribute('href'), children })]
    return children
  }
  const children = []
  async function blocks(parent, depth = 0, ordered = false) {
    let index = 0
    for (const node of parent.childNodes) {
      const tag = node.nodeName.toLowerCase()
      if (['ul', 'ol', 'blockquote'].includes(tag)) { await blocks(node, depth + 1, tag === 'ol'); continue }
      if (tag === 'li') {
        index++
        const content = document.createElement('div')
        for (const child of node.childNodes) if (!['UL', 'OL'].includes(child.nodeName)) content.append(child.cloneNode(true))
        children.push(new Paragraph({ children: [new TextRun(ordered ? `${index}. ` : '• '), ...await inline(content)], indent: { left: depth * 360 }, spacing: { after: 120 } }))
        for (const nested of Array.from(node.children)) if (['UL', 'OL'].includes(nested.tagName)) { const wrapper = document.createElement('div'); wrapper.append(nested.cloneNode(true)); await blocks(wrapper, depth) }
        continue
      }
      children.push(new Paragraph({ children: await inline(node), ...(/^h[1-6]$/.test(tag) ? { heading: `Heading${tag[1]}` } : {}), spacing: { after: 160 }, indent: { left: depth * 360 } }))
    }
  }
  for (const [index, note] of notes.entries()) {
    children.push(new Paragraph({ text: note.title, heading: 'Title', pageBreakBefore: index > 0 }))
    children.push(new Paragraph({ text: `创建时间：${noteTime(note.created)}`, spacing: { after: 200 } }))
    const root = document.createElement('div')
    if (note.contentHtml) root.innerHTML = note.contentHtml
    else for (const line of (note.content || '').split('\n')) { const p = document.createElement('p'); p.textContent = line; root.append(p) }
    await blocks(root)
  }
  return Packer.toBlob(new Document({ sections: [{ children }] }))
}

export async function notesExcel(notes) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('每日笔记', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: '标题', key: 'title', width: 28 }, { header: '分类', key: 'category', width: 14 },
    { header: '创建时间', key: 'created', width: 24 },
    { header: '正文', key: 'content', width: 70 }, { header: '正文图片', key: 'images', width: 42 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = 'A1:E1'
  for (const note of notes) {
    const root = document.createElement('div')
    root.innerHTML = note.contentHtml || ''
    const row = sheet.addRow({ title: note.title, category: note.category, created: noteTime(note.created), content: note.content || root.textContent || '' })
    row.alignment = { vertical: 'top', wrapText: true }
    let offset = 0
    for (const element of Array.from(root.querySelectorAll('img'))) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = element.getAttribute('src') || ''
      await image.decode()
      const scale = Math.min(1, 270 / image.naturalWidth, 220 / image.naturalHeight)
      const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(image, 0, 0, width, height)
      const id = workbook.addImage({ base64: canvas.toDataURL('image/png'), extension: 'png' })
      const imageRow = offset ? sheet.addRow({}) : row
      imageRow.height = Math.max(60, (height + 12) * 0.75)
      sheet.addImage(id, { tl: { col: 4, row: imageRow.number - 1 }, ext: { width, height }, editAs: 'oneCell' })
      offset += height + 12
    }
    row.height = Math.max(row.height || 60, Math.min(300, (note.content || '').split('\n').length * 16))
  }
  return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
