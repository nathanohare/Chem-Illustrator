// @vitest-environment jsdom
// UI rule 2 (Nate, 2026-11-02): help text sits behind an "i" beside its header, never on a line
// of its own.
import { describe, expect, it } from 'vitest';
import { addInfo, foldIntoInfo, infoFromAttrs, setInfo } from '../src/ui/info-tip';
import { ask } from '../src/ui/ask';

// jsdom has no showModal
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.show ??= function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };

describe('info tips', () => {
  it('puts an "i" with the text at the end of the header, before a close button', () => {
    const h = document.createElement('h2');
    h.append('Title', Object.assign(document.createElement('button'), { textContent: '×' }));
    const i = addInfo(h, 'How it works')!;
    expect(i.textContent).toBe('i');
    expect(i.title).toBe('How it works');
    expect(i.nextElementSibling?.tagName).toBe('BUTTON');
    expect(addInfo(h, '')).toBeNull();
  });

  it('folds a help line into an "i" that follows the line as it changes', async () => {
    const h = document.createElement('h3');
    const p = document.createElement('p');
    p.textContent = 'First';
    const i = foldIntoInfo(p, h)!;
    expect(p.hidden).toBe(true);
    expect(i.title).toBe('First');
    p.textContent = 'Second';
    await Promise.resolve();
    expect(i.title).toBe('Second');
    setInfo(i, '');
    expect(i.hidden).toBe(true);
  });

  it('turns data-info attributes into "i" tips once', () => {
    const d = document.createElement('div');
    d.innerHTML = '<h2 data-info="Help here">Window</h2>';
    infoFromAttrs(d);
    infoFromAttrs(d);
    expect(d.querySelectorAll('.info-icon').length).toBe(1);
  });

  it('a click on the "i" inside a label does not tick the box', () => {
    const l = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const name = document.createElement('span');
    name.textContent = 'Option';
    l.append(box, name);
    document.body.append(l);
    addInfo(name, 'What it does')!.click();
    expect(box.checked).toBe(false);
    expect(document.querySelector('.info-pop')?.textContent).toBe('What it does');
    l.remove();
  });

  it('ask() puts its note beside the title and field help beside the field name', () => {
    void ask('Page Setup', [{ name: 'w', label: 'Width', value: '1', help: 'In inches' }], { note: 'About the page' });
    const d = document.querySelector('dialog.ask')!;
    expect(d.querySelector('h2 .info-icon')?.getAttribute('title')).toBe('About the page');
    expect(d.querySelector('.ask-name .info-icon')?.getAttribute('title')).toBe('In inches');
    expect(d.querySelector('p.muted, .ask-help')).toBeNull();
    d.querySelector<HTMLButtonElement>('.ask-buttons button')!.click();
  });

  it('ask() with nothing to fill in keeps its note as the message', () => {
    void ask('Saved', [], { note: 'The file was saved.', noCancel: true });
    const d = document.querySelector('dialog.ask')!;
    expect(d.querySelector('p.muted')?.textContent).toBe('The file was saved.');
    expect(d.querySelector('.info-icon')).toBeNull();
  });
});
