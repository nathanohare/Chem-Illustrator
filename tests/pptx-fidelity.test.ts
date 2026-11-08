// @vitest-environment jsdom
//
// PowerPoint decks kept intact: a template's artwork on its slide master and layouts and its
// theme, the order shapes and structures are stacked in, PowerPoint's own arrows and boxes,
// and structure pictures turned, flipped or changed in PowerPoint.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { writePptx, type DeckData, type PptxOptions } from '../src/io/pptx-write';
import { readPptx, type PptxRead } from '../src/io/pptx-read';
import { Package, NS, REL } from '../src/io/ooxml';
import { boxOf } from '../src/objects';
import { stackItems } from '../src/editor/stacking';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = {
  async picture(doc) {
    const pts = [...doc.atoms.values()];
    if (!pts.length) return null;
    const b = boxOf(pts);
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" data-n="${pts.length}"/>`, png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
  },
  async svgToPng() { return PNG; },
};
const u8 = (t: string) => new Uint8Array(strToU8(t));

const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const E = 12700;
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const xf = (x: number, y: number, w: number, h: number, extra = '') => `<a:xfrm${extra}><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm>`;
const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;
const box = (id: number, name: string, x: number, y: number, w: number, h: number, fill: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
const titlePh = (id: number, text: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Title ${id}"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${text ? `<a:r><a:t>${text}</a:t></a:r>` : ''}</a:p></p:txBody></p:sp>`;

interface Made { master?: string; layout?: string; slide: string; theme?: string; layoutAttrs?: string; slideAfter?: string; slideRels?: (pkg: Package, path: string) => Record<string, string> }

/** A deck shaped like one PowerPoint saves: one master, one Title Only layout, one slide. */
function powerPointDeck(m: Made): Uint8Array {
  const pkg = new Package();
  pkg.defaultType('png', 'image/png');
  pkg.defaultType('svg', 'image/svg+xml');
  pkg.relate('', REL.officeDocument, 'ppt/presentation.xml');
  const P = 'ppt/presentation.xml';
  const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
  const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
  pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
  pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.theme, '../theme/theme1.xml');
  pkg.add('ppt/theme/theme1.xml', m.theme ?? `${H}<a:theme xmlns:a="${NS.a}" name="Auburn"><a:themeElements><a:clrScheme name="Auburn"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0C2340"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="E87722"/></a:accent1><a:accent2><a:srgbClr val="0C2340"/></a:accent2></a:clrScheme>` +
    `<a:fontScheme name="Auburn"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`, ct('theme'));
  const lRel = pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  pkg.add('ppt/slideMasters/slideMaster1.xml', `${H}<p:sldMaster ${X}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}${m.master ?? ''}` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xf(40, 20, 880, 80)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Click</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${lRel}"/></p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
  pkg.relate('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster, '../slideMasters/slideMaster1.xml');
  pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="titleOnly"${m.layoutAttrs ?? ''}><p:cSld name="Title Only"><p:spTree>${GRP}${m.layout ?? ''}${titlePh(2, '')}</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  const S = 'ppt/slides/slide1.xml';
  pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  let slide = m.slide;
  for (const [k, v] of Object.entries(m.slideRels?.(pkg, S) ?? {})) slide = slide.split(k).join(v);
  pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}${titlePh(2, 'Results')}${slide}</p:spTree></p:cSld>${m.slideAfter ?? ''}</p:sld>`, ct('presentationml.slide'));
  return pkg.build();
}

/** A deck read in, saved here, and the file it saves. */
async function resave(got: PptxRead): Promise<Uint8Array> {
  const slides = got.slides.map((s) => {
    const d = new Doc();
    d.style = { ...got.master.drawing };
    d.restoreContents(s.contents);
    return { layout: s.layout, doc: d, notes: s.notes, notesKept: s.notesKept };
  });
  return writePptx({ size: got.size, master: got.master, slides } as DeckData, opts);
}

const files = (bytes: Uint8Array) => unzipSync(bytes);
const part = (bytes: Uint8Array, path: string) => strFromU8(files(bytes)[path]);

describe('a template\'s artwork and theme', () => {
  // the Auburn-style deck: a navy bar behind the white title on the master, an orange rule on the layout
  const deck = powerPointDeck({
    master: box(10, 'Navy Bar', 0, 0, 960, 110, '0C2340'),
    layout: box(11, 'Orange Rule', 0, 110, 960, 6, 'E87722'),
    slide: '',
  });

  it('keeps the master\'s and layout\'s own shapes, with the theme, and draws them', () => {
    const got = readPptx(deck);
    const art = got.master.art!;
    expect(art).toBeTruthy();
    expect(art.master!.xml).toHaveLength(1);
    expect(art.master!.xml[0]).toContain('Navy Bar');
    expect(art.layouts!['title-only']!.xml[0]).toContain('Orange Rule');
    expect(art.theme!.xml).toContain('name="Auburn"');
    // drawn as shapes, for the slide view
    const bar = art.master!.contents.shapes[0];
    expect([bar.x1, bar.y1, bar.x2, bar.y2]).toEqual([0, 0, 960, 110]);
    // and the white title still reads white (over the bar)
    expect(got.master.titleColor).toBe('#ffffff');
  });

  it('saves them back on the master and layout, and keeps the theme', async () => {
    const back = await resave(readPptx(deck));
    const master = part(back, 'ppt/slideMasters/slideMaster1.xml');
    expect(master).toContain('Navy Bar');
    // behind the placeholders
    expect(master.indexOf('Navy Bar')).toBeLessThan(master.indexOf('type="title"'));
    const layouts = Object.keys(files(back)).filter((k) => /slideLayouts\/slideLayout\d+\.xml$/.test(k)).map((k) => part(back, k));
    expect(layouts.filter((l) => l.includes('Orange Rule'))).toHaveLength(1);
    expect(part(back, 'ppt/theme/theme1.xml')).toContain('name="Auburn"');
    // and again: opened and saved a second time, nothing doubles up
    const again = readPptx(back);
    expect(again.master.art!.master!.xml).toHaveLength(1);
    expect(again.master.art!.layouts!['title-only']!.xml).toHaveLength(1);
    const twice = await resave(again);
    expect(part(twice, 'ppt/slideMasters/slideMaster1.xml').split('Navy Bar').length - 1).toBe(1);
  });

  it('keeps pictures on the master with the artwork', async () => {
    // a seal in the master's corner
    const f = files(powerPointDeck({ slide: '' }));
    const masterXml = strFromU8(f['ppt/slideMasters/slideMaster1.xml']).replace(GRP, `${GRP}<p:pic><p:nvPicPr><p:cNvPr id="20" name="Seal"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdSeal"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xf(880, 480, 60, 50)}</p:spPr></p:pic>`);
    f['ppt/slideMasters/slideMaster1.xml'] = u8(masterXml);
    f['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = u8(strFromU8(f['ppt/slideMasters/_rels/slideMaster1.xml.rels']).replace('</Relationships>', `<Relationship Id="rIdSeal" Type="${REL.image}" Target="../media/logo.png"/></Relationships>`));
    f['ppt/media/logo.png'] = PNG;
    const got = readPptx(zipSync(f));
    expect(got.master.logo).toBeFalsy();
    expect(got.master.art!.master!.rels[0].data).toMatch(/^data:image\/png;base64,/);
    const back = await resave(got);
    const master = part(back, 'ppt/slideMasters/slideMaster1.xml');
    expect(master).toContain('name="Seal"');
    const rel = /<a:blip r:embed="([^"]+)"/.exec(master)![1];
    const rels = part(back, 'ppt/slideMasters/_rels/slideMaster1.xml.rels');
    const target = new RegExp(`Id="${rel}"[^>]*Target="([^"]+)"`).exec(rels)![1];
    expect(files(back)[`ppt/${target.replace(/^(\.\.\/)+/, '')}`]).toEqual(PNG);
  });

  it('leaves the master off a layout that hides it, and keeps that', async () => {
    const deck3 = powerPointDeck({ master: box(10, 'Navy Bar', 0, 0, 960, 110, '0C2340'), layout: box(11, 'Full Bleed', 0, 0, 960, 540, 'E7E6E6'), layoutAttrs: ' showMasterSp="0"', slide: '' });
    const got = readPptx(deck3);
    expect(got.master.art!.layouts!['title-only']!.hideMaster).toBe(true);
    const back = await resave(got);
    const layout = Object.keys(files(back)).map((k) => (/slideLayout\d+\.xml$/.test(k) ? part(back, k) : '')).find((l) => l.includes('Full Bleed'))!;
    expect(layout).toContain('showMasterSp="0"');
  });

  it('gives way to a design template chosen here', async () => {
    const { applyTemplate, SLIDE_TEMPLATES } = await import('../src/deck/templates');
    const got = readPptx(deck);
    const m = applyTemplate(got.master, SLIDE_TEMPLATES[1]);
    expect(m.art).toBeUndefined();
  });

  it('keeps the theme\'s fonts in step with the master\'s', async () => {
    const got = readPptx(deck);
    const back = await resave({ ...got, master: { ...got.master, titleFont: 'Lato' } });
    const theme = part(back, 'ppt/theme/theme1.xml');
    expect(theme).toMatch(/<a:majorFont><a:latin typeface="Lato"/);
    expect(theme).toContain('name="Auburn"');
  });
});

