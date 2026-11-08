// Design templates for slide decks (Design > Templates): calm, flat colour schemes, mostly greys
// and blues with a few brighter ones, each with a pair of fonts that come with the app and a
// simple shape behind every slide. Content slides always have a light background, so structures
// (drawn in black) read well; a few templates give the title slide a dark background of its own.
//
// A template changes only the look: fonts, colours, background and shapes. The logo, footer,
// slide numbers and the drawing style of structures stay as they are, and every value can be
// changed afterwards in Format > Slides > Slide Master.

import { DECORS, type Master, type Decor } from './deck';

export interface SlideTemplate {
  id: string;
  name: string;
  /** Where it shows in the gallery: the ready-made groups, or your own themes. */
  group: 'Light' | 'Dark title slide' | 'Bright' | 'Minimal' | 'Bold' | 'Classic' | 'Chemistry' | 'Mine';
  background: string;
  titleFont: string;
  bodyFont: string;
  titleColor: string;
  textColor: string;
  footerColor: string;
  accent: string;
  accent2: string;
  decor: Decor;
  titleBold?: boolean;
  titleSlide?: Master['titleSlide'];
}

const T = (id: string, name: string, group: SlideTemplate['group'], t: Omit<SlideTemplate, 'id' | 'name' | 'group'>): SlideTemplate => ({ id, name, group, ...t });

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  // ---------------- light: greys and blues
  T('plain', 'Plain', 'Light', { background: '#ffffff', titleFont: 'Arial', bodyFont: 'Arial', titleColor: '#000000', textColor: '#000000', footerColor: '#7f7f7f', accent: '#2f6fdf', accent2: '#9aa5b1', decor: 'none' }),
  T('slate-rule', 'Slate Rule', 'Light', { background: '#ffffff', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#1f2a37', textColor: '#374151', footerColor: '#8a94a3', accent: '#3b5b7d', accent2: '#c7d0da', decor: 'title-rule' }),
  T('harbor', 'Harbor', 'Light', { background: '#ffffff', titleFont: 'Source Sans 3', bodyFont: 'Source Sans 3', titleColor: '#1d3a5f', textColor: '#2b3440', footerColor: '#7d8896', accent: '#2f5d8a', accent2: '#a9bfd6', decor: 'top-bar' }),
  T('steel-band', 'Steel Band', 'Light', { background: '#ffffff', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#ffffff', textColor: '#2a3038', footerColor: '#7f8893', accent: '#3d4f63', accent2: '#aab6c3', decor: 'title-band' }),
  T('mist', 'Mist', 'Light', { background: '#f4f6f8', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#24313f', textColor: '#34404d', footerColor: '#8592a0', accent: '#6b8096', accent2: '#c5cfda', decor: 'left-strip' }),
  T('graphite-frame', 'Graphite Frame', 'Light', { background: '#ffffff', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#25282d', textColor: '#3a3e45', footerColor: '#8b9098', accent: '#4a4f57', accent2: '#c4c8ce', decor: 'frame' }),
  T('navy-footer', 'Navy Footer', 'Light', { background: '#ffffff', titleFont: 'Source Sans 3', bodyFont: 'Source Sans 3', titleColor: '#1f3552', textColor: '#2c3542', footerColor: '#ffffff', accent: '#1f3552', accent2: '#8fa4bf', decor: 'footer-band' }),
  T('paper-serif', 'Paper', 'Light', { background: '#fbfaf7', titleFont: 'Source Serif 4', bodyFont: 'Source Sans 3', titleColor: '#2e2a24', textColor: '#3d3830', footerColor: '#958c7e', accent: '#7a6a55', accent2: '#d6cdbf', decor: 'title-rule', titleBold: false }),
  T('notebook', 'Lab Notebook', 'Light', { background: '#fdfdfb', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#1f3f47', textColor: '#2e3a3d', footerColor: '#7f9196', accent: '#2d6a7a', accent2: '#a8c8cf', decor: 'left-strip' }),
  T('sage', 'Sage', 'Light', { background: '#f6f8f5', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#2f3d31', textColor: '#3a443b', footerColor: '#869084', accent: '#5f7a63', accent2: '#c3d1c4', decor: 'top-bar' }),
  T('fog-corner', 'Fog Corner', 'Light', { background: '#ffffff', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#2b3746', textColor: '#3b4655', footerColor: '#8d97a4', accent: '#8a9bb0', accent2: '#d5dce5', decor: 'corner' }),
  T('academic', 'Academic', 'Light', { background: '#ffffff', titleFont: 'Merriweather', bodyFont: 'Source Sans 3', titleColor: '#2a1f22', textColor: '#33302f', footerColor: '#8f8786', accent: '#7a1f2b', accent2: '#d9b8bc', decor: 'title-rule' }),
  // ---------------- dark title slide, light content slides
  T('midnight', 'Midnight', 'Dark title slide', { background: '#ffffff', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#0f1b2d', textColor: '#2a3442', footerColor: '#8a94a3', accent: '#4c8bf5', accent2: '#1d2c44', decor: 'top-bar',
    titleSlide: { background: '#0f1b2d', titleColor: '#ffffff', textColor: '#c9d4e3' } }),
  T('charcoal', 'Charcoal', 'Dark title slide', { background: '#ffffff', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#23272e', textColor: '#353a42', footerColor: '#8b9098', accent: '#6c7a89', accent2: '#3a414b', decor: 'title-rule',
    titleSlide: { background: '#23272e', titleColor: '#f2f4f7', textColor: '#c3c9d1' } }),
  T('deep-blue', 'Deep Blue', 'Dark title slide', { background: '#ffffff', titleFont: 'Source Sans 3', bodyFont: 'Source Sans 3', titleColor: '#1d3557', textColor: '#2b3545', footerColor: '#7f8a99', accent: '#1d3557', accent2: '#7d9cc0', decor: 'left-strip',
    titleSlide: { background: '#1d3557', titleColor: '#ffffff', textColor: '#cfdced' } }),
  T('slate-dark', 'Slate', 'Dark title slide', { background: '#f7f8fa', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#2f3a45', textColor: '#38424d', footerColor: '#8a939d', accent: '#8fb3c9', accent2: '#2f3a45', decor: 'corner',
    titleSlide: { background: '#2f3a45', titleColor: '#ffffff', textColor: '#cdd6df' } }),
  // ---------------- brighter
  T('navy-orange', 'Navy and Orange', 'Bright', { background: '#ffffff', titleFont: 'Montserrat', bodyFont: 'Source Sans 3', titleColor: '#0c2340', textColor: '#26303d', footerColor: '#7f8996', accent: '#e87722', accent2: '#0c2340', decor: 'top-bar' }),
  T('teal', 'Teal', 'Bright', { background: '#ffffff', titleFont: 'Montserrat', bodyFont: 'Lato', titleColor: '#ffffff', textColor: '#25363a', footerColor: '#7b8d90', accent: '#0f8b80', accent2: '#9fd6cf', decor: 'title-band' }),
  T('coral', 'Coral', 'Bright', { background: '#ffffff', titleFont: 'Montserrat', bodyFont: 'Lato', titleColor: '#3a2622', textColor: '#3a3332', footerColor: '#958a88', accent: '#e4572e', accent2: '#f5c3b3', decor: 'left-strip' }),
  T('violet', 'Violet', 'Bright', { background: '#ffffff', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#2d2147', textColor: '#353042', footerColor: '#8e889c', accent: '#6c4ab6', accent2: '#cfc2ee', decor: 'title-rule' }),
  T('sunrise', 'Sunrise', 'Bright', { background: '#fffaf2', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#3b2a1a', textColor: '#3d342b', footerColor: '#9a8d7e', accent: '#f2a541', accent2: '#f2545b', decor: 'corner' }),
  // ---------------- minimal: thin lines, lots of white
  T('hairline', 'Hairline', 'Minimal', { background: '#f4f4f1', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#111111', textColor: '#333333', footerColor: '#999999', accent: '#b08d57', accent2: '#b08d57', decor: 'hairlines',
    titleSlide: { background: '#1d1d1d', titleColor: '#ffffff', textColor: '#d6d3cc' } }),
  T('cobalt-tab', 'Cobalt Tab', 'Minimal', { background: '#f1f4fb', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#14213d', textColor: '#2b3445', footerColor: '#8a93a3', accent: '#3d6df2', accent2: '#c9d6f7', decor: 'title-tab',
    titleSlide: { background: '#14213d', titleColor: '#ffffff', textColor: '#c9d6f7' } }),
  T('ink', 'Ink', 'Minimal', { background: '#f6f5f0', titleFont: 'Source Sans 3', bodyFont: 'Source Sans 3', titleColor: '#22223b', textColor: '#33334a', footerColor: '#8d8da0', accent: '#c9ada7', accent2: '#c9c9d6', decor: 'right-strip',
    titleSlide: { background: '#22223b', titleColor: '#f2e9e4', textColor: '#c9ada7' } }),
  T('crop-marks', 'Crop Marks', 'Minimal', { background: '#f0eee8', titleFont: 'Barlow Condensed', bodyFont: 'Inter', titleColor: '#262626', textColor: '#3a3a3a', footerColor: '#949494', accent: '#c0392b', accent2: '#bdbdbd', decor: 'crop-marks',
    titleSlide: { background: '#262626', titleColor: '#ffffff', textColor: '#d9d4cc' } }),
  T('terminal', 'Terminal', 'Minimal', { background: '#f2f6f2', titleFont: 'JetBrains Mono', bodyFont: 'IBM Plex Sans', titleColor: '#1b1b1b', textColor: '#2f2f2f', footerColor: '#8f8f8f', accent: '#22c55e', accent2: '#c8e6c9', decor: 'title-rule',
    titleSlide: { background: '#0d1f12', titleColor: '#4ade80', textColor: '#a7f3d0' } }),
  T('linen', 'Linen', 'Minimal', { background: '#f6efe3', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#3b342c', textColor: '#463f37', footerColor: '#9b9286', accent: '#8c6b4f', accent2: '#d9c9b4', decor: 'double-rule',
    titleSlide: { background: '#e6d6bd', titleColor: '#3b342c', textColor: '#5a4f43' } }),
  T('glacier', 'Glacier', 'Minimal', { background: '#edf5f8', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#1d3640', textColor: '#30454e', footerColor: '#869aa3', accent: '#2b8cbe', accent2: '#a9d6e8', decor: 'side-bars',
    titleSlide: { background: '#1d3640', titleColor: '#ffffff', textColor: '#a9d6e8' } }),
  T('pewter', 'Pewter', 'Minimal', { background: '#eeeeea', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#2c2c2a', textColor: '#3b3b38', footerColor: '#8e8e89', accent: '#8a8a84', accent2: '#c4c4be', decor: 'two-tone-footer',
    titleSlide: { background: '#2c2c2a', titleColor: '#f3f3f1', textColor: '#c4c4be' } }),
  // ---------------- bold: poster fonts and strong color
  T('signal', 'Signal', 'Bold', { background: '#f4f5f8', titleFont: 'Archivo Black', bodyFont: 'Inter', titleColor: '#1d3557', textColor: '#26303d', footerColor: '#7f8996', accent: '#e63946', accent2: '#1d3557', decor: 'stripes', titleBold: false,
    titleSlide: { background: '#1d3557', titleColor: '#ffffff', textColor: '#c9d6e8' } }),
  T('marquee', 'Marquee', 'Bold', { background: '#fcf7ea', titleFont: 'Bebas Neue', bodyFont: 'Lato', titleColor: '#023047', textColor: '#21323b', footerColor: '#7c8b93', accent: '#ffb703', accent2: '#023047', decor: 'header-block', titleBold: false,
    titleSlide: { background: '#023047', titleColor: '#ffb703', textColor: '#e6eef2' } }),
  T('citrus', 'Citrus', 'Bold', { background: '#f6f9ec', titleFont: 'Montserrat', bodyFont: 'Lato', titleColor: '#24361a', textColor: '#30382b', footerColor: '#848c7e', accent: '#fb6107', accent2: '#ffd23f', decor: 'two-tone-footer',
    titleSlide: { background: '#4d7c0f', titleColor: '#ffffff', textColor: '#eaf5d3' } }),
  T('magenta', 'Magenta', 'Bold', { background: '#fbf2f6', titleFont: 'Montserrat', bodyFont: 'Inter', titleColor: '#3d0f24', textColor: '#3a2f34', footerColor: '#958890', accent: '#3d0f24', accent2: '#f8bbd0', decor: 'title-tab',
    titleSlide: { background: '#c2185b', titleColor: '#ffffff', textColor: '#fde2ec' } }),
  T('electric', 'Electric', 'Bold', { background: '#f3f2fb', titleFont: 'Oswald', bodyFont: 'Source Sans 3', titleColor: '#240a6b', textColor: '#2d2a3d', footerColor: '#8a87a0', accent: '#4cc9f0', accent2: '#f72585', decor: 'stripes', titleBold: false,
    titleSlide: { background: '#240a6b', titleColor: '#ffffff', textColor: '#c7d2fe' } }),
  T('tangerine', 'Tangerine', 'Bold', { background: '#fff5ec', titleFont: 'Oswald', bodyFont: 'Lato', titleColor: '#ffffff', textColor: '#3a2f28', footerColor: '#988b82', accent: '#e8630a', accent2: '#ffd8be', decor: 'title-band', titleBold: false }),
  T('night-shift', 'Night Shift', 'Bold', { background: '#f2f4f7', titleFont: 'Barlow Condensed', bodyFont: 'IBM Plex Sans', titleColor: '#111827', textColor: '#2b3340', footerColor: '#8a919c', accent: '#10b981', accent2: '#374151', decor: 'side-bars',
    titleSlide: { background: '#111827', titleColor: '#f9fafb', textColor: '#9ca3af' } }),
  T('poster-red', 'Poster Red', 'Bold', { background: '#fbf4ee', titleFont: 'Bebas Neue', bodyFont: 'Source Sans 3', titleColor: '#7f1414', textColor: '#332a2a', footerColor: '#958888', accent: '#1f1f1f', accent2: '#fecaca', decor: 'header-block', titleBold: false,
    titleSlide: { background: '#b91c1c', titleColor: '#ffffff', textColor: '#fee2e2' } }),
  // ---------------- classic: serif titles
  T('baskerville', 'Baskerville', 'Classic', { background: '#faf4e8', titleFont: 'Libre Baskerville', bodyFont: 'Source Serif 4', titleColor: '#3a2618', textColor: '#3d3229', footerColor: '#9a8c7f', accent: '#c8a46b', accent2: '#e8d8c3', decor: 'double-rule', titleBold: false,
    titleSlide: { background: '#3a2618', titleColor: '#f3e9d8', textColor: '#d9c7ae' } }),
  T('oxford', 'Oxford', 'Classic', { background: '#f2f4f8', titleFont: 'Merriweather', bodyFont: 'Source Sans 3', titleColor: '#002147', textColor: '#26303d', footerColor: '#7f8996', accent: '#c4a35a', accent2: '#b9c7d9', decor: 'header-block',
    titleSlide: { background: '#002147', titleColor: '#ffffff', textColor: '#b9c7d9' } }),
  T('cambridge', 'Cambridge Blue', 'Classic', { background: '#f1f7f3', titleFont: 'Source Serif 4', bodyFont: 'Source Sans 3', titleColor: '#1f3b2d', textColor: '#2d3a33', footerColor: '#87958d', accent: '#85b09a', accent2: '#d5e6dc', decor: 'top-bar',
    titleSlide: { background: '#1f3b2d', titleColor: '#ffffff', textColor: '#d5e6dc' } }),
  T('claret', 'Claret', 'Classic', { background: '#faf5f3', titleFont: 'Libre Baskerville', bodyFont: 'Lato', titleColor: '#4a1022', textColor: '#3a2e31', footerColor: '#968a8d', accent: '#7b1e3a', accent2: '#c98a9d', decor: 'two-tone-footer', titleBold: false,
    titleSlide: { background: '#4a1022', titleColor: '#ffffff', textColor: '#ecd3da' } }),
  T('journal', 'Journal', 'Classic', { background: '#f5f3ee', titleFont: 'Source Serif 4', bodyFont: 'Source Serif 4', titleColor: '#222222', textColor: '#333333', footerColor: '#8f8f8f', accent: '#b22a2a', accent2: '#b22a2a', decor: 'hairlines', titleBold: false,
    titleSlide: { background: '#1f2633', titleColor: '#ffffff', textColor: '#d5d9e0' } }),
  T('parchment', 'Parchment', 'Classic', { background: '#f4ead3', titleFont: 'Merriweather', bodyFont: 'Lato', titleColor: '#3f2d14', textColor: '#40362a', footerColor: '#9c8f7b', accent: '#9c6b30', accent2: '#e6d5b8', decor: 'crop-marks' }),
  T('ink-gold', 'Ink and Gold', 'Classic', { background: '#f6f5ef', titleFont: 'Libre Baskerville', bodyFont: 'Source Sans 3', titleColor: '#1b1f3b', textColor: '#2c2f45', footerColor: '#8b8ea3', accent: '#c9a227', accent2: '#1b1f3b', decor: 'title-rule', titleBold: false,
    titleSlide: { background: '#1b1f3b', titleColor: '#e9c46a', textColor: '#d9dbe6' } }),
  // ---------------- chemistry: rings and lab colors
  T('benzene', 'Benzene', 'Chemistry', { background: '#eef7f4', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#0b3b37', textColor: '#26363a', footerColor: '#7d8f90', accent: '#2dd4bf', accent2: '#0f766e', decor: 'hexagons',
    titleSlide: { background: '#0b3b37', titleColor: '#ffffff', textColor: '#99d5cc' } }),
  T('aromatic', 'Aromatic', 'Chemistry', { background: '#f5f2fd', titleFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', titleColor: '#2e1065', textColor: '#332d42', footerColor: '#8c879b', accent: '#7c3aed', accent2: '#ddd6fe', decor: 'hexagons',
    titleSlide: { background: '#2e1065', titleColor: '#ffffff', textColor: '#ddd6fe' } }),
  T('uv-lamp', 'UV Lamp', 'Chemistry', { background: '#f2f1fd', titleFont: 'Lato', bodyFont: 'Lato', titleColor: '#1e1b4b', textColor: '#2e2c45', footerColor: '#8987a2', accent: '#8b5cf6', accent2: '#c7d2fe', decor: 'right-strip',
    titleSlide: { background: '#1e1b4b', titleColor: '#a5b4fc', textColor: '#e0e7ff' } }),
  T('fume-hood', 'Fume Hood', 'Chemistry', { background: '#f3f3f0', titleFont: 'Barlow Condensed', bodyFont: 'IBM Plex Sans', titleColor: '#1f2937', textColor: '#2b3340', footerColor: '#8a919c', accent: '#f59e0b', accent2: '#1f2937', decor: 'stripes',
    titleSlide: { background: '#1f2937', titleColor: '#ffffff', textColor: '#d1d5db' } }),
  T('flame-test', 'Flame Test', 'Chemistry', { background: '#fdf4ea', titleFont: 'Montserrat', bodyFont: 'Lato', titleColor: '#3b1d0b', textColor: '#3a322c', footerColor: '#958a82', accent: '#ea580c', accent2: '#16a34a', decor: 'two-tone-footer',
    titleSlide: { background: '#3b1d0b', titleColor: '#fdba74', textColor: '#fde7d3' } }),
  T('cobalt-chloride', 'Cobalt Chloride', 'Chemistry', { background: '#f1f3fb', titleFont: 'Inter', bodyFont: 'Inter', titleColor: '#172554', textColor: '#28304a', footerColor: '#878ea6', accent: '#f472b6', accent2: '#93c5fd', decor: 'double-rule',
    titleSlide: { background: '#1e40af', titleColor: '#ffffff', textColor: '#fbcfe8' } }),
  T('silica', 'Silica', 'Chemistry', { background: '#f3f3ec', titleFont: 'Source Sans 3', bodyFont: 'Source Sans 3', titleColor: '#1e293b', textColor: '#334155', footerColor: '#8d96a3', accent: '#64748b', accent2: '#cbd5e1', decor: 'hexagons',
    titleSlide: { background: '#334155', titleColor: '#ffffff', textColor: '#cbd5e1' } }),
];

/** The master with a template's look: its fonts, colours, background and shapes; everything else is kept. */
export function applyTemplate(m: Master, t: SlideTemplate): Master {
  return {
    ...m,
    background: t.background, titleFont: t.titleFont, bodyFont: t.bodyFont,
    titleColor: t.titleColor, textColor: t.textColor, footerColor: t.footerColor,
    accent: t.accent, accent2: t.accent2, decor: t.decor,
    titleBold: t.titleBold ?? true,
    titleSlide: t.titleSlide ? { ...t.titleSlide } : undefined,
    // a template's background is a colour: it takes the place of a picture or gradient on every slide
    fill: undefined,
    template: t.name,
    // and its look takes the place of a PowerPoint template's artwork and theme
    art: undefined,
  };
}

/** A theme of your own from a deck's look (New Theme from This Deck), named `name`. */
export function themeFromMaster(m: Master, name: string, id: string): SlideTemplate {
  return {
    id, name, group: 'Mine',
    background: m.background, titleFont: m.titleFont, bodyFont: m.bodyFont,
    titleColor: m.titleColor, textColor: m.textColor, footerColor: m.footerColor,
    accent: m.accent, accent2: m.accent2, decor: m.decor, titleBold: m.titleBold,
    ...(m.titleSlide ? { titleSlide: { background: m.titleSlide.background, titleColor: m.titleSlide.titleColor, textColor: m.titleSlide.textColor, ...(m.titleSlide.footerColor ? { footerColor: m.titleSlide.footerColor } : {}) } } : {}),
  };
}

/** An id for a new theme of your own, not yet used. */
export function newThemeId(mine: SlideTemplate[]): string {
  let n = 1;
  while (mine.some((t) => t.id === `mine-${n}`)) n++;
  return `mine-${n}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Your own themes from the settings file (anything unreadable is left out). */
export function parseThemes(v: unknown): SlideTemplate[] {
  if (!Array.isArray(v)) return [];
  const out: SlideTemplate[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
    const col = (k: string, d: string) => (HEX.test(str(k)) ? str(k) : d);
    if (!str('id') || !str('name')) continue;
    const ts = r.titleSlide && typeof r.titleSlide === 'object' ? r.titleSlide as Record<string, unknown> : null;
    const tcol = (k: string, d: string) => (typeof ts?.[k] === 'string' && HEX.test(ts[k] as string) ? ts[k] as string : d);
    out.push({
      id: str('id'), name: str('name'), group: 'Mine',
      background: col('background', '#ffffff'), titleFont: str('titleFont') || 'Arial', bodyFont: str('bodyFont') || 'Arial',
      titleColor: col('titleColor', '#000000'), textColor: col('textColor', '#000000'), footerColor: col('footerColor', '#7f7f7f'),
      accent: col('accent', '#2f6fdf'), accent2: col('accent2', '#9aa5b1'),
      decor: DECORS.some((d) => d.id === r.decor) ? r.decor as Decor : 'none',
      titleBold: r.titleBold !== false,
      ...(ts ? { titleSlide: { background: tcol('background', '#1d3557'), titleColor: tcol('titleColor', '#ffffff'), textColor: tcol('textColor', '#d9e2ec') } } : {}),
    });
  }
  return out;
}
