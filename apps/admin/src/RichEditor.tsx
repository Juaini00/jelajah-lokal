import { useEffect, useRef, useState } from 'react'
import type { Block, Inline, Media, TextInline } from './types'
import { bodyText, points, safeUrl } from './types'

function readInline(root: Node): Inline[] {
  const output: Inline[] = []
  function walk(node: Node, bold = false, italic = false, link?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text: TextInline = { type: 'text', text: node.textContent || '', ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) }
      if (!text.text) return
      if (link) output.push({ type: 'link', url: link, children: [text] }); else output.push(text)
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'BR') { output.push({ type: 'text', text: '\n' }); return }
    const url = node.tagName === 'A' && safeUrl(node.getAttribute('href') || '') ? node.getAttribute('href')! : link
    Array.from(node.childNodes).forEach(child => walk(child, bold || ['B', 'STRONG'].includes(node.tagName), italic || ['I', 'EM'].includes(node.tagName), url))
    if (['DIV', 'P'].includes(node.tagName)) output.push({ type: 'text', text: '\n' })
  }
  Array.from(root.childNodes).forEach(node => walk(node))
  return output.length ? output : [{ type: 'text', text: '' }]
}
function appendInline(root: HTMLElement, value: Inline[]) {
  root.replaceChildren()
  function textNode(item: TextInline): Node {
    let node: Node = document.createTextNode(item.text)
    if (item.italic) { const el = document.createElement('em'); el.append(node); node = el }
    if (item.bold) { const el = document.createElement('strong'); el.append(node); node = el }
    return node
  }
  value.forEach(item => {
    if (item.type === 'text') root.append(textNode(item))
    else if (safeUrl(item.url)) { const link = document.createElement('a'); link.href = item.url; item.children.forEach(t => link.append(textNode(t))); root.append(link) }
    else item.children.forEach(t => root.append(textNode(t)))
  })
}
function InlineEditor({ value, onChange, label }: { value: Inline[]; onChange: (value: Inline[]) => void; label: string }) {
  const root = useRef<HTMLDivElement>(null)
  const last = useRef('')
  const range = useRef<Range | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [linkError, setLinkError] = useState('')
  const [formatMessage, setFormatMessage] = useState('')
  useEffect(() => {
    const serialized = JSON.stringify(value)
    if (root.current && serialized !== last.current) { appendInline(root.current, value); last.current = serialized }
  }, [value])
  function emit() { if (root.current) { const v = readInline(root.current); last.current = JSON.stringify(v); onChange(v) } }
  function remember() {
    const selection = window.getSelection()
    if (selection?.rangeCount && root.current?.contains(selection.anchorNode) && root.current.contains(selection.focusNode)) range.current = selection.getRangeAt(0).cloneRange()
  }
  function format(command: 'bold' | 'italic' | 'unlink' | 'createLink', url?: string) {
    if (!root.current) return
    root.current.focus()
    const selection = window.getSelection()
    if (range.current && root.current.contains(range.current.commonAncestorContainer)) { selection?.removeAllRanges(); selection?.addRange(range.current) }
    if (!selection?.rangeCount || selection.isCollapsed) { setFormatMessage('Pilih teks yang ingin diformat terlebih dahulu.'); return }
    // Browser editing commands preserve selection and undo; persistence uses only allowlisted blocks.
    document.execCommand(command, false, url)
    setFormatMessage(''); emit(); remember()
  }
  return <div className="inline-editor">
    <div className="toolbar" aria-label={`Format ${label}`}>
      <button type="button" className="secondary" onMouseDown={e => e.preventDefault()} onClick={() => format('bold')}><strong>Tebal</strong></button>
      <button type="button" className="secondary" onMouseDown={e => e.preventDefault()} onClick={() => format('italic')}><em>Miring</em></button>
      <button type="button" className="secondary" onMouseDown={e => e.preventDefault()} onClick={() => { remember(); setLink(''); setLinkError('') }}>Tautan</button>
      <button type="button" className="secondary" onMouseDown={e => e.preventDefault()} onClick={() => format('unlink')}>Lepas tautan</button>
    </div>
    {link !== null && <div className="link-editor"><label>URL tautan<input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></label><button type="button" onClick={() => { if (!safeUrl(link)) { setLinkError('Gunakan HTTP(S) tanpa username atau password.'); return } format('createLink', link); setLink(null) }}>Pasang tautan</button><button type="button" className="secondary" onClick={() => setLink(null)}>Batal</button><p role="alert">{linkError}</p></div>}
    <div ref={root} className="editable" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onPaste={e => {
      e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const selection = window.getSelection()
      if (selection?.rangeCount && root.current?.contains(selection.anchorNode)) { const r = selection.getRangeAt(0); r.deleteContents(); const node = document.createTextNode(text); r.insertNode(node); r.setStartAfter(node); r.collapse(true); selection.removeAllRanges(); selection.addRange(r); emit() }
    }} />
    {formatMessage && <p className="hint" role="status">{formatMessage}</p>}
  </div>
}
export function RichEditor({ value, onChange, media }: { value: Block[]; onChange: (value: Block[]) => void; media: Media[] }) {
  const [keys, setKeys] = useState<string[]>(() => value.map(() => crypto.randomUUID()))
  useEffect(() => { setKeys(previous => value.map((_, i) => previous[i] || crypto.randomUUID())) }, [value.length])
  function replace(index: number, block: Block) { onChange(value.map((b, i) => i === index ? block : b)) }
  function move(index: number, target: number) {
    const next = [...value]; [next[index], next[target]] = [next[target], next[index]]
    const nextKeys = [...keys]; [nextKeys[index], nextKeys[target]] = [nextKeys[target], nextKeys[index]]; setKeys(nextKeys); onChange(next)
  }
  return <section className="rich-editor"><div className="panel-title"><h2>Isi artikel</h2><span className="counter">{points(bodyText(value))} / 20.000 karakter</span></div>
    <p className="hint">Tambahkan blok, tulis langsung, lalu pilih teks untuk format atau tautan. Tempelan menjadi teks biasa. Publikasi membutuhkan sedikitnya 150 kata bermakna.</p>
    {value.map((block, index) => <div className={`body-block block-${block.type}`} key={keys[index] || index}>
      <div className="block-head"><span>Blok {index + 1} · {block.type === 'heading' ? `Judul H${block.level}` : block.type === 'paragraph' ? 'Paragraf' : block.type === 'list' ? 'Daftar' : block.type === 'quote' ? 'Kutipan' : 'Gambar'}</span><div className="actions"><button type="button" className="secondary" disabled={index === 0} aria-label={`Naikkan blok ${index + 1}`} onClick={() => move(index, index - 1)}>↑</button><button type="button" className="secondary" disabled={index === value.length - 1} aria-label={`Turunkan blok ${index + 1}`} onClick={() => move(index, index + 1)}>↓</button><button type="button" className="secondary danger" onClick={() => { setKeys(keys.filter((_, i) => i !== index)); onChange(value.filter((_, i) => i !== index)) }}>Hapus blok</button></div></div>
      {block.type === 'image' ? <><label>Media gambar<select value={block.mediaDocumentId} onChange={e => replace(index, { ...block, mediaDocumentId: e.target.value })}><option value="">Pilih gambar</option>{media.map(m => <option key={m.documentId} value={m.documentId}>{m.credit || m.publicId} · {m.width} × {m.height}</option>)}</select></label>{media.find(m => m.documentId === block.mediaDocumentId) && <img className="body-image" src={media.find(m => m.documentId === block.mediaDocumentId)!.url} alt={block.alt} />}<label>Deskripsi alternatif<input value={block.alt} onChange={e => replace(index, { ...block, alt: e.target.value })} /></label><label>Caption<input value={block.caption || ''} onChange={e => replace(index, { ...block, caption: e.target.value })} /></label></> : block.type === 'list' ? <><label className="checkbox-label"><input type="checkbox" checked={block.ordered} onChange={e => replace(index, { ...block, ordered: e.target.checked })} />Daftar bernomor</label>{block.items.map((item, itemIndex) => <div className="list-item" key={itemIndex}><span>{block.ordered ? `${itemIndex + 1}.` : '•'}</span><InlineEditor label={`Butir ${itemIndex + 1}, blok ${index + 1}`} value={item} onChange={v => replace(index, { ...block, items: block.items.map((x, i) => i === itemIndex ? v : x) })} /><button type="button" className="secondary" aria-label={`Hapus butir ${itemIndex + 1}`} onClick={() => replace(index, { ...block, items: block.items.filter((_, i) => i !== itemIndex) })}>×</button></div>)}<button type="button" className="secondary" onClick={() => replace(index, { ...block, items: [...block.items, [{ type: 'text', text: '' }]] })}>Tambah butir</button></> : <InlineEditor label={`Teks blok ${index + 1}`} value={block.children} onChange={children => replace(index, { ...block, children })} />}
    </div>)}
    <div className="toolbar add-block" aria-label="Tambahkan blok">{(['paragraph', 'heading2', 'heading3', 'list', 'quote', 'image'] as const).map(type => <button type="button" className="secondary" key={type} onClick={() => {
      const children: Inline[] = [{ type: 'text', text: '' }]
      const block: Block = type === 'image' ? { type: 'image', mediaDocumentId: '', alt: '' } : type === 'list' ? { type: 'list', ordered: false, items: [children] } : type === 'heading2' || type === 'heading3' ? { type: 'heading', level: type === 'heading2' ? 2 : 3, children } : { type, children }
      setKeys([...keys, crypto.randomUUID()]); onChange([...value, block])
    }}>+ {type === 'paragraph' ? 'Paragraf' : type === 'heading2' ? 'H2' : type === 'heading3' ? 'H3' : type === 'list' ? 'Daftar' : type === 'quote' ? 'Kutipan' : 'Gambar'}</button>)}</div>
  </section>
}
