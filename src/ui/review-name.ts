// The name put on tracked changes and comments, asked for in one place (documents, sheets and slides).
import { reviewAuthor, setReviewAuthor } from '../document/revisions';
import { ask } from './ask';

/** Ask for the name put on your changes (kept in your settings). False when none was given. */
export async function askReviewName(changed?: () => void): Promise<boolean> {
  const got = await ask('Your Name', [{ name: 'name', label: 'Name shown on your changes', value: reviewAuthor() }], { ok: 'Save', note: 'Word shows this name on your changes too. Change it any time here or in Edit > Settings.' });
  if (!got || !got.name.trim()) return false;
  setReviewAuthor(got.name);
  changed?.();
  return true;
}
