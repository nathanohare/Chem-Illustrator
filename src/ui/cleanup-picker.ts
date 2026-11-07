// Structure ▸ Clean Up Options…: the ways Clean Up can lay out the picked structures, side by
// side as small pictures, with buttons to turn or flip them all before choosing one.

export interface CleanUpPick {
  /** Which way (an index into the labels given). */
  option: number;
  /** Degrees anticlockwise on screen. */
  turn: number;
  /** Mirrored left to right (wedges turned over, so the molecule stays the same). */
  mirror: boolean;
}

/**
 * Ask which way to lay the structures out. `preview(k, turn, mirror)` draws way k, turned and
 * flipped, as SVG markup.
 */
export function askCleanUpOption(labels: string[], preview: (k: number, turn: number, mirror: boolean) => string): Promise<CleanUpPick | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask cleanup-picker';
    d.setAttribute('aria-label', 'Clean Up options');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2 data-info="Pick a layout. Turn or flip them all first if you like; flipping keeps the molecule the same (its wedges turn over).">Clean Up Options</h2>
      <div class="cleanup-picks" role="radiogroup" aria-label="Layouts"></div>
      <div class="cleanup-turns">
        <button type="button" data-turn="15" title="Rotate 15° counterclockwise">⟲ 15°</button>
        <button type="button" data-turn="-15" title="Rotate 15° clockwise">⟳ 15°</button>
        <button type="button" data-turn="90" title="Rotate 90° counterclockwise">⟲ 90°</button>
        <button type="button" data-flip="h" title="Flip horizontal (left-right)">Flip ↔</button>
        <button type="button" data-flip="v" title="Flip vertical (top-bottom)">Flip ↕</button>
        <button type="button" data-reset title="Reset to Clean Up's result">Reset</button>
      </div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Use This Layout</button></p>`;
    const picks = form.querySelector<HTMLDivElement>('.cleanup-picks')!;
    let chosen = 0, turn = 0, mirror = false;
    const cards = labels.map((label, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cleanup-pick';
      b.setAttribute('role', 'radio');
      b.innerHTML = `<span class="cleanup-pic"></span><span class="cleanup-label"></span>`;
      b.querySelector('.cleanup-label')!.textContent = label;
      b.addEventListener('click', () => { chosen = k; mark(); });
      b.addEventListener('dblclick', () => { chosen = k; form.requestSubmit(); });
      picks.append(b);
      return b;
    });
    const mark = () => cards.forEach((b, k) => { b.classList.toggle('on', k === chosen); b.setAttribute('aria-checked', String(k === chosen)); b.tabIndex = k === chosen ? 0 : -1; });
    const draw = () => cards.forEach((b, k) => { b.querySelector('.cleanup-pic')!.innerHTML = preview(k, turn, mirror); });
    picks.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      chosen = (chosen + step + cards.length) % cards.length;
      mark();
      cards[chosen].focus();
    });
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-turn]')) b.addEventListener('click', () => { turn = (turn + Number(b.dataset.turn)) % 360; draw(); });
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-flip]')) b.addEventListener('click', () => {
      // flipping top to bottom is flipping left to right and turning half way round
      mirror = !mirror;
      turn = -turn + (b.dataset.flip === 'v' ? 180 : 0);
      turn = ((turn % 360) + 360) % 360;
      draw();
    });
    form.querySelector('[data-reset]')!.addEventListener('click', () => { turn = 0; mirror = false; draw(); });
    mark();
    draw();
    d.append(form);
    document.body.append(d);
    const finish = (v: CleanUpPick | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      d.close();
      finish({ option: chosen, turn, mirror });
    });
    d.showModal();
    cards[0]?.focus();
  });
}
