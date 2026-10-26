// File > Print: the pages are put in the window (hidden on screen), the window's print style
// shows only them, and the system's Print dialog takes it from there (printer, copies, which
// pages, or Save as PDF). They are taken away again once printing is done.
// In the Windows app, WebView2's Print window doesn't follow the pages' size and orientation
// (a landscape page came out turned on portrait paper, and with the browser's header and
// footer), so the printer, copies and pages are asked here and the app prints with WebView2's
// own print settings (src-tauri/src/print.rs).

import { invoke, isTauri } from '@tauri-apps/api/core';
import { pageSizeCss } from '../print-layout';
import { ask } from './ask';
import { showError } from '../io/files';

let root: HTMLDivElement | null = null;
let pageRule: HTMLStyleElement | null = null;

function clear(): void {
  root?.remove();
  pageRule?.remove();
  root = pageRule = null;
  document.body.classList.remove('printing');
}

/**
 * Print pages of one size (w × h points), each an SVG or HTML laid out at that size. Fonts and
 * pictures are those of the window, so text prints as on screen.
 */
export function printPages(what: { pages: string[]; w: number; h: number }): void {
  clear();
  root = document.createElement('div');
  root.id = 'print-root';
  pageRule = document.createElement('style');
  pageRule.textContent = `@page { size: ${pageSizeCss(what.w, what.h)}; margin: 0; }`;
  for (const svg of what.pages) {
    const p = document.createElement('div');
    p.className = 'print-page';
    p.style.width = `${what.w}pt`;
    p.style.height = `${what.h}pt`;
    p.innerHTML = svg;
    root.append(p);
  }
  document.head.append(pageRule);
  document.body.append(root);
  document.body.classList.add('printing');
  // let pictures load before the dialog takes its copy
  const pics = [...root.querySelectorAll('img')].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }));
  void Promise.all(pics).then(() => {
    if (onWindows()) void printHere(what);
    else systemPrint();
  });
}

function systemPrint(): void {
  window.addEventListener('afterprint', clear, { once: true });
  requestAnimationFrame(() => window.print());
}

const onWindows = () => isTauri() && /Windows/.test(navigator.userAgent);

/** The printer last printed to (kept while the app is open). */
let lastPrinter = '';

/** The Windows app: printer, copies and pages asked here, then printed at the pages' own size. */
async function printHere(what: { pages: string[]; w: number; h: number }): Promise<void> {
  const list = await invoke<{ names: string[]; default: string | null }>('printers').catch(() => null);
  if (!list?.names.length) { systemPrint(); return; }
  const printer = list.names.includes(lastPrinter) ? lastPrinter : list.default && list.names.includes(list.default) ? list.default : list.names[0];
  const n = what.pages.length;
  const v = await ask('Print', [
    { name: 'printer', label: 'Printer', value: printer, options: list.names.map((p) => ({ value: p, label: p })) },
    { name: 'copies', label: 'Copies', value: '1', type: 'number' },
    ...(n > 1 ? [{ name: 'pages', label: 'Pages', value: '', placeholder: `All ${n}`, help: 'Such as 1-3, 5' }] : []),
  ], { ok: 'Print', note: `${n} page${n > 1 ? 's' : ''}, ${inches(what.w)} × ${inches(what.h)} in, ${what.w > what.h ? 'landscape' : 'portrait'}. Microsoft Print to PDF saves a PDF.` });
  if (!v) { clear(); return; }
  lastPrinter = v.printer;
  const pages = (v.pages ?? '').replace(/\s+/g, '');
  if (pages && !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(pages)) { clear(); await showError('Pages are page numbers or ranges, separated by commas: 1-3, 5'); return; }
  const copies = Math.max(1, Math.min(999, Math.round(Number(v.copies) || 1)));
  try {
    await invoke('print_page', { printer: v.printer, w: what.w, h: what.h, copies, pages });
    clear();
  } catch (e) {
    // a WebView2 too old for its print settings: the system's Print window instead
    if (String(e).startsWith('unsupported')) { systemPrint(); return; }
    clear();
    await showError(`Could not print to ${v.printer}: ${String(e)}`);
  }
}

const inches = (pt: number) => String(+(pt / 72).toFixed(2));
