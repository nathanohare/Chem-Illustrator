// Settings ▸ Apps and System: how the app works with the computer and other programs. Which kinds
// of file it offers to open from Explorer ("Open with"), and a button to Windows' Default apps
// page, where the person can make it the default (Windows keeps that choice for the person: no
// app can make itself the default). On macOS and Linux the installer lists the types, and the page
// says where to choose the default. Then drawings in Word, PowerPoint and Excel, and documents
// from other programs.

import { addInfo, foldIntoInfo } from './info-tip';
import { showDialog } from './dialog-host';

export const FILE_TYPES: { ext: string; label: string; chemistry: boolean }[] = [
  { ext: 'cdxml', label: 'ChemDraw XML drawings (.cdxml)', chemistry: true },
  { ext: 'cdx', label: 'ChemDraw drawings (.cdx)', chemistry: true },
  { ext: 'cds', label: 'ChemDraw style sheets (.cds)', chemistry: true },
  { ext: 'mol', label: 'Molfiles (.mol)', chemistry: true },
  { ext: 'sdf', label: 'Structure-data files (.sdf)', chemistry: true },
  { ext: 'rxn', label: 'Reaction files (.rxn)', chemistry: true },
  { ext: 'mrv', label: 'Marvin documents (.mrv)', chemistry: true },
  { ext: 'ket', label: 'Ketcher drawings (.ket)', chemistry: true },
  { ext: 'cml', label: 'Chemical Markup Language (.cml)', chemistry: true },
  { ext: 'docx', label: 'Word documents (.docx)', chemistry: false },
  { ext: 'pptx', label: 'PowerPoint presentations (.pptx)', chemistry: false },
  { ext: 'xlsx', label: 'Excel workbooks (.xlsx)', chemistry: false },
];

export interface FileTypesHost {
  /** 'windows', 'mac', 'linux', or 'web'. */
  platform: 'windows' | 'mac' | 'linux' | 'web';
  get(): Promise<string[]>;
  set(types: string[]): Promise<void>;
  openDefaults(): Promise<void>;
  /** Drawings in Word, PowerPoint and Excel that open here when double-clicked (Windows). */
  objects: { get(): Promise<boolean>; set(on: boolean): Promise<void> };
  /** Offer to make structures figures when a document whose structures aren't figures is opened. */
  figures: { get(): boolean; set(on: boolean): void };
  flash(msg: string): void;
}

/** The page's title, and its name in the Settings window's list. */
export const APPS_PAGE_TITLE = 'Apps and System';

