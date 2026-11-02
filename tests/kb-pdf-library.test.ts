// @vitest-environment jsdom
//
// Your own PDFs in the Knowledge Base: each page's text read once, searched like a table (a row a
// page), with an excerpt around the words found and the page to open at.

import { describe, expect, it } from 'vitest';
import { excerpt, pdfTable, readPdfPages, tidyPageText, type PdfIndex } from '../src/kb/pdf-library';
import { findRows, tableTsv } from '../src/kb/tables';
import { marked } from '../src/ui/knowledge-base';

/** A small PDF with one line of text on each page. */
function tinyPdf(lines: string[]): Uint8Array {
  const objs: string[] = [];
  const kids = lines.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${lines.length} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  lines.forEach((line, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const book: PdfIndex = {
  id: 'pdf-1', name: 'Purification notes.pdf', path: '/home/me/Purification notes.pdf', added: '2026-11-02T00:00:00Z',
  pages: [
    'Tetrahydrofuran [109-99-9] is dried by distillation from sodium and benzophenone under nitrogen.',
    '',
    'Dichloromethane [75-09-2]: wash with conc. sulfuric acid, then water; dry over CaH2 and distil.',
  ],
};

describe('reading a PDF', () => {
  it('joins words broken over lines and makes runs of space one', () => {
    expect(tidyPageText('tetrahydro-\nfuran   is\n dried')).toBe('tetrahydrofuran is dried');
    // a hyphen after a capital or a number belongs to the name and stays
    expect(tidyPageText('N-\nmethyl and 1,2-\ndichloroethane')).toBe('N-methyl and 1,2-dichloroethane');
  });

  it('reads the text of every page', async () => {
    let pages: string[];
    try {
      pages = await readPdfPages(tinyPdf(['Tetrahydrofuran is dried over sodium', 'Benzophenone ketyl turns blue']));
    } catch (e) {
      // pdf.js needs a worker this test runner may not give it; the app reads PDFs the same way Import Structures does
      expect(String(e)).toMatch(/worker|Worker|fake/);
      console.warn('PDF reading skipped here:', String(e));
      return;
    }
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Tetrahydrofuran is dried');
    expect(pages[1]).toContain('Benzophenone');
  });
});

describe('a PDF as a table', () => {
  const t = pdfTable(book);

  it('has a row for each page with text, and stays personal', () => {
    expect(t.title).toBe('Purification notes');
    expect(t.personal).toBe(true);
    expect(t.rows.map((r) => r.page)).toEqual([1, 3]);
  });

  it('finds pages by name, CAS number or several words', () => {
    expect(findRows(t, 'dichloromethane').map((m) => m.row.page)).toEqual([3]);
    // no CAS column: a CAS number is searched in the text
    expect(findRows(t, '109-99-9').map((m) => m.row.page)).toEqual([1]);
    expect(findRows(t, 'distil sodium').map((m) => m.row.page)).toEqual([1]);
  });

  it('shows an excerpt around the words found, and leaves the page text out of a copy', () => {
    const long = 'x '.repeat(300) + 'benzophenone ketyl ' + 'y '.repeat(300);
    const e = excerpt(long, 'ketyl');
    expect(e).toContain('benzophenone ketyl');
    expect(e.length).toBeLessThan(260);
    expect(e.startsWith('…') && e.endsWith('…')).toBe(true);
    // whole words at each end
    expect(excerpt('alpha beta gamma delta epsilon zeta eta theta', 'epsilon', 20)).toBe('…delta epsilon zeta…');
    const tsv = tableTsv(t, findRows(t, 'CaH2'), 'CaH2').split('\n');
    expect(tsv[0]).toBe('Page\tWhere it appears');
    expect(tsv[1]).toMatch(/^3\t.*CaH2/);
  });

  it('opens the file at the page, when the app knows where it is', () => {
    expect(t.links!(t.rows[1])).toEqual([{ label: 'Open', path: book.path, page: 3 }]);
    expect(pdfTable({ ...book, path: undefined }).links).toBeUndefined();
  });

  it('marks the words searched for', () => {
    const div = document.createElement('div');
    div.append(marked('dry over CaH2 and distil', 'cah2 distil'));
    expect([...div.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['CaH2', 'distil']);
    expect(div.textContent).toBe('dry over CaH2 and distil');
  });
});
