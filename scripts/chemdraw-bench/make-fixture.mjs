// Writes a CDXML test drawing (our own) that uses each property ChemDraw paste has to keep:
// ring fills (ColoredMolecularArea), per-fragment line/hash/bold widths, wedges and hashed wedges,
// bold formula-style labels, a right-aligned "PCy3" label (shown Cy3P), gray bonds crossing behind
// black ones (Z and CrossingBonds), rounded shadowed frames, a plain frame, bold and formula captions.
// Usage: node make-fixture.mjs <out.cdxml>
import fs from 'node:fs';
let id = 1000;
const nid = () => ++id;
const L = 21.6;
const atoms = [], bonds = [], extra = [];
const at = (x, y, o = {}) => { const a = { id: nid(), x, y, ...o }; atoms.push(a); return a; };
const bd = (a, b, o = {}) => { const r = { id: nid(), a: a.id, b: b.id, ...o }; bonds.push(r); return r; };
const hex = (cx, cy, start = 30) => Array.from({ length: 6 }, (_, i) => { const t = ((start + 60 * i) * Math.PI) / 180; return [cx + L * Math.cos(t), cy + L * Math.sin(t)]; });

// two fused rings (A left, B right) sharing an edge
const cx = 160, cy = 160, dx = L * Math.sqrt(3);
const pa = hex(cx, cy), pb = hex(cx + dx, cy);
const A = pa.map(([x, y]) => at(x, y));
// ring B reuses A's right edge: A[0] (30Â°) and A[5] (330Â°) are B[2] (150Â°) and B[3] (210Â°)
const B = pb.map(([x, y], i) => (i === 2 ? A[0] : i === 3 ? A[5] : at(x, y)));
const ringA = A.map((a, i) => bd(a, A[(i + 1) % 6]));
const ringB = B.map((a, i) => (i === 2 ? null : bd(a, B[(i + 1) % 6]))).filter(Boolean);
bonds.find((b) => b.a === B[0].id && b.b === B[1].id).order = 2;
// substituents: an H on a hashed wedge, an H on a wedge, a CH(OMe)2 with bold labels
const h1 = at(A[5].x, A[5].y - L, { label: 'H' });
bd(A[5], h1, { display: 'WedgedHashBegin' });
const h2 = at(A[0].x, A[0].y + L, { label: 'H' });
bd(A[0], h2, { display: 'WedgeBegin' });
const c = at(A[4].x, A[4].y - L);
bd(A[4], c);
const o1 = at(c.x - L * 0.866, c.y - L / 2, { label: 'MeO', just: 'Right' });
const o2 = at(c.x + L * 0.866, c.y - L / 2, { label: 'OMe' });
bd(c, o1); bd(c, o2);
const n = A[2]; // a ring atom is N
n.label = 'N'; n.el = 7;
const oh = at(B[0].x + L * 0.866, B[0].y - L / 2, { label: 'OH' });
bd(B[0], oh, { display: 'WedgedHashBegin' });
// a gray bridge passing behind ring B's bottom bond (B[4]-B[5] is black, higher Z)
const g1 = at(B[3].x - 4, B[3].y + 34), g2 = at(B[5].x + 18, B[5].y + 30), g3 = at(B[0].x + 22, B[0].y);
const gray = [bd(A[3], g1, { color: 4 }), bd(g1, g2, { color: 4, cross: true }), bd(g2, g3, { color: 4 }), bd(g3, B[1], { color: 4 })];
const black = bonds.find((b) => (b.a === B[4].id && b.b === B[5].id) || (b.a === B[5].id && b.b === B[4].id));
black.cross = true;

// a metal centre with a right-aligned "PCy3" (ChemDraw shows Cy3P) and a left one below
const ru = at(420, 140, { label: 'Ru', el: 44 });
const p1 = at(420, 140 - L, { label: 'PCy3', just: 'Right', align: 'Right' });
const p2 = at(420, 140 + L, { label: 'PCy3' });
const cl = at(420 - L, 140 + 6, { label: 'Cl', just: 'Right' });
bd(ru, p1); bd(ru, p2); bd(ru, cl, { display: 'WedgeEnd' });

const z = (() => { let k = 100; return () => ++k; })();
for (const a of atoms) a.z = z();
for (const b of bonds) b.z = b.color ? z() - 50 : z();
// gray bonds go behind: low Z
for (const b of gray) b.z = 10 + gray.indexOf(b);
for (const b of [gray[1], black]) b.crossWith = b === black ? gray[1].id : black.id;

