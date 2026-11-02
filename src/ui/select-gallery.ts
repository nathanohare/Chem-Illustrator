// Ribbon galleries in Word's style, built over the ribbon's own lists of choices. A <select> in
// a .rb-selgal box becomes a button with an icon (Margins ▾, Orientation ▾, Themes ▾…) whose
// drop-down shows each choice with a small picture of it: the margins on a page, the theme's
// fonts and colours, the columns of text. The select stays (hidden) as the place the choice
// lives, so the code that fills it, reads it and keeps it up to date works as it did; picking a
// picture sets the select and fires its change.
//
//   <div class="rb-fly rb-selgal" data-name="Margins" data-ic="page-margins" data-pic="margins"
//        title="…"><select id="doc-margins" data-doc-prefix="margins">…</select></div>
//
// data-size="small" makes a small button (with a 16-px icon) for a column of three;
// data-gal="grid" lays the pictures out as tiles, as Word's Themes and Style Sets are.

import { PARA_SPACINGS, STYLE_SETS, THEME_COLORS, THEME_FONTS, THEMES } from '../document/themes';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const svg = (w: number, h: number, body: string) => `<svg class="gal-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
/** A sheet of paper, w × h, at (x, y). */
const paper = (x: number, y: number, w: number, h: number) => `<rect class="gal-paper" x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="1"/>`;
/** Grey lines of text filling a box. */
function lines(x: number, y: number, w: number, h: number, gap = 4, last = 0.6): string {
  let s = '';
  const n = Math.max(1, Math.floor(h / gap));
  for (let i = 0; i < n; i++) s += `<rect class="gal-text" x="${x}" y="${(y + i * gap).toFixed(1)}" width="${(i === n - 1 ? w * last : w).toFixed(1)}" height="1.5"/>`;
  return s;
}

/** Text turned to an angle (degrees, counterclockwise as Excel counts), or its letters stacked, with an arrow along it. */
export function textAnglePic(deg: number, stacked = false, size = 20): string {
  if (stacked) return `<svg class="gal-svg" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><text class="gal-ab" x="8" y="7.5" text-anchor="middle">a</text><text class="gal-ab" x="8" y="13.5" text-anchor="middle">b</text><path class="gal-arrow" d="M15 3.5v13M13.25 14.5L15 16.5l1.75-2"/></svg>`;
  return `<svg class="gal-svg" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><g transform="rotate(${-deg} 10 10)"><text class="gal-ab" x="8.5" y="9.5" text-anchor="middle">ab</text><path class="gal-arrow" d="M3.5 13h13M14.5 11.25l2 1.75-2 1.75"/></g></svg>`;
}

const MARGINS: Record<string, [number, number]> = { normal: [1, 1], narrow: [0.5, 0.5], moderate: [1, 0.75], wide: [1, 2] };
const WRAPS: Record<string, string> = {
  inline: lines(3, 6, 26, 4, 4, 1) + '<rect class="gal-acc" x="3" y="12" width="10" height="9" rx="1"/>' + lines(15, 18, 14, 2, 4, 1) + lines(3, 25, 26, 4, 4, 0.7),
  square: lines(3, 5, 26, 4, 4, 1) + '<rect class="gal-acc" x="3" y="10" width="11" height="10" rx="1"/>' + lines(17, 10, 12, 10, 4, 1) + lines(3, 23, 26, 6, 4, 0.7),
  topBottom: lines(3, 5, 26, 4, 4, 1) + '<rect class="gal-acc" x="9" y="10" width="13" height="10" rx="1"/>' + lines(3, 23, 26, 6, 4, 0.7),
  behind: '<rect class="gal-acc gal-soft" x="8" y="8" width="16" height="15" rx="1"/>' + lines(3, 5, 26, 24, 4, 0.7),
  front: lines(3, 5, 26, 24, 4, 0.7) + '<rect class="gal-acc" x="8" y="8" width="16" height="15" rx="1"/>',
};

/** The small picture of each choice, by the gallery's data-pic and the option's value ('' for none). */
const PICS: Record<string, (v: string) => string> = {
  margins: (v) => {
    const m = MARGINS[v];
    if (!m) return '';
    const k = 4, [tb, lr] = m;
    return svg(36, 46, paper(0, 0, 36, 46) + `<rect class="gal-guide" x="${(lr * k).toFixed(1)}" y="${(tb * k).toFixed(1)}" width="${(34 - 2 * lr * k).toFixed(1)}" height="${(44 - 2 * tb * k).toFixed(1)}"/>` + lines(lr * k + 2, tb * k + 3, 34 - 2 * lr * k - 4, 44 - 2 * tb * k - 4, 4));
  },
  orient: (v) => (v === 'portrait' ? svg(36, 46, paper(4, 1, 28, 36) + lines(8, 6, 20, 28, 4)) : v === 'landscape' ? svg(36, 46, paper(0, 8, 36, 28) + lines(4, 13, 28, 20, 4)) : ''),
  paper: (v) => (v === 'letter' ? svg(36, 46, paper(4, 1, 28.5, 37) + '<text class="gal-cap" x="18" y="44" text-anchor="middle">8.5×11</text>') : v === 'a4' ? svg(36, 46, paper(4.5, 0, 27.5, 39) + '<text class="gal-cap" x="18" y="45" text-anchor="middle">A4</text>') : ''),
  columns: (v) => {
    const n = Number(v);
    if (!(n >= 1 && n <= 4)) return '';
    const w = (26 - (n - 1) * 2) / n;
    let s = paper(0, 0, 36, 46);
    for (let i = 0; i < n; i++) s += lines(5 + i * (w + 2), 6, w, 34, 4, i === n - 1 ? 0.5 : 1);
    return svg(36, 46, s);
  },
  numbers: (v) => {
    const m = /^(header|footer)-(left|center|right)$/.exec(v);
    if (!m && v !== 'none') return '';
    let s = paper(0, 0, 36, 46) + lines(6, 11, 24, 24, 4);
    if (m) {
      const x = m[2] === 'left' ? 7 : m[2] === 'center' ? 18 : 29;
      s += `<text class="gal-num" x="${x}" y="${m[1] === 'header' ? 8 : 43}" text-anchor="middle">1</text>`;
    }
    return svg(36, 46, s);
  },
  breaks: (v) => {
    const pic: Record<string, string> = {
      page: paper(2, 2, 32, 18) + lines(6, 6, 24, 12, 4) + '<path class="gal-cut" d="M0 23h36"/>' + paper(2, 26, 32, 18) + lines(6, 30, 24, 4, 4),
      column: paper(0, 2, 36, 42) + lines(4, 7, 13, 32, 4, 1) + lines(20, 7, 13, 12, 4, 1) + '<path class="gal-cut" d="M20 22h12"/>',
      nextPage: paper(2, 2, 32, 18) + lines(6, 6, 24, 8, 4) + '<path class="gal-cut gal-sec" d="M0 23h36"/>' + paper(2, 26, 32, 18) + lines(6, 30, 24, 8, 4),
      continuous: paper(0, 2, 36, 42) + lines(4, 7, 28, 12, 4) + '<path class="gal-cut gal-sec" d="M0 22h36"/>' + lines(4, 26, 13, 14, 4, 1) + lines(20, 26, 13, 14, 4, 1),
      evenPage: paper(2, 2, 32, 42) + '<text class="gal-cap" x="18" y="27" text-anchor="middle">2 4</text>' + '<path class="gal-cut gal-sec" d="M2 10h32"/>',
      oddPage: paper(2, 2, 32, 42) + '<text class="gal-cap" x="18" y="27" text-anchor="middle">1 3</text>' + '<path class="gal-cut gal-sec" d="M2 10h32"/>',
    };
    return pic[v] ? svg(36, 46, pic[v]) : '';
  },
  textdir: (v) => (v === 'horz' ? textAnglePic(0) : v === 'vert' ? textAnglePic(-90) : v === 'vert270' ? textAnglePic(90) : ''),
  tcols: (v) => {
    const n = Number(v);
    if (!(n >= 1 && n <= 3)) return '';
    const w = (14 - (n - 1) * 2) / n;
    let o = '<rect class="gal-paper" x="1.5" y="2.5" width="17" height="15" rx="1"/>';
    for (let i = 0; i < n; i++) o += lines(3 + i * (w + 2), 5, w, 11, 3, 1);
    return svg(20, 20, o);
  },
  fit: (v) => ({
    grow: svg(20, 20, '<rect class="gal-acc gal-soft" x="2.5" y="2.5" width="15" height="15" rx="1"/>' + lines(5, 5.5, 10, 10, 3, 0.6) + '<path class="gal-arrow" d="M10 17.5v2"/>'),
    shrink: svg(20, 20, '<rect class="gal-paper" x="2.5" y="2.5" width="15" height="15" rx="1"/><text class="gal-ab" x="10" y="12" text-anchor="middle" style="font-size:6px">Aa</text><path class="gal-arrow" d="M14 6l2-2M14 4h2v2"/>'),
    fixed: svg(20, 20, '<rect class="gal-paper" x="2.5" y="2.5" width="15" height="12" rx="1"/>' + lines(5, 5.5, 10, 13, 3, 0.6)),
  } as Record<string, string>)[v] ?? '',
  wrap: (v) => (WRAPS[v] ? svg(32, 32, WRAPS[v]) : ''),
  watermark: (v) => {
    if (!/^\d+$/.test(v)) return '';
    return svg(36, 46, paper(0, 0, 36, 46) + lines(5, 6, 26, 34, 4) + `<text class="gal-wm" x="18" y="25" text-anchor="middle" transform="rotate(-50 18 23)">WATERMARK</text>`);
  },
  theme: (v) => {
    const t = THEMES.find((x) => x.name === v);
    if (!t) return '';
    const f = THEME_FONTS.find((x) => x.name === t.fonts)!, c = THEME_COLORS.find((x) => x.name === t.colors)!;
    return themeTile(f.heading, c);
  },
  colors: (v) => {
    const c = THEME_COLORS.find((x) => x.name === v);
    if (!c) return '';
    return svg(78, 14, c.accents.map((a, i) => `<rect x="${i * 13}" y="0" width="12" height="14" rx="1.5" fill="${a}"/>`).join(''));
  },
  fonts: (v) => {
    const f = THEME_FONTS.find((x) => x.name === v);
    if (!f) return '';
    return `<span class="gal-aa" style="font-family:'${esc(f.heading)}',serif">Aa</span>`;
  },
  styleset: (v) => {
    const st = STYLE_SETS.find((x) => x.name === v);
    if (!st) return '';
    const s = st.styles;
    const align = (a?: string, w = 30) => (a === 'center' ? (44 - w) / 2 : 7);
    const title = s.Title ?? {}, h1 = s.Heading1 ?? {}, body = s.Normal ?? {};
    const tw = 18 + ((title.size ?? 18) - 14);
    let out = paper(0, 0, 44, 56);
    out += `<rect class="gal-head" x="${align(title.align, tw)}" y="6" width="${tw}" height="${title.bold === false ? 2.5 : 3.5}"/>`;
    const gap = 3 + 2 * (body.line ?? 1.1), indent = body.firstLine ? 3 : 0;
    let y = 14 + (body.spaceAfter ?? 6) / 6;
    out += `<rect class="gal-head" x="${align(h1.align, 16)}" y="${y.toFixed(1)}" width="16" height="${h1.bold === false ? 1.75 : 2.5}"/>`;
    y += 6;
    for (let p = 0; p < 2 && y < 50; p++) {
      for (let i = 0; i < 3 && y < 52; i++, y += gap) out += `<rect class="gal-text" x="${7 + (i === 0 ? indent : 0)}" y="${y.toFixed(1)}" width="${(i === 2 ? 18 : 30 - (i === 0 ? indent : 0)).toFixed(1)}" height="1.5"/>`;
      y += (body.spaceAfter ?? 6) / 3;
    }
    return svg(44, 56, out);
  },
  spacing: (v) => {
    const p = PARA_SPACINGS.find((x) => x.name === v);
    if (!p) return '';
    let s = '', y = 3;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 2; i++, y += 3 + p.line * 2.5) s += `<rect class="gal-text" x="2" y="${y.toFixed(1)}" width="${i ? 18 : 28}" height="1.5"/>`;
      y += p.spaceAfter / 2;
    }
    return svg(32, 30, s);
  },
};

function themeTile(font: string, c: { heading: string; accents: string[] }): string {
  return `<span class="gal-theme"><span class="gal-aa" style="font-family:'${esc(font)}',serif;color:${c.heading}">Aa</span>` +
    svg(54, 6, c.accents.map((a, i) => `<rect x="${i * 9}" y="0" width="8" height="6" rx="1" fill="${a}"/>`).join('')) + '</span>';
}

/** "Normal (1 in)" → the name, and its details in lighter type. */
function label(text: string): string {
  const m = /^(.*?)\s*\((.+)\)$/.exec(text);
  return m ? `<span class="gal-name">${esc(m[1])}</span><span class="gal-sub">${esc(m[2])}</span>` : `<span class="gal-name">${esc(text)}</span>`;
}

function fill(menu: HTMLElement, sel: HTMLSelectElement, pic: ((v: string) => string) | undefined): void {
  const grid = menu.dataset.gal === 'grid';
  const items: string[] = [];
  const tail: string[] = [];
  for (const o of sel.options) {
    if (o.hidden) continue;
    const p = pic?.(o.value) ?? '';
    const on = o.value === sel.value && o.value !== '';
    const html = `<button type="button" role="menuitemradio" aria-checked="${on}" class="gal-it${on ? ' on' : ''}${p ? '' : ' gal-plain'}" data-v="${esc(o.value)}"${o.title ? ` title="${esc(o.title)}"` : ''}${o.disabled ? ' disabled' : ''}>${p ? `<span class="gal-pic">${p}</span>` : ''}<span class="gal-words">${label(o.textContent ?? '')}</span></button>`;
    (p || !pic || !items.length ? items : tail).push(html);
  }
  menu.innerHTML = `<div class="gal-items${grid ? ' gal-grid' : ''}">${items.join('')}</div>${tail.length ? `<hr/>${tail.join('')}` : ''}`;
}

/** Turn every .rb-selgal box's select into a gallery button (once, before the icons are put on). */
export function buildSelectGalleries(root: ParentNode = document): void {
  for (const box of root.querySelectorAll<HTMLElement>('.rb-selgal')) {
    const sel = box.querySelector<HTMLSelectElement>(':scope > select');
    if (!sel || box.querySelector(':scope > .rb-fly-btn')) continue;
    sel.hidden = true;
    sel.tabIndex = -1;
    const small = box.dataset.size === 'small', iconOnly = box.dataset.size === 'icon';
    const name = esc(box.dataset.name ?? '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${iconOnly ? 'rb-sq rb-iconsel' : small ? 'rb-labelled' : 'rb-big'} rb-fly-btn`;
    if (iconOnly) btn.setAttribute('aria-label', box.dataset.name ?? '');
    if (box.dataset.ic) btn.dataset.ic = box.dataset.ic;
    btn.title = box.title;
    box.removeAttribute('title');
    btn.innerHTML = iconOnly ? '<span class="rb-lead"></span><span class="rb-caret">▾</span>' : small ? `<span class="rb-lead"></span>${name} ▾` : `<span class="rb-icon"></span>${name} ▾`;
    const menu = document.createElement('div');
    menu.className = 'rb-fly-menu rb-gal-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    if (box.dataset.gal) menu.dataset.gal = box.dataset.gal;
    box.append(btn, menu);
    const pic = PICS[box.dataset.pic ?? ''];
    menu.addEventListener('rb-fly-open', () => fill(menu, sel, pic));
    menu.addEventListener('click', (e) => {
      const it = (e.target as HTMLElement).closest<HTMLButtonElement>('.gal-it');
      if (!it || it.disabled) return;
      sel.value = it.dataset.v!;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // a list that can't be used now (Wrap Text with nothing picked) greys its button
    btn.disabled = sel.disabled;
    new MutationObserver(() => { btn.disabled = sel.disabled; }).observe(sel, { attributes: true, attributeFilter: ['disabled'] });
  }
}

/** Page Color as Word's: a few paper colours, More Colors… (the colour input) and No Color. */
export function buildColourGalleries(root: ParentNode = document): void {
  for (const box of root.querySelectorAll<HTMLElement>('.rb-colgal')) {
    const input = box.querySelector<HTMLInputElement>('input[type=color]');
    const grid = box.querySelector<HTMLElement>('.gal-swatches');
    if (!input || !grid || grid.childElementCount) continue;
    for (const c of (grid.dataset.colours ?? '').split(/\s+/).filter(Boolean)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gal-swatch';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => { input.value = c; input.dispatchEvent(new Event('change', { bubbles: true })); });
      grid.append(b);
    }
    box.querySelector<HTMLButtonElement>('.gal-more')?.addEventListener('click', () => input.click());
  }
}