describe('our own master, changed in PowerPoint', () => {
  it('takes PowerPoint\'s title color and fonts over what was saved, and keeps the rest', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setMaster({ ...d.master, titleColor: '#112233', footer: 'Group meeting' });
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    // PowerPoint: View > Slide Master, the title made red
    const f = files(bytes);
    const mp = 'ppt/slideMasters/slideMaster1.xml';
    const xml = strFromU8(f[mp]);
    const title = /<p:titleStyle>[\s\S]*?<\/p:titleStyle>/.exec(xml)![0];
    f[mp] = u8(xml.replace(title, title.replace(/<a:srgbClr val="112233"\/>/i, '<a:srgbClr val="C00000"/>')));
    const back = readPptx(zipSync(f));
    expect(back.master.titleColor).toBe('#c00000');
    expect(back.master.footer).toBe('Group meeting');
    // untouched: what was saved
    const same = readPptx(bytes);
    expect(same.master.titleColor).toBe('#112233');
  });
});

describe('stacking order', () => {
  // a structure saved here, with a box PowerPoint drew over it
  async function structureUnderBox(): Promise<Uint8Array> {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide('title-only');
    host.edit('Draw', () => {
      const L = host.style.bondLength;
      const a = host.addAtom(300, 300), b = host.addAtom(300 + L, 300);
      host.addBond(a.id, b.id);
    });
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    const f = files(bytes);
    const sp = 'ppt/slides/slide2.xml';
    f[sp] = u8(strFromU8(f[sp]).replace('</p:spTree>', `${box(90, 'Cover', 280, 280, 60, 40, 'FFFF00')}</p:spTree>`));
    return zipSync(f);
  }

  it('reads a box drawn over a structure in PowerPoint as over it', async () => {
    const got = readPptx(await structureUnderBox());
    const doc = new Doc();
    doc.restoreContents(got.slides[1].contents);
    const items = stackItems(doc);
    const cover = items.findIndex((it) => it.kind === 'shape');
    const atom = items.findIndex((it) => it.kind === 'atom');
    expect(cover).toBeGreaterThan(atom);
  });

  it('saves it back over the structure', async () => {
    const back = await resave(readPptx(await structureUnderBox()));
    const slide = part(back, 'ppt/slides/slide2.xml');
    const shape = slide.search(/<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="[^"]*"\/><p:cNvSpPr\/>/);
    const structure = slide.indexOf('name="Structure');
    expect(structure).toBeGreaterThan(0);
    expect(shape).toBeGreaterThan(structure);
  });

  it('leaves the usual layers alone when nothing overlaps', async () => {
    const f = files(await structureUnderBox());
    const sp = 'ppt/slides/slide2.xml';
    f[sp] = u8(strFromU8(f[sp]).replace(/name="Cover"([\s\S]*?)<a:off x="\d+" y="\d+"\/>/, `name="Cover"$1<a:off x="${700 * E}" y="${450 * E}"/>`));
    const got = readPptx(zipSync(f));
    expect(got.slides[1].contents.shapes.every((s) => s.stack === undefined)).toBe(true);
    expect(got.slides[1].contents.atoms.every((a) => a.stack === undefined)).toBe(true);
  });
});

