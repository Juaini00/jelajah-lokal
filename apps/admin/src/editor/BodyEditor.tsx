import { useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type ReactNodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Blockquote from '@tiptap/extension-blockquote'
import { ListItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { AlertCircle, Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Pilcrow, Quote, Redo2, Replace, Trash2, Undo2, Unlink } from 'lucide-react'
import { thumb } from '../lib/format'
import { useMedia } from '../lib/queries'
import type { Block } from '../lib/types'
import { LIMITS, bodyText, codePoints, countWords, safeUrl } from '../lib/validation'
import { MediaPicker } from '../ui/media'
import { fromDoc, toDoc } from './doc'

function ImageView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const media = useMedia()
  const [picking, setPicking] = useState(false)
  const attrs = node.attrs as { mediaDocumentId: string; alt: string; caption: string }
  const current = media.data?.find(m => m.documentId === attrs.mediaDocumentId)
  const altMissing = !attrs.alt.trim()
  return <NodeViewWrapper className={`body-image ${selected ? 'selected' : ''}`} data-drag-handle contentEditable={false}>
    <div className="body-image-frame">
      {current ? <img src={thumb(current.url, 960)} alt={attrs.alt} /> : <div className="media-missing">{media.isPending ? 'Memuat…' : 'Gambar tidak ditemukan di pustaka'}</div>}
      <div className="body-image-tools">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPicking(true)}><Replace size={14} />Ganti</button>
        <button type="button" className="btn btn-sm btn-secondary danger" onClick={deleteNode}><Trash2 size={14} />Hapus</button>
      </div>
    </div>
    <div className="body-image-fields">
      <label className={altMissing ? 'invalid' : ''}>
        <span>Teks alternatif <em>wajib</em></span>
        <input value={attrs.alt} maxLength={LIMITS.coverAlt} placeholder="Jelaskan isi gambar untuk pembaca layar" onChange={e => updateAttributes({ alt: e.target.value })} aria-invalid={altMissing} />
      </label>
      <label>
        <span>Keterangan</span>
        <input value={attrs.caption} maxLength={LIMITS.caption} placeholder="Opsional, tampil di bawah gambar" onChange={e => updateAttributes({ caption: e.target.value })} />
      </label>
      {altMissing && <p className="field-error"><AlertCircle size={14} />Draft tidak bisa disimpan sebelum teks alternatif diisi.</p>}
    </div>
    <MediaPicker open={picking} onClose={() => setPicking(false)} selectedId={attrs.mediaDocumentId} onSelect={m => updateAttributes({ mediaDocumentId: m.documentId })} />
  </NodeViewWrapper>
}

const ArticleImage = Node.create({
  name: 'articleImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes: () => ({ mediaDocumentId: { default: '' }, alt: { default: '' }, caption: { default: '' } }),
  parseHTML: () => [{ tag: 'figure[data-article-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes, { 'data-article-image': '' })],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
})

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false, listItem: false,
    code: false, codeBlock: false, strike: false, underline: false, horizontalRule: false, trailingNode: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https'], isAllowedUri: url => safeUrl(url), HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null } },
  }),
  // Body schema: quotes hold one run of text, list items hold one paragraph (no nesting).
  Blockquote.extend({ content: 'paragraph+' }),
  ListItem.extend({ content: 'paragraph' }),
  Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Judul bagian' : 'Mulai menulis… ketik "## " untuk subjudul, "- " untuk daftar, "> " untuk kutipan') }),
  ArticleImage,
]

function Tool({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`tool ${active ? 'active' : ''}`} aria-label={label} aria-pressed={active} title={shortcut ? `${label} (${shortcut})` : label} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
}

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

