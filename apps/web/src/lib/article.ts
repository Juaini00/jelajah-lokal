import type { Block, Inline } from './server/contracts';

export const inlineText = (nodes: Inline[]): string => (Array.isArray(nodes) ? nodes : [])
  .map(node => (node?.type === 'text' ? node.text : node?.type === 'link' && Array.isArray(node.children) ? node.children.map(child => child?.text ?? '').join('') : ''))
  .join('');

export interface OutlineItem { index: number; id: string; text: string; level: 2 | 3 }

/**
 * Stable, unique anchor ids for every H2/H3 in body order. ArticleBody and the table of contents both call this,
 * so heading ids and ToC links always agree.
 */
export function outline(blocks: Block[]): OutlineItem[] {
  const used: Record<string, number> = {};
  const items: OutlineItem[] = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
    if (block?.type !== 'heading' || (block.level !== 2 && block.level !== 3)) return;
    const text = inlineText(block.children).trim();
    if (!text) return;
    const base = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bagian';
    used[base] = (used[base] ?? 0) + 1;
    items.push({ index, id: used[base] > 1 ? `${base}-${used[base]}` : base, text, level: block.level });
  });
  return items;
}
