import type { JSONContent } from '@tiptap/core'
import type { Block, Inline, TextInline } from '../lib/types'

/* Lossless mapping between the frozen body schema (contracts/implementation.md "Body schema version 1")
   and the TipTap document. The editor schema is restricted so it can only express what the body schema allows. */

type Mark = { type: 'bold' } | { type: 'italic' } | { type: 'link'; attrs: { href: string } }

function textNodes(text: string, marks: Mark[]): JSONContent[] {
  const out: JSONContent[] = []
  text.split('\n').forEach((part, i) => {
    if (i > 0) out.push({ type: 'hardBreak' })
    if (part) out.push({ type: 'text', text: part, ...(marks.length ? { marks } : {}) })
  })
  return out
}
const styleMarks = (t: TextInline): Mark[] => [...(t.bold ? [{ type: 'bold' as const }] : []), ...(t.italic ? [{ type: 'italic' as const }] : [])]

function inlineToNodes(items: Inline[]): JSONContent[] {
  return items.flatMap(item => (item.type === 'text'
    ? textNodes(item.text, styleMarks(item))
    : item.children.flatMap(child => textNodes(child.text, [...styleMarks({ ...child, bold: !!child.bold, italic: !!child.italic }), { type: 'link', attrs: { href: item.url } }]))))
}

const paragraph = (items: Inline[]): JSONContent => {
  const content = inlineToNodes(items)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

export function toDoc(blocks: Block[]): JSONContent {
  const content = blocks.map((block): JSONContent => {
    switch (block.type) {
      case 'paragraph': return paragraph(block.children)
      case 'heading': { const inner = inlineToNodes(block.children); return { type: 'heading', attrs: { level: block.level }, ...(inner.length ? { content: inner } : {}) } }
      case 'quote': return { type: 'blockquote', content: [paragraph(block.children)] }
      case 'list': return { type: block.ordered ? 'orderedList' : 'bulletList', content: block.items.map(item => ({ type: 'listItem', content: [paragraph(item)] })) }
      case 'image': return { type: 'articleImage', attrs: { mediaDocumentId: block.mediaDocumentId, alt: block.alt, caption: block.caption ?? '' } }
    }
  })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** Inline nodes → Inline[]: hard breaks become "\n", adjacent same-style runs merge, link runs group by href. */
function nodesToInline(nodes: JSONContent[] = []): Inline[] {
  const out: Inline[] = []
  const pushText = (target: TextInline[] | Inline[], next: TextInline) => {
    const last = target[target.length - 1]
    if (last && last.type === 'text' && last.bold === next.bold && last.italic === next.italic) last.text += next.text
    else target.push(next)
  }
  for (const node of nodes) {
    const marks = (node.marks ?? []) as Mark[]
    const text: TextInline = { type: 'text', text: node.type === 'hardBreak' ? '\n' : node.text ?? '', bold: marks.some(m => m.type === 'bold'), italic: marks.some(m => m.type === 'italic') }
    if (!text.text) continue
    const href = (marks.find(m => m.type === 'link') as Extract<Mark, { type: 'link' }> | undefined)?.attrs.href
    if (!href) { pushText(out, text); continue }
    const last = out[out.length - 1]
    if (last && last.type === 'link' && last.url === href) pushText(last.children, text)
    else out.push({ type: 'link', url: href, children: [text] })
  }
  return out
}

/** Paragraph-run → Inline[]; multiple paragraphs (e.g. inside a quote) are joined by a line break. */
function joinParagraphs(nodes: JSONContent[] = []): Inline[] {
  return nodesToInline(nodes.flatMap((p, i) => [...(i > 0 ? [{ type: 'hardBreak' }] : []), ...(p.content ?? [])]))
}

export function fromDoc(doc: JSONContent): Block[] {
  const blocks = (doc.content ?? []).flatMap((node): Block[] => {
    switch (node.type) {
      case 'paragraph': return [{ type: 'paragraph', children: nodesToInline(node.content) }]
      case 'heading': {
        const children = nodesToInline(node.content)
        return [{ type: 'heading', level: node.attrs?.level === 3 ? 3 : 2, children: children.length ? children : [{ type: 'text', text: '', bold: false, italic: false }] }]
      }
      case 'blockquote': return [{ type: 'quote', children: joinParagraphs(node.content) }]
      case 'bulletList':
      case 'orderedList': return [{ type: 'list', ordered: node.type === 'orderedList', items: (node.content ?? []).map(item => joinParagraphs(item.content)) }]
      case 'articleImage': return [{ type: 'image', mediaDocumentId: String(node.attrs?.mediaDocumentId ?? ''), alt: String(node.attrs?.alt ?? ''), caption: String(node.attrs?.caption ?? '') }]
      default: return []
    }
  })
  // The editor always keeps one empty paragraph to type into; it is not content.
  while (blocks.length) {
    const last = blocks[blocks.length - 1]
    if (last.type === 'paragraph' && !last.children.length) blocks.pop()
    else break
  }
  return blocks
}
