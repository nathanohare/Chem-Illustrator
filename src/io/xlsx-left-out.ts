// Workbook features this program neither reads nor keeps, counted on opening so that saving over
// the file doesn't lose them without a word: form and ActiveX controls, data connections and
// query tables, sheet background pictures, Excel 4 macro sheets and XML maps (ECMA-376 part 1:
// 18.3.1.21 controls, 18.13 connections, 18.12 queryTable, 18.3.1.67 picture, 18.16 XML maps;
// Microsoft's [MS-XLSX] for macro sheets). Excel also writes each form control as VML.
// Data connections are kept whole (Power Query's, which its queries refresh through), with the
// query tables of the tables they fill, unless they lead into a Data Model, which isn't kept.

import { kid, kids, type PackageReader } from './ooxml';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const REL = {
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

export const CT_QUERY_TABLE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml';

/**
 * Can the workbook's data connections be kept whole? Not when one leads into a Data Model (a
 * Power Pivot connection, or a query loaded to the model), whose data isn't kept.
 */
export function connectionsKept(pkg: PackageReader, wbPath: string): boolean {
  const r = [...pkg.rels(wbPath).values()].find((x) => x.type === REL.connections && !x.external);
  let doc: Document | null = null;
  try { doc = r ? pkg.xml(r.target) : null; } catch { doc = null; }
  if (!r || doc?.documentElement.localName !== 'connections' || pkg.rels(r.target).size) return false;
  return kids(doc.documentElement, 'connection').every((c) => c.getAttribute('type') !== '100' && c.getAttribute('name') !== 'ThisWorkbookDataModel' &&
    !Array.from(c.getElementsByTagNameNS('*', 'connection')).some((x) => x.getAttribute('model') === '1' || !!x.getAttribute('id')));
}

/** The query table part of a table a data query fills, when it can be kept (it leads to no parts of its own). */
export function queryTableOf(pkg: PackageReader, tablePath: string): string | null {
  const r = [...pkg.rels(tablePath).values()].find((x) => x.type === REL.queryTable && !x.external);
  return r && pkg.has(r.target) && !pkg.rels(r.target).size ? r.target : null;
}

export class LeftOut {
  private counts = new Map<Kind, number>();

  private add(kind: Kind, n: number): void {
    if (n > 0) this.counts.set(kind, (this.counts.get(kind) ?? 0) + n);
  }

  /**
   * The workbook's own: data connections (unless `keptConnections`) and XML maps; `sheetTypes` are
   * the relationship types of the sheets it lists.
   */
  workbook(pkg: PackageReader, wbPath: string, sheetTypes: string[], keptConnections = false): void {
    for (const r of pkg.rels(wbPath).values()) {
      if (r.external) continue;
      if (r.type === REL.connections && !keptConnections) {
        let doc: Document | null = null;
        try { doc = pkg.xml(r.target); } catch { doc = null; }
        this.add('connections', Math.max(1, kids(doc?.documentElement, 'connection').length));
      } else if (r.type === REL.xmlMaps) this.add('xmlMaps', 1);
    }
    this.add('macroSheets', sheetTypes.filter((t) => /macrosheet$/i.test(t)).length);
  }

  /**
   * A worksheet's: its controls, query tables (but those of the tables `keptQuery` says are kept)
   * and background picture. `vml` is its legacy drawing's text.
   */
  sheet(pkg: PackageReader, path: string, ws: Element, vml: string | null, keptQuery: (tablePath: string) => boolean = () => false): void {
    const rels = [...pkg.rels(path).values()];
    const count = (type: string) => rels.filter((r) => r.type === type).length;
    // (Excel 2010 and later write each form control twice: as VML, and as control properties)
    this.add('form', Math.max(vml?.match(FORM_CONTROL)?.length ?? 0, count(REL.ctrlProp)));
    this.add('activeX', count(REL.control));
    this.add('queryTables', count(REL.queryTable) + rels.filter((r) => r.type === REL.table && !r.external && !keptQuery(r.target))
      .reduce((n, r) => n + [...pkg.rels(r.target).values()].filter((x) => x.type === REL.queryTable).length, 0));
    if (kid(ws, 'picture')) this.add('background', 1);
  }

  /** What was found, for the list of what is left out. */
  items(): string[] {
    return [...this.counts].map(([kind, n]) => PHRASES[kind](n));
  }
}
