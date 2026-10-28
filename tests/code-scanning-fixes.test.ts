// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { withoutDoctype } from '../src/io/xml';
import { readCdxml } from '../src/io/cdxml';
import { textRuns } from '../src/render/chart-draw';
import { readChartXml } from '../src/io/xlsx-chart';
import { frameSvg, notesLayout } from '../src/deck/notes-pages';
import { fromCrossref } from '../src/document/references';
import { Workbook } from '../src/sheet/workbook';

describe('XML without its DOCTYPE', () => {
  it('cuts out a DOCTYPE with an internal subset, entities and all', () => {
    const t = '<?xml version="1.0"?><!DOCTYPE CDXML [<!ENTITY a "x"><!ENTITY b "&a;&a;">]><CDXML/>';
    expect(withoutDoctype(t)).toBe('<?xml version="1.0"?><CDXML/>');
    expect(withoutDoctype('<!DOCTYPE x [<!ENTITY a "]>">]><x/>')).toBe('<x/>');
    expect(withoutDoctype('<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" ><CDXML/>')).toBe('<CDXML/>');
  });

  it('refuses entity declarations it cannot cut out', () => {
    expect(() => withoutDoctype('<CDXML><!ENTITY a "x"></CDXML>')).toThrow(/entities/);
  });

  it('does not expand entities a CDXML file declares', () => {
    const lol = '<!ENTITY a "aaaaaaaaaa">' + Array.from({ length: 6 }, (_, i) => `<!ENTITY ${'b' + i} "${`&${i ? 'b' + (i - 1) : 'a'};`.repeat(10)}">`).join('');
    const t = `<?xml version="1.0"?><!DOCTYPE CDXML [${lol}]><CDXML><page><t><s>&b5;</s></t></page></CDXML>`;
    // the entity is never declared once the DOCTYPE goes, so the file is refused, not swollen
    expect(() => readCdxml(t)).toThrow();
  });
});

describe('chart titles with backslashes', () => {
  it('reads \\\\ as one backslash, so a title ending in one keeps its subscript', () => {
    expect(textRuns('C:\\\\_{2}')).toEqual([{ t: 'C:\\', pos: 'base' }, { t: '2', pos: 'sub' }]);
    expect(textRuns('a\\_b')).toEqual([{ t: 'a_b', pos: 'base' }]);
  });

  it('keeps a backslash in an Excel title', () => {
    const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>x\\</a:t></a:r><a:r><a:rPr baseline="-25000"/><a:t>2</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:cat><c:strRef><c:f>Data!$A$2:$A$5</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Data!$B$2:$B$5</c:f></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const r = readChartXml(doc, { row: 1, col: 3, dx: 0, dy: 0 }, 100, 100, 1);
    expect(textRuns(r!.chart.title!)).toEqual([{ t: 'x\\', pos: 'base' }, { t: '2', pos: 'sub' }]);
  });
});

describe('notes page text in attributes', () => {
  it('escapes quotes in a font name', () => {
    const svg = frameSvg(notesLayout({ w: 960, h: 540 }), { header: 'H', date: '', footer: '', number: '' }, 'Evil" onload="x');
    expect(svg).toContain('font-family="Evil&quot; onload=&quot;x"');
    expect(new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });
});

describe('Crossref titles', () => {
  it('drops tags nested to dodge a single pass', () => {
    expect(fromCrossref({ title: ['A <<i>i>B</i> C'] }).title).toBe('A B C');
    expect(fromCrossref({ title: ['pH &lt; 7 <sub>x</sub>'] }).title).toBe('pH < 7 x');
  });
});

describe('volatile defined names', () => {
  it('finds a name with a ? or backslash in it, and only as a whole name', () => {
    const wb = new Workbook() as unknown as { names: { name: string; formula: string }[]; usesVolatileName(t: string): boolean };
    wb.names = [{ name: 'Rate?', formula: '=TODAY()' }, { name: 'a.b', formula: '=NOW()' }];
    expect(wb.usesVolatileName('=Rate?*2')).toBe(true);
    expect(wb.usesVolatileName('=Rate*2')).toBe(false);
    expect(wb.usesVolatileName('=a.b+1')).toBe(true);
    expect(wb.usesVolatileName('=axb+1')).toBe(false);
    expect(wb.usesVolatileName('=a.bc+1')).toBe(false);
  });
});
