// @vitest-environment jsdom
// Insert ▸ Action Button… (review item 49): a gallery of ready-made buttons, each starting with
// the action it usually has, the action changed from the drop-down under it, and the back,
// home and next set at once.
import { describe, expect, it } from 'vitest';
import { askActionButton } from '../src/ui/action-button-dialog';
import { GEO_BY_ID } from '../src/design/geo';

(HTMLDialogElement.prototype as unknown as { showModal: () => void }).showModal = function (this: HTMLDialogElement) { this.open = true; };
(HTMLDialogElement.prototype as unknown as { close: () => void }).close = function (this: HTMLDialogElement) { this.open = false; };

const slides = [{ link: '#slide=1', label: 'Slide 1' }, { link: '#slide=7', label: 'Slide 2: Results' }];
const submit = () => document.querySelector<HTMLFormElement>('.action-button-dialog form')!.requestSubmit();
const tile = (id: string) => document.querySelector<HTMLButtonElement>(`.ab-tile[data-geo="${id}"]`)!;
const action = () => document.querySelector<HTMLSelectElement>('.action-button-dialog select[name=action]')!;

describe('Action Button window', () => {
  it('offers the PowerPoint buttons, information and document among them, and the navigation set', async () => {
    const p = askActionButton(slides);
    for (const id of ['actBack', 'actNext', 'actFirst', 'actLast', 'actHome', 'actReturn', 'actInfo', 'actDoc', 'actBlank', 'set']) expect(tile(id)).toBeTruthy();
    expect(GEO_BY_ID.get('actInfo')!.prst).toBe('actionButtonInformation');
    // next is picked to start, going to the next slide
    expect(action().value).toBe('#next');
    submit();
    expect(await p).toEqual({ geo: 'actNext', link: '#next' });
  });

  it('a button starts with its usual action, which the drop-down changes, to a slide too', async () => {
    const p = askActionButton(slides);
    tile('actReturn').click();
    expect(action().value).toBe('#return');
    action().value = 'slide';
    action().dispatchEvent(new Event('change'));
    document.querySelector<HTMLSelectElement>('.action-button-dialog select[name=slide]')!.value = '#slide=7';
    submit();
    expect(await p).toEqual({ geo: 'actReturn', link: '#slide=7' });
  });

  it('the navigation set needs no action of its own', async () => {
    const p = askActionButton(slides);
    tile('set').click();
    expect(action().disabled).toBe(true);
    submit();
    expect(await p).toEqual({ geo: 'set', link: '' });
  });
});
