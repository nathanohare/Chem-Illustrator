// Your own PDFs in the Knowledge Base: a book such as Purification of Laboratory Chemicals, papers,
// SI files. Each PDF's text is read once, page by page, and kept on this computer only (never in the
// program or shared); the window then searches it like any table, by name, CAS number or shift, and
// shows the page and an excerpt around the words found.

import type { Cell, KbTable } from './tables';
export { excerpt } from './tables';

/** A PDF's pages as text, kept on this computer. */
export interface PdfIndex {
  id: string;
  name: string;
  /** Where the file is on this computer (desktop app), to open it again. */
  path?: string;
  added: string;
  pages: string[];
}

/** The text of every page of a PDF, with words broken over lines joined again ("tetrahydro- furan"). */
export async function readPdfPages(bytes: Uint8Array, progress: (done: number, of: number) => void = () => {}): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  }
  const task = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const it of content.items) {
        if (!('str' in it)) continue;
        text += it.str + (it.hasEOL ? '\n' : '');
      }
      pages.push(tidyPageText(text));
      page.cleanup();
      if (n % 10 === 0 || n === pdf.numPages) progress(n, pdf.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** One line of text per page: words hyphenated over a line break joined, runs of space made one. */
export function tidyPageText(text: string): string {
  return text
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
    // a hyphen after a capital or a number belongs to the name (N-methyl, 1,2-dichloroethane)
    .replace(/([\p{Lu}\d])-\n/gu, '$1-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A PDF as a Knowledge Base table: one row a page. */
export function pdfTable(p: PdfIndex): KbTable {
  return {
    id: p.id,
    title: p.name.replace(/\.pdf$/i, ''),
    about: `Your PDF, ${p.pages.length} pages, searched on this computer only. Search a name, CAS number or shift to find the pages it is on.`,
    columns: [
      { key: 'page', label: 'Page', numeric: true, narrow: true },
      { key: 'text', label: 'Text', hidden: true },
      { key: 'excerpt', label: 'Where it appears', excerptOf: 'text' },
    ],
    rows: p.pages.map((text, i): Record<string, Cell> => ({ page: i + 1, text })).filter((r) => r.text),
    sources: [{ label: p.path ? `Your file: ${p.path}` : `Your file: ${p.name}` }],
    personal: true,
    pdf: { path: p.path },
    ...(p.path ? { links: (row: Record<string, Cell>) => [{ label: 'Open', path: p.path, page: Number(row.page) }] } : {}),
  };
}