function Toolbar({ editor, onInsertImage }: { editor: Editor; onInsertImage: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive('paragraph') && !e.isActive('bulletList') && !e.isActive('orderedList') && !e.isActive('blockquote'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'), italic: e.isActive('italic'), link: e.isActive('link'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
      canUndo: e.can().undo(), canRedo: e.can().redo(), empty: e.state.selection.empty,
    }),
  })
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const linkInvalid = linkDraft !== null && linkDraft !== '' && !safeUrl(linkDraft)
  const chain = () => editor.chain().focus()

  function openLink() {
    setLinkDraft((editor.getAttributes('link').href as string | undefined) ?? '')
    requestAnimationFrame(() => linkInput.current?.focus())
  }
  function applyLink() {
    if (linkDraft === null || linkInvalid) return
    if (!linkDraft) chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: linkDraft }).run()
    setLinkDraft(null)
  }

  return <div className="toolbar" role="toolbar" aria-label="Format isi artikel">
    <Tool label="Paragraf" active={state.paragraph} onClick={() => chain().setParagraph().run()}><Pilcrow size={16} /></Tool>
    <Tool label="Subjudul H2" shortcut={`${mod}+Alt+2`} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Tool>
    <Tool label="Subjudul H3" shortcut={`${mod}+Alt+3`} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Tool>
    <span className="tool-sep" />
    <Tool label="Tebal" shortcut={`${mod}+B`} active={state.bold} onClick={() => chain().toggleBold().run()}><Bold size={16} /></Tool>
    <Tool label="Miring" shortcut={`${mod}+I`} active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></Tool>
    <Tool label="Tautan" active={state.link} disabled={state.empty && !state.link} onClick={openLink}><Link2 size={16} /></Tool>
    {state.link && <Tool label="Lepas tautan" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink size={16} /></Tool>}
    <span className="tool-sep" />
    <Tool label="Daftar berpoin" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List size={16} /></Tool>
    <Tool label="Daftar bernomor" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></Tool>
    <Tool label="Kutipan" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote size={16} /></Tool>
    <Tool label="Sisipkan gambar" onClick={onInsertImage}><ImagePlus size={16} /></Tool>
    <span className="tool-spacer" />
    <Tool label="Urungkan" shortcut={`${mod}+Z`} disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 size={16} /></Tool>
    <Tool label="Ulangi" shortcut={`${mod}+Shift+Z`} disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 size={16} /></Tool>
    {linkDraft !== null && <div className="link-popover" role="group" aria-label="Edit tautan">
      <input ref={linkInput} type="url" value={linkDraft} placeholder="https://contoh.id/halaman" aria-invalid={linkInvalid}
        onChange={e => setLinkDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') { e.preventDefault(); setLinkDraft(null); editor.commands.focus() } }} />
      <button type="button" className="btn btn-sm btn-primary" disabled={linkInvalid} onClick={applyLink}>{linkDraft ? 'Pasang' : 'Hapus tautan'}</button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLinkDraft(null)}>Batal</button>
      {linkInvalid && <p className="field-error"><AlertCircle size={14} />Gunakan URL http(s) lengkap tanpa spasi.</p>}
    </div>}
  </div>
}

/** Select and scroll to `quote` (whitespace/case-insensitive, within one block). Mirrors the server's grounding check. */
function selectQuote(editor: Editor, quote: string) {
  const needle = quote.split(/\s+/).filter(Boolean).join(' ').toLowerCase()
  if (!needle) return false
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((block, blockPos) => {
    if (range) return false
    if (!block.isTextblock) return true
    // Squashed text of the block plus, per squashed char, its [start, end) document position.
    let text = ''
    const starts: number[] = []
    const ends: number[] = []
    block.descendants((child, childPos) => {
      const base = blockPos + 1 + childPos
      const raw = child.isText ? child.text ?? '' : child.type.name === 'hardBreak' ? '\n' : ''
      for (let i = 0; i < raw.length; i++) {
        const space = /\s/.test(raw[i])
        if (space && (text === '' || text.endsWith(' '))) continue
        text += space ? ' ' : raw[i].toLowerCase()
        starts.push(base + i)
        ends.push(base + i + 1)
      }
    })
    const at = text.indexOf(needle)
    if (at >= 0) range = { from: starts[at], to: ends[at + needle.length - 1] }
    return false
  })
  if (!range) return false
  editor.chain().focus().setTextSelection(range).scrollIntoView().run()
  return true
}

export interface BodyEditorHandle { highlight: (quote: string) => boolean }

/** Remount (via `key`) to load different content; edits flow out through onChange only. */
export function BodyEditor({ value, onChange, invalid, handle }: {
  value: Block[]; onChange: (value: Block[]) => void; invalid?: boolean
  /** Exposes highlight(quote) for the AI claim review. */
  handle?: Ref<BodyEditorHandle>
}) {
  const [picking, setPicking] = useState(false)
  const emit = useRef(onChange)
  useLayoutEffect(() => { emit.current = onChange })
  const editor = useEditor({
    extensions,
    content: toDoc(value),
    editorProps: { attributes: { class: 'prose', 'aria-label': 'Isi artikel', 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: e }) => emit.current(fromDoc(e.getJSON())),
  })
  useImperativeHandle(handle, () => ({ highlight: quote => !!editor && selectQuote(editor, quote) }), [editor])
  const words = countWords(bodyText(value))
  const chars = codePoints(bodyText(value))
  return <div id="field-body" className={`body-editor ${invalid ? 'invalid' : ''}`}>
    {editor && <Toolbar editor={editor} onInsertImage={() => setPicking(true)} />}
    <EditorContent editor={editor} />
    <div className="body-footer">
      <span className={words >= LIMITS.bodyWords ? 'ok' : 'under'}>{words.toLocaleString('id-ID')} kata{words < LIMITS.bodyWords ? ` · minimal ${LIMITS.bodyWords} untuk terbit` : ''}</span>
      <span className={chars > LIMITS.bodyChars ? 'over' : ''}>{chars.toLocaleString('id-ID')} / {LIMITS.bodyChars.toLocaleString('id-ID')} karakter</span>
    </div>
    <MediaPicker open={picking} onClose={() => setPicking(false)} title="Sisipkan gambar ke isi artikel"
      onSelect={m => editor?.chain().focus().insertContent({ type: 'articleImage', attrs: { mediaDocumentId: m.documentId, alt: '', caption: '' } }).run()} />
  </div>
}
