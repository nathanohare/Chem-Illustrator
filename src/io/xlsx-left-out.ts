// Workbook features this program neither reads nor keeps, counted on opening so that saving over
// the file doesn't lose them without a word: form and ActiveX controls, data connections and
// query tables, sheet background pictures, Excel 4 macro sheets and XML maps (ECMA-376 part 1:
// 18.3.1.21 controls, 18.13 connections, 18.12 queryTable, 18.3.1.67 picture, 18.16 XML maps;
// Microsoft's [MS-XLSX] for macro sheets). Excel also writes each form control as VML.

import { kid, kids, type PackageReader } from './ooxml';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const REL = {
  ctrlProp: R + 'ctrlProp',
  control: R + 'control',
  queryTable: R + 'queryTable',
  table: R + 'table',
  connections: R + 'connections',
  xmlMaps: R + 'xmlMaps',
};

/** VML form controls by their kind (buttons, check boxes, lists…; notes and pictures are other things). */
const FORM_CONTROL = /ObjectType="(?:Button|Checkbox|Drop|List|Radio|Spin|Scroll|Label|GBox|Edit|Dialog)"/g;

type Kind = 'form' | 'activeX' | 'connections' | 'queryTables' | 'background' | 'macroSheets' | 'xmlMaps';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const PHRASES: Record<Kind, (n: number) => string> = {
  form: (n) => `${plural(n, 'form control', 'form controls')} (buttons, check boxes, lists)`,
  activeX: (n) => plural(n, 'ActiveX control', 'ActiveX controls'),
  connections: (n) => plural(n, 'data connection', 'data connections'),
  queryTables: (n) => `${plural(n, 'query table\'s link', 'query tables\' links')} to the data ${n === 1 ? 'it was' : 'they were'} imported from`,
  background: (n) => plural(n, 'sheet background picture', 'sheet background pictures'),
  macroSheets: (n) => `${plural(n, 'Excel 4 macro sheet', 'Excel 4 macro sheets')} (opened as ${n === 1 ? 'an ordinary sheet' : 'ordinary sheets'})`,
  xmlMaps: () => 'XML maps',
};

export class LeftOut {
  private counts = new Map<Kind, number>();

  private add(kind: Kind, n: number): void {
    if (n > 0) this.counts.set(kind, (this.counts.get(kind) ?? 0) + n);
  }

  /** The workbook's own: data connections and XML maps; `sheetTypes` are the relationship types of the sheets it lists. */
  workbook(pkg: PackageReader, wbPath: string, sheetTypes: string[]): void {
    for (const r of pkg.rels(wbPath).values()) {
      if (r.external) continue;
      if (r.type === REL.connections) {
        let doc: Document | null = null;
        try { doc = pkg.xml(r.target); } catch { doc = null; }
        this.add('connections', Math.max(1, kids(doc?.documentElement, 'connection').length));
      } else if (r.type === REL.xmlMaps) this.add('xmlMaps', 1);
    }
    this.add('macroSheets', sheetTypes.filter((t) => /macrosheet$/i.test(t)).length);
  }

  /** A worksheet's: its controls, query tables and background picture. `vml` is its legacy drawing's text. */
  sheet(pkg: PackageReader, path: string, ws: Element, vml: string | null): void {
    const rels = [...pkg.rels(path).values()];
    const count = (type: string) => rels.filter((r) => r.type === type).length;
    // (Excel 2010 and later write each form control twice: as VML, and as control properties)
    this.add('form', Math.max(vml?.match(FORM_CONTROL)?.length ?? 0, count(REL.ctrlProp)));
    this.add('activeX', count(REL.control));
    this.add('queryTables', count(REL.queryTable) + rels.filter((r) => r.type === REL.table && !r.external)
      .reduce((n, r) => n + [...pkg.rels(r.target).values()].filter((x) => x.type === REL.queryTable).length, 0));
    if (kid(ws, 'picture')) this.add('background', 1);
  }

  /** What was found, for the list of what is left out. */
  items(): string[] {
    return [...this.counts].map(([kind, n]) => PHRASES[kind](n));
  }
}