const fmt = (v) => v.toFixed(2);
const lbl = (a) => {
  if (!a.label) return '';
  const j = a.just ? ` LabelJustification="${a.just}"` : '';
  const al = a.align ? ` LabelAlignment="${a.align}" Justification="${a.align}"` : '';
  return (a.label === 'PCy3' ? '>' + inner(a) : '') + `${a.label === 'PCy3' ? '' : '>'}<t p="${fmt(a.x - 3)} ${fmt(a.y + 3.6)}"${j}${al}><s font="3" size="11" color="0" face="97">${a.label}</s></t></n`;
};
const inner = (a) => { const P = ++id, X = ++id, cs = [++id, ++id, ++id]; return '<fragment id="' + (++id) + '"><n id="' + P + '" p="' + fmt(a.x) + ' ' + fmt(a.y) + '" Element="15" NumHydrogens="0"/>' + cs.map((c, i) => '<n id="' + c + '" p="' + fmt(a.x - 12 + 12 * i) + ' ' + fmt(a.y - 14) + '"/>').join('') + '<n id="' + X + '" p="' + fmt(a.x) + ' ' + fmt(a.y + 14) + '" NodeType="ExternalConnectionPoint"/>' + cs.map((c) => '<b id="' + (++id) + '" B="' + P + '" E="' + c + '"/>').join('') + '<b id="' + (++id) + '" B="' + X + '" E="' + P + '"/></fragment>'; };
const atomXml = (a) => {
  const el = a.el ? ` Element="${a.el}"` : a.label && /^(MeO|OMe|OH)$/.test(a.label) ? ' NodeType="Fragment"' : a.label === 'H' ? ' Element="1"' : a.label === 'Cl' ? ' Element="17"' : a.label === 'PCy3' ? ' NodeType="Fragment"' : '';
  return `<n id="${a.id}" p="${fmt(a.x)} ${fmt(a.y)}" Z="${a.z}"${el}${a.label ? ' NumHydrogens="0"' : ''}${a.label ? lbl(a) : '/'}>`;
};
const bondXml = (b) => `<b id="${b.id}" Z="${b.z}" B="${b.a}" E="${b.b}"${b.order ? ` Order="${b.order}"` : ''}${b.display ? ` Display="${b.display}"` : ''}${b.color ? ` color="${b.color}"` : ''}${b.crossWith ? ` CrossingBonds="${b.crossWith}"` : ''}/>`;
const ringFill = (ids, color) => `<ColoredMolecularArea id="${nid()}" bgcolor="${color}" BasisObjects="${ids.join(' ')}"/>`;

const frag = (list, aset, fills) => `<fragment id="${nid()}" Z="${z()}" LineWidth="1.30" HashSpacing="2.59" BoldWidth="2.92" MarginWidth="2.59">${list.map(atomXml).join('')}${bonds.filter((b) => aset.has(b.a)).map(bondXml).join('')}${fills}</fragment>`;
const mainAtoms = atoms.filter((a) => a.x < 380), metalAtoms = atoms.filter((a) => a.x >= 380);
const main = frag(mainAtoms, new Set(mainAtoms.map((a) => a.id)), ringFill(ringA.map((b) => b.id), 5) + ringFill([...ringB.map((b) => b.id), ringA[5].id], 6));
const metal = frag(metalAtoms, new Set(metalAtoms.map((a) => a.id)), '');

const rect = (x1, y1, x2, y2, type, more = '') => `<graphic id="${nid()}" BoundingBox="${x2} ${y2} ${x1} ${y1}" Z="${z()}" GraphicType="Rectangle" RectangleType="${type}"${more}/>`;
const cap = (x, y, runs) => `<t id="${nid()}" p="${x} ${y}" Z="${z()}">${runs}</t>`;
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >
<CDXML LabelFont="3" LabelSize="11" LabelFace="97" CaptionFont="3" CaptionSize="11" CaptionFace="97" HashSpacing="2.88" MarginWidth="2.88" LineWidth="1.44" BoldWidth="3.24" BondLength="21.60" BondSpacing="18" ChainAngle="120" color="0" bgcolor="1">
<colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="0.5020" g="0.5020" b="0.5020"/><color r="0.7451" g="1" b="0.7451"/><color r="0.7451" g="0.8588" b="1"/></colortable>
<fonttable><font id="3" charset="iso-8859-1" name="Arial"/></fonttable>
<page id="${nid()}" BoundingBox="0 0 540 300">
${main}
${metal}
${rect(70, 70, 290, 260, 'RoundEdge Shadow', ' CornerRadius="600" ShadowSize="400"')}
${rect(380, 100, 470, 190, 'Plain')}
${cap(330, 230, '<s font="3" size="11" color="0" face="1">75% (two steps)</s>')}
${cap(330, 250, '<s font="3" size="11" color="0" face="1">in </s><s font="3" size="11" color="0" face="97">C6H6</s><s font="3" size="11" color="0" face="1">, </s><s font="3" size="11" color="0" face="3">then</s><s font="3" size="11" color="0" face="1"> HCl</s>')}
</page></CDXML>
`;
fs.writeFileSync(process.argv[2], xml);