describe('PowerPoint\'s own arrows and boxes', () => {
  const deck = powerPointDeck({
    slide: `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="6" name="Arrow 5"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xf(300, 300, 100, 0)}<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>` +
      box(7, 'Rectangle 6', 500, 300, 100, 50, '4472C4'),
  });

  it('come in marked as PowerPoint\'s', () => {
    const got = readPptx(deck);
    expect(got.slides[0].contents.arrows[0].ppt).toBe(true);
    expect(got.slides[0].contents.shapes.find((s) => s.kind === 'rect')?.ppt).toBe(true);
  });

  it('go back as PowerPoint shapes, not inside a picture', async () => {
    const back = await resave(readPptx(deck));
    const slide = part(back, 'ppt/slides/slide1.xml');
    expect(slide).toContain('<p:cxnSp>');
    expect(slide).toMatch(/<a:prstGeom prst="rect">/);
    expect(slide).not.toContain('name="Structure');
  });
});

describe('structure pictures changed in PowerPoint', () => {
  async function saved(): Promise<{ bytes: Uint8Array; atoms: { x: number; y: number }[] }> {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide('title-only');
    host.edit('Draw', () => {
      const L = host.style.bondLength;
      const a = host.addAtom(300, 300), b = host.addAtom(300 + L, 300), c = host.addAtom(300 + L, 300 + L, 8);
      host.addBond(a.id, b.id);
      host.addBond(b.id, c.id);
    });
    const atoms = d.docOf(1).contents().atoms.map((a) => ({ x: a.x, y: a.y }));
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    return { bytes, atoms };
  }
  const edit = (bytes: Uint8Array, f: (slide: string, all: Record<string, Uint8Array>) => string) => {
    const all = files(bytes);
    all['ppt/slides/slide2.xml'] = u8(f(strFromU8(all['ppt/slides/slide2.xml']), all));
    return zipSync(all);
  };

  it('come back as the structure while PowerPoint shows the picture written', async () => {
    const { bytes } = await saved();
    const got = readPptx(bytes);
    expect(got.warnings).toEqual([]);
    expect(got.slides[1].contents.atoms).toHaveLength(3);
  });

  it('come in as the new picture after Change Picture', async () => {
    const { bytes } = await saved();
    const changed = edit(bytes, (s, all) => {
      // PowerPoint's Change Picture: a new picture, its SVG gone
      all['ppt/media/new.png'] = new Uint8Array([...PNG, 1, 2, 3]);
      return s.replace(/<a:blip r:embed="([^"]+)"[\s\S]*?<\/a:blip>/, (_m, rid) => `<a:blip r:embed="${rid}"/>`);
    });
    // and its PNG replaced too
    const all = files(changed);
    const rels = strFromU8(all['ppt/slides/_rels/slide2.xml.rels']);
    const slide = strFromU8(all['ppt/slides/slide2.xml']);
    const rid = /name="Structure[\s\S]*?<a:blip r:embed="([^"]+)"/.exec(slide)![1];
    all['ppt/slides/_rels/slide2.xml.rels'] = u8(rels.replace(new RegExp(`(Id="${rid}"[^>]*Target=")[^"]+"`), '$1../media/new.png"'));
    all['ppt/media/new.png'] = new Uint8Array([...PNG, 1, 2, 3]);
    const got = readPptx(zipSync(all));
    expect(got.slides[1].contents.atoms).toHaveLength(0);
    expect(got.slides[1].contents.shapes.filter((s) => s.kind === 'picture')).toHaveLength(1);
    expect(got.warnings.join(' ')).toMatch(/picture was changed in PowerPoint/);
  });

  it('come back as the structure when only the SVG is gone (an older program saved the file)', async () => {
    const { bytes } = await saved();
    const got = readPptx(edit(bytes, (s) => s.replace(/<a:blip r:embed="([^"]+)"[\s\S]*?<\/a:blip>/, (_m, rid) => `<a:blip r:embed="${rid}"/>`)));
    expect(got.slides[1].contents.atoms).toHaveLength(3);
  });

  it('come back turned and flipped as PowerPoint shows them', async () => {
    const { bytes, atoms } = await saved();
    const turned = readPptx(edit(bytes, (s) => s.replace(/(name="Structure[\s\S]*?)<a:xfrm>/, '$1<a:xfrm rot="10800000">')));
    const a = turned.slides[1].contents.atoms;
    const mid = (p: { x: number; y: number }[]) => ({ x: (Math.min(...p.map((q) => q.x)) + Math.max(...p.map((q) => q.x))) / 2, y: (Math.min(...p.map((q) => q.y)) + Math.max(...p.map((q) => q.y))) / 2 });
    const c = mid(atoms);
    // half a turn: each atom opposite where it was, about the middle
    const o = a.find((x) => x.z === 8)!, was = atoms[2];
    expect(o.x).toBeCloseTo(2 * c.x - was.x, 1);
    expect(o.y).toBeCloseTo(2 * c.y - was.y, 1);
    const flipped = readPptx(edit(bytes, (s) => s.replace(/(name="Structure[\s\S]*?)<a:xfrm>/, '$1<a:xfrm flipH="1">')));
    const f = flipped.slides[1].contents.atoms.find((x) => x.z === 8)!;
    expect(f.x).toBeCloseTo(2 * c.x - was.x, 1);
    expect(f.y).toBeCloseTo(was.y, 1);
  });

  it('say so when PowerPoint cropped or recolored one', async () => {
    const { bytes } = await saved();
    const got = readPptx(edit(bytes, (s) => s.replace(/(name="Structure[\s\S]*?<\/a:blip>)/, '$1<a:srcRect l="20000"/>')));
    expect(got.slides[1].contents.atoms).toHaveLength(3);
    expect(got.warnings.join(' ')).toMatch(/Cropping, recoloring/);
  });
});

// ---------------------------------------------------------------- the medium findings

/** A text box with these paragraphs. */
const textBox = (id: number, paras: string, x = 100, y = 300, extra = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xf(x, y, 400, 100)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${extra}</p:spPr><p:txBody><a:bodyPr wrap="none"/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const caption = (got: PptxRead, word: string) => got.slides[0].contents.captions.find((c) => c.runs.map((r) => r.text).join('').includes(word))!;
/** A shape with text typed into it, by a word of its text. */
const inShape = (got: PptxRead, word: string) => got.slides[0].contents.shapes.find((s) => s.text?.runs.map((r) => r.text).join('').includes(word))!;

describe('groups', () => {
  const deck = powerPointDeck({
    slide: `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="Group 6"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm flipH="1"><a:off x="${100 * E}" y="${300 * E}"/><a:ext cx="${200 * E}" cy="${100 * E}"/><a:chOff x="${100 * E}" y="${300 * E}"/><a:chExt cx="${200 * E}" cy="${100 * E}"/></a:xfrm></p:grpSpPr>` +
      box(8, 'Left Box', 100, 300, 50, 50, '4472C4') +
      `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="9" name="Arrow 8"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xf(160, 325, 100, 0)}<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp></p:grpSp>`,
  });

  it('come in flipped as PowerPoint shows them, and stay grouped', () => {
    const got = readPptx(deck);
    const c = got.slides[0].contents;
    const rect = c.shapes.find((s) => s.kind === 'rect')!;
    // the box on the left now on the right, the arrow pointing left
    expect(Math.min(rect.x1, rect.x2)).toBeCloseTo(250, 1);
    expect(c.arrows[0].head.x).toBeLessThan(c.arrows[0].tail.x);
    expect(c.arrows[0].tail.x).toBeCloseTo(240, 1);
    expect(rect.grp).toBeDefined();
    expect(c.arrows[0].grp).toBe(rect.grp);
  });

  it('go back as a PowerPoint group', async () => {
    const back = await resave(readPptx(deck));
    const slide = part(back, 'ppt/slides/slide1.xml');
    expect(slide).toMatch(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="Group \d+"\/>/);
    const again = readPptx(back).slides[0].contents;
    expect(again.shapes.find((s) => s.kind === 'rect')!.grp).toBeDefined();
  });
});

describe('SmartArt', () => {
  const DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
  const DSP = 'http://schemas.microsoft.com/office/drawing/2008/diagram';
  const deck = powerPointDeck({
    slide: `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Diagram 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${200 * E}" y="${200 * E}"/><a:ext cx="${400 * E}" cy="${100 * E}"/></p:xfrm>` +
      `<a:graphic><a:graphicData uri="${DGM}"><dgm:relIds xmlns:dgm="${DGM}" r:dm="DM" r:lo="DM" r:qs="DM" r:cs="DM"/></a:graphicData></a:graphic></p:graphicFrame>`,
    slideRels: (pkg, S) => {
      const dm = pkg.relate(S, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData', '../diagrams/data1.xml');
      const dr = pkg.relate(S, 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing', '../diagrams/drawing1.xml');
      pkg.add('ppt/diagrams/data1.xml', `${H}<dgm:dataModel xmlns:dgm="${DGM}" xmlns:a="${NS.a}"><dgm:ptLst/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="${DSP}" relId="${dr}" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`, ct('drawingml.diagramData'));
      const step = (x: number, word: string) => `<dsp:sp modelId="{${word}}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr>${xf(x, 10, 150, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></dsp:spPr>` +
        `<dsp:style><a:lnRef idx="2"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="1"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></dsp:style>` +
        `<dsp:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2000"/><a:t>${word}</a:t></a:r></a:p></dsp:txBody></dsp:sp>`;
      pkg.add('ppt/diagrams/drawing1.xml', `${H}<dsp:drawing xmlns:dsp="${DSP}" xmlns:a="${NS.a}"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>${step(0, 'Extract')}${step(200, 'Purify')}</dsp:spTree></dsp:drawing>`, 'application/vnd.ms-office.drawingml.diagramDrawing+xml');
      return { DM: dm };
    },
  });

  it('comes in as shapes and text where PowerPoint drew it', () => {
    const got = readPptx(deck);
    expect(got.warnings).toContain('SmartArt came in as shapes and text.');
    // in its shape (with the text typed in it), in the frame (200 across, plus 200 in it)
    const purify = inShape(got, 'Purify');
    expect(purify).toBeTruthy();
    expect(Math.min(purify.x1, purify.x2)).toBeCloseTo(400, 0);
    expect(purify.text!.runs[0].color).toBe('#ffffff');
    const boxes = got.slides[0].contents.shapes.filter((s) => s.text);
    expect(boxes.map((b) => Math.round(Math.min(b.x1, b.x2))).sort()).toEqual([200, 400]);
  });
});

describe('text as PowerPoint formats it', () => {
  it('keeps bullet characters, numbering styles and start numbers, and saves them back', async () => {
    const deck = powerPointDeck({
      slide: textBox(5, `<a:p><a:pPr marL="285750" indent="-285750"><a:buFont typeface="Wingdings"/><a:buChar char="Ø"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Arrowhead</a:t></a:r></a:p>` +
        `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="alphaUcParenR" startAt="3"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Third</a:t></a:r></a:p>` +
        `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="alphaUcParenR" startAt="3"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Fourth</a:t></a:r></a:p>`),
    });
    const got = readPptx(deck);
    const c = caption(got, 'Arrowhead');
    expect(c.paras![0].bullet).toBe('➢');
    expect(c.paras![1]).toMatchObject({ list: 'number', numType: 'alphaUcParenR', startAt: 3 });
    expect(c.paras![2].startAt).toBeUndefined();
    const { listMarkers } = await import('../src/text/paragraphs');
    expect(listMarkers(c.paras!)).toEqual(['➢', 'C)', 'D)']);
    const slide = part(await resave(got), 'ppt/slides/slide1.xml');
    // in Wingdings, as PowerPoint wrote it (Arial has no arrowhead)
    expect(slide).toContain('<a:buFont typeface="Wingdings" pitchFamily="2" charset="2"/><a:buChar char="Ø"/>');
    expect(slide).toContain('<a:buAutoNum type="alphaUcParenR" startAt="3"/>');
    expect(slide).toContain('<a:buAutoNum type="alphaUcParenR" startAt="4"/>');
  });

  it('colors text by the shape\'s style, and spaces paragraphs given in lines', () => {
    const deck = powerPointDeck({
      slide: `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Rectangle 4"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(100, 300, 200, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
        `<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="major"><a:schemeClr val="lt1"/></a:fontRef></p:style>` +
        `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>White</a:t></a:r></a:p><a:p><a:pPr><a:spcBef><a:spcPct val="50000"/></a:spcBef></a:pPr><a:r><a:rPr lang="en-US" sz="2000"/><a:t>Below</a:t></a:r></a:p></p:txBody></p:sp>`,
    });
    const got = readPptx(deck);
    // (the text typed into the shape stays in it)
    const c = inShape(got, 'White').text!;
    expect(c.runs[0].color).toBe('#ffffff');
    // in the theme's heading font, as the style says
    expect(c.runs[0].font).toBe('Georgia');
    // half a line of 20 point text
    expect(c.paras![1].spaceBefore).toBe(12);
  });

  it('keeps language, all caps and highlighting', async () => {
    const deck = powerPointDeck({
      slide: textBox(5, `<a:p><a:r><a:rPr lang="de-DE" sz="1800" cap="all"><a:highlight><a:srgbClr val="FFFF00"/></a:highlight></a:rPr><a:t>Ausbeute</a:t></a:r></a:p>`),
    });
    const got = readPptx(deck);
    const r = caption(got, 'Ausbeute').runs[0];
    expect(r).toMatchObject({ lang: 'de-DE', allCaps: true, highlight: '#ffff00' });
    const slide = part(await resave(got), 'ppt/slides/slide1.xml');
    expect(slide).toMatch(/<a:rPr lang="de-DE"[^>]* cap="all"[^>]*>.*<a:highlight><a:srgbClr val="FFFF00"\/><\/a:highlight>/);
  });

  it('keeps slide numbers and dates in text boxes as PowerPoint\'s fields', async () => {
    const deck = powerPointDeck({
      slide: textBox(5, `<a:p><a:r><a:rPr lang="en-US"/><a:t>Slide </a:t></a:r><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>7</a:t></a:fld></a:p>`),
    });
    const got = readPptx(deck);
    const runs = caption(got, 'Slide').runs;
    expect(runs.find((r) => r.field === 'slidenum')?.text).toBe('7');
    const slide = part(await resave(got), 'ppt/slides/slide1.xml');
    expect(slide).toMatch(/<a:fld id="\{[0-9A-F-]+\}" type="slidenum"><a:rPr[\s\S]*?<\/a:rPr><a:t>7<\/a:t><\/a:fld>/);
  });

  it('reads theme colors through the slide\'s own color map', () => {
    const deck = powerPointDeck({
      slide: textBox(5, `<a:p><a:r><a:rPr lang="en-US" sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr><a:t>Inverted</a:t></a:r></a:p>`),
      slideAfter: '<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>',
    });
    expect(caption(readPptx(deck), 'Inverted').runs[0].color).toBe('#ffffff');
  });
});

describe('shapes and pictures', () => {
  it('keeps a dashed outline round a filled shape', () => {
    const deck = powerPointDeck({
      slide: `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Rectangle 4"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(100, 300, 200, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFF2CC"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr></p:sp>`,
    });
    const sh = readPptx(deck).slides[0].contents.shapes[0];
    expect(sh).toMatchObject({ filled: true, fillColor: '#fff2cc', color: '#c00000', dashed: true });
  });

  it("sits a picture in from its box's sides where PowerPoint does (less than nothing cropped)", () => {
    const deck = powerPointDeck({
      slide: `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture 4"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="IMG"/><a:srcRect l="-25000" r="-25000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xf(100, 100, 300, 100)}</p:spPr></p:pic>`,
      slideRels: (pkg, S) => {
        pkg.add('ppt/media/image1.png', PNG);
        return { IMG: pkg.relate(S, REL.image, '../media/image1.png') };
      },
    });
    const pic = readPptx(deck).slides[0].contents.shapes.find((s) => s.kind === 'picture')!;
    // the picture is two thirds of the box across, in its middle
    expect([pic.x1, pic.x2]).toEqual([150, 350]);
    expect(pic.crop).toBeUndefined();
  });
});

describe('speaker notes', () => {
  async function withNotes(body: string): Promise<Uint8Array> {
    const f = files(powerPointDeck({ slide: '' }));
    const NP = 'ppt/notesSlides/notesSlide1.xml';
    f[NP] = u8(`${H}<p:notes ${X}><p:cSld><p:spTree>${GRP}<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
    f['ppt/slides/_rels/slide1.xml.rels'] = u8(strFromU8(f['ppt/slides/_rels/slide1.xml.rels']).replace('</Relationships>', `<Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`));
    f['[Content_Types].xml'] = u8(strFromU8(f['[Content_Types].xml']).replace('</Types>', `<Override PartName="/${NP}" ContentType="${ct('presentationml.notesSlide')}"/></Types>`));
    return zipSync(f);
  }
  const formatted = '<a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>Mention</a:t></a:r><a:r><a:rPr lang="en-US"/><a:t> the yield</a:t></a:r></a:p><a:p><a:pPr marL="171450" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>then the ee</a:t></a:r></a:p>';

  it('keep their formatting through a save', async () => {
    const got = readPptx(await withNotes(formatted));
    expect(got.slides[0].notes).toBe('Mention the yield\nthen the ee');
    const back = await resave({ ...got, slides: got.slides.map((s) => ({ ...s })) });
    const notes = Object.keys(files(back)).find((k) => /notesSlides\/notesSlide\d+\.xml$/.test(k))!;
    const xml = part(back, notes);
    expect(xml).toContain('b="1"');
    expect(xml).toContain('<a:buChar char="•"/>');
  });

  it('are saved as plain text once changed', async () => {
    const got = readPptx(await withNotes(formatted));
    const host = new Doc();
    host.style = { ...got.master.drawing };
    host.restoreContents(got.slides[0].contents);
    const back = await writePptx({ size: got.size, master: got.master, slides: [{ layout: got.slides[0].layout, doc: host, notes: 'Something else', notesKept: got.slides[0].notesKept }] } as DeckData, opts);
    const notes = Object.keys(files(back)).find((k) => /notesSlides\/notesSlide\d+\.xml$/.test(k))!;
    const xml = part(back, notes);
    expect(xml).toContain('Something else');
    expect(xml).not.toContain('b="1"');
  });
});
