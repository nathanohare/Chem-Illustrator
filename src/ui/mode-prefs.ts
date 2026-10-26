// Settings for the document and sheet views, kept apart from their code so start-up needn't load it.

/** The document's settings boxes (Paragraph, Style, Page Setup, Header and Footer). */
export type DocBoxKey = 'para' | 'style' | 'page' | 'hf';
export const DOC_BOXES: DocBoxKey[] = ['para', 'style', 'page', 'hf'];

/** The boxes pinned open in the side panel (kept with the settings). */
export const docBoxPrefs: { pinned: DocBoxKey[]; changed?: () => void } = { pinned: [] };

export function parseDocPins(raw: unknown): DocBoxKey[] {
  return Array.isArray(raw) ? DOC_BOXES.filter((k) => raw.includes(k)) : [];
}

/** View > Ruler in documents. */
export const docRulerPrefs: { shown: boolean; changed?: () => void } = { shown: false };

/** View > Formula Bar in sheets. */
export const formulaBarPrefs: { shown: boolean; changed?: () => void } = { shown: true };