export async function fileTypesPage(host: FileTypesHost): Promise<void> {
  const d = document.createElement('dialog');
  d.className = 'ask file-types';
  const form = document.createElement('form');
  const h = document.createElement('h2');
  h.textContent = APPS_PAGE_TITLE;
  form.append(h);
  const subhead = (text: string, help?: string) => {
    const sub = document.createElement('h3');
    sub.className = 'ask-subhead';
    sub.textContent = text;
    if (help) addInfo(sub, help);
    form.append(sub);
  };
  // documents from Word and other programs: on every computer
  const figRow = document.createElement('label');
  figRow.className = 'ask-row ask-check';
  const figBox = document.createElement('input');
  figBox.type = 'checkbox';
  const figWas = host.figures.get();
  figBox.checked = figWas;
  const figName = document.createElement('span');
  figName.textContent = 'Offer to make structures figures when opening a document';
  addInfo(figName, 'A bar over the pages offers Make Figures when a document\'s structures aren\'t figures yet (a Word file from ChemDraw, for one). Don\'t Ask for This File on the bar turns it off for one document. Make All Structures Figures… stays on a structure\'s right-click menu either way.');
  figRow.append(figBox, figName);
  const saveFigures = () => { if (figBox.checked !== figWas) host.figures.set(figBox.checked); };
  const note = (text: string) => {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    form.append(p);
    return p;
  };
  const buttons = document.createElement('p');
  buttons.className = 'ask-buttons';
  const done = () => { if (d.open) d.close(); d.remove(); };

  if (host.platform !== 'windows') {
    subhead('File Types');
    note(host.platform === 'web'
      ? 'The web version opens files from File ▸ Open, or dropped on the window. The desktop app can be opened from your files directly.'
      : host.platform === 'mac'
        ? 'Chem Illustrator is offered for .cdxml, .cdx, .cds, .mol, .sdf, .rxn, .mrv, .ket, .cml, .docx, .pptx and .xlsx files: right-click a file in Finder and choose Open With. To always open a kind of file here, choose File ▸ Get Info in Finder, pick Chem Illustrator under Open with, and click Change All.'
        : 'Chem Illustrator is offered for .cdxml, .cdx, .cds, .mol, .sdf, .rxn, .mrv, .ket, .cml, .docx, .pptx and .xlsx files in your file manager\'s Open With menu. Your desktop\'s settings (Default Applications) choose which program opens each kind of file.');
    subhead('Documents from Other Programs');
    form.append(figRow);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', done);
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primary';
    ok.textContent = 'Save';
    buttons.append(cancel, ok);
    form.append(buttons);
    form.addEventListener('submit', (e) => { e.preventDefault(); saveFigures(); done(); });
  } else {
    subhead('File Types', 'Checked file types list Chem Illustrator under Open With in Explorer. Your default programs (ChemDraw, Word, PowerPoint, Excel) don\'t change.');
    const now = new Set(await host.get().catch(() => [] as string[]));
    const boxes = new Map<string, HTMLInputElement>();
    for (const t of FILE_TYPES) {
      const row = document.createElement('label');
      row.className = 'ask-row ask-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = now.has(t.ext);
      boxes.set(t.ext, box);
      const name = document.createElement('span');
      name.textContent = t.label;
      row.append(box, name);
      form.append(row);
    }
    const defaults = document.createElement('p');
    defaults.className = 'ask-help muted';
    defaults.textContent = 'To open a kind of file here when you double-click it, make Chem Illustrator its default in Windows Settings. Windows asks you to choose there itself; no program is allowed to make itself the default.';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Choose Defaults in Windows Settings…';
    open.addEventListener('click', () => void host.openDefaults().catch((e) => host.flash(String(e))));
    foldIntoInfo(defaults, open);
    form.append(defaults, open);
    const objRow = document.createElement('label');
    objRow.className = 'ask-row ask-check';
    const objBox = document.createElement('input');
    objBox.type = 'checkbox';
    const objWas = await host.objects.get().catch(() => false);
    objBox.checked = objWas;
    const objName = document.createElement('span');
    objName.textContent = 'Drawings pasted into Word, PowerPoint and Excel open here when double-clicked';
    objRow.append(objBox, objName);
    const objHelp = document.createElement('p');
    objHelp.className = 'ask-help muted';
    objHelp.textContent = 'Pasted drawings become Chem Illustrator objects: double-click one in Word to edit it here, and Save updates it. Otherwise they paste as pictures (still editable when copied back here). Also in Word under Insert ▸ Object.';
    foldIntoInfo(objHelp, objName);
    subhead('Word, PowerPoint and Excel');
    form.append(objRow, objHelp, figRow);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', done);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary';
    save.textContent = 'Save';
    buttons.append(cancel, save);
    form.append(buttons);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const types = [...boxes].filter(([, b]) => b.checked).map(([ext]) => ext);
      saveFigures();
      try {
        if (objBox.checked !== objWas) await host.objects.set(objBox.checked);
        // (said only when the list changed)
        if (types.length !== now.size || types.some((t) => !now.has(t))) {
          await host.set(types);
          host.flash(types.length ? `Chem Illustrator is now under "Open with" for ${types.map((t) => `.${t}`).join(', ')}.` : 'Chem Illustrator is off every "Open with" list.');
        }
      } catch (err) {
        host.flash(String(err));
      }
      done();
    });
  }
  d.append(form);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  showDialog(d);
}
