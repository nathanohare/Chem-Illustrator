// A number box that keeps what is typed in a range: the spinner stops at the ends, and a number
// typed outside it is brought back to the nearest end when the box is left (a blank box stays blank).

/** Keep `input` between `min` and `max`; its tip says the range, after `unit` when given. */
export function keepInRange(input: HTMLInputElement, min: number, max: number, unit = ''): void {
  input.min = String(min);
  input.max = String(max);
  const range = `From ${min} to ${max}${unit ? ' ' + unit : ''}`;
  input.title = input.title ? `${input.title}. ${range}` : range;
  input.addEventListener('change', () => {
    if (input.value.trim() === '') return;
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    const kept = Math.min(max, Math.max(min, v));
    if (kept !== v) {
      input.value = String(kept);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}
